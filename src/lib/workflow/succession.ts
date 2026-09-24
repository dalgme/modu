import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { assignMentor, createCase } from '@/lib/workflow/cases';
import { afterAssignmentConfirmed, autoMatchMentee } from '@/lib/matching/auto-match';
import { fetchAllIn } from '@/lib/supabase/paginate';
import type { Tables } from '@/types/database';

export type SuccessionKind = 'succession' | 'relocation';

export interface SuccessionResult {
  created: {
    sourceCaseId: string;
    caseId: string;
    businessName: string;
    mentorAssigned: boolean;
    /** keepMentor 였는데 배정에 실패한 사유 (정원·지정·상태 등) */
    mentorError?: string | null;
    /** 멘토를 유지하지 않았거나 실패했을 때 자동 매칭(재배치 희망·추천) 결과 */
    autoMatched?: boolean;
    docsCopied?: number;
  }[];
  skipped: { sourceCaseId: string; businessName: string; reason: string }[];
}

export interface SucceedCasesInput {
  programId: string;
  actorId: string;
  sourceCaseIds: string[];
  targetGroupId: string;
  keepMentor: boolean;
  /** 대상 그룹 필수서류 슬롯과 키가 같은 이전 케이스 서류를 복사 (기본 on) */
  copyRequiredDocs?: boolean;
  /** relocation = 중도 종료(탈락) 케이스의 재배치 등록 — 멘토 유지 없음 */
  kind?: SuccessionKind;
}

/** 멘토가 그룹 지정을 쓰고 있고 대상 그룹이 빠져 있으면 대상 그룹 지정을 추가해 assertMentorEligible 을 통과시킨다 (승계는 운영사 의도이므로) */
async function ensureDesignationForTarget(mentorId: string, targetGroupId: string, programId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: designated } = await admin
    .from('support_type_members')
    .select('support_type_id, is_active, support_types!inner(program_id)')
    .eq('user_id', mentorId)
    .eq('member_role', 'mentor')
    .eq('support_types.program_id', programId);
  const active = (designated ?? []).filter((r) => r.is_active).map((r) => r.support_type_id);
  if (active.length === 0 || active.includes(targetGroupId)) return false;
  const existing = (designated ?? []).find((r) => r.support_type_id === targetGroupId);
  if (existing) {
    await admin.from('support_type_members').update({ is_active: true, left_at: null }).eq('support_type_id', targetGroupId).eq('user_id', mentorId);
  } else {
    await admin.from('support_type_members').insert({ support_type_id: targetGroupId, user_id: mentorId, member_role: 'mentor', is_active: true, left_at: null });
  }
  return true;
}

/**
 * 대상 그룹 필수서류 키(req:/req1:)와 같은 이전 케이스 서류를 새 케이스로 복사.
 * 스토리지 객체도 새 케이스 폴더(`{caseId}/…`)로 복사한다 — 케이스 범위 signed URL·RLS 경로 규칙 유지. 출처는 documents.copied_from_case_id (0081).
 */
async function copyRequiredDocuments(sourceCaseId: string, targetCaseId: string, targetGroupId: string, actorId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: slots } = await admin.from('support_type_documents').select('doc_key, multiple').eq('support_type_id', targetGroupId);
  if (!slots || slots.length === 0) return 0;
  const keys = slots.flatMap((s) => [`req:${s.doc_key}`, `req1:${s.doc_key}`]);
  const { data: docs } = await admin.from('documents').select('*').eq('case_id', sourceCaseId).in('doc_key', keys);
  let n = 0;
  for (const d of docs ?? []) {
    const basename = d.storage_path.split('/').pop();
    if (!basename) continue;
    const dest = `${targetCaseId}/${basename}`;
    try {
      const { error: copyErr } = await admin.storage.from('documents').copy(d.storage_path, dest);
      if (copyErr) {
        console.error('succession doc copy failed:', copyErr.message);
        continue;
      }
      // 단일본(req1:) 은 DB 유니크 인덱스 — 새 케이스에는 아직 없으므로 insert 로 충분
      const { error } = await admin.from('documents').insert({
        case_id: targetCaseId,
        doc_key: d.doc_key,
        doc_name: d.doc_name,
        storage_path: dest,
        sha256: d.sha256,
        uploaded_by: actorId,
        uploaded_role: 'nextlab',
        file_size: d.file_size,
        mime_type: d.mime_type,
        mentor_visible: d.mentor_visible,
        copied_from_case_id: sourceCaseId,
      });
      if (error) {
        console.error('succession doc row insert failed:', error.message);
        await admin.storage.from('documents').remove([dest]);
        continue;
      }
      n += 1;
    } catch (err) {
      console.error('succession doc copy threw:', err instanceof Error ? err.message : err);
    }
  }
  return n;
}

/**
 * 그룹 간 승계 개설 (docs §8) / 재배치 등록 (P30): 원천 케이스마다 대상 그룹에 **새 케이스**를 만들고 predecessor_case_id 로 연결한다.
 * 멘티 계정은 재발급하지 않고 mentee_id 를 그대로 연결. 프로필(순위·희망 멘토 제외)·팀원·등록 메모·필수서류(옵션)를 복사한다.
 * keepMentor 면 원천의 마지막 멘토를 그대로 배정(T2) — 그룹 지정이 막으면 대상 그룹 지정을 추가한 뒤 배정. 실패 사유는 결과에 남긴다.
 * 멘토를 유지하지 않거나 실패하면 자동 매칭(재배치 희망 멘토 확정 또는 추천)을 시도한다.
 * 같은 프로그램 안에서만 가능(계정이 프로그램에 묶임).
 */
export async function succeedCases(input: SucceedCasesInput): Promise<{ ok: true; result: SuccessionResult } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const kind: SuccessionKind = input.kind ?? 'succession';
  const keepMentor = kind === 'relocation' ? false : input.keepMentor;
  const copyDocs = input.copyRequiredDocs ?? true;
  const { data: target } = await admin.from('support_types').select('id, program_id, status, name').eq('id', input.targetGroupId).maybeSingle();
  if (!target || target.program_id !== input.programId) return { ok: false, error: '대상 그룹이 이 행사의 그룹이 아닙니다.' };
  if (target.status !== 'active') return { ok: false, error: '종료된 그룹으로는 승계할 수 없습니다.' };
  const ids = Array.from(new Set(input.sourceCaseIds));
  if (ids.length === 0) return { ok: false, error: '승계할 케이스를 선택하세요.' };
  const sources = await fetchAllIn<Tables<'cases'>>(ids, (chunk, from, to) => admin.from('cases').select('*').in('id', chunk).eq('program_id', input.programId).range(from, to));
  if (sources.length !== ids.length) return { ok: false, error: '이 행사의 케이스가 아닌 항목이 있습니다.' };

  const result: SuccessionResult = { created: [], skipped: [] };
  for (const s of sources) {
    if (kind === 'relocation' && s.status !== 'withdrawn') {
      result.skipped.push({ sourceCaseId: s.id, businessName: s.business_name, reason: '재배치는 중도 종료(탈락) 케이스만 가능' });
      continue;
    }
    if (s.support_type_id === input.targetGroupId && kind === 'succession') {
      result.skipped.push({ sourceCaseId: s.id, businessName: s.business_name, reason: '이미 대상 그룹의 케이스' });
      continue;
    }
    // 이미 승계된 케이스(중도 종료된 승계 케이스는 제외) / 대상 그룹에 진행 중 케이스가 있는 멘티
    const { data: dup } = await admin
      .from('cases')
      .select('id, status')
      .eq('support_type_id', input.targetGroupId)
      .or(`predecessor_case_id.eq.${s.id}${s.mentee_id ? `,mentee_id.eq.${s.mentee_id}` : ''}`)
      .neq('status', 'withdrawn')
      .limit(1);
    if (dup && dup.length > 0) {
      result.skipped.push({ sourceCaseId: s.id, businessName: s.business_name, reason: '대상 그룹에 이미 승계(진행 중) 케이스 있음' });
      continue;
    }
    const created = await createCase({
      programId: input.programId,
      createdBy: input.actorId,
      support_type_id: input.targetGroupId,
      business_name: s.business_name,
      owner_name: s.owner_name,
      phone: s.phone,
      email: s.email ?? undefined,
      business_reg_no: s.business_reg_no ?? undefined,
      address: s.address ?? undefined,
      business_type: s.business_type ?? undefined,
      item: s.item ?? undefined,
      opened_at: s.opened_at ?? undefined,
      employee_count: s.employee_count ?? undefined,
      predecessorCaseId: s.id,
      menteeId: s.mentee_id,
    });
    if (!created.ok) {
      result.skipped.push({ sourceCaseId: s.id, businessName: s.business_name, reason: created.error });
      continue;
    }
    // 등록 메모 승계
    if (s.intake_note) await admin.from('cases').update({ intake_note: s.intake_note }).eq('id', created.caseId);
    if (kind === 'relocation') {
      await admin.from('case_status_history').insert({ case_id: created.caseId, from_status: 'registered', to_status: 'registered', changed_by: input.actorId, note: `재배치 등록 (이전 케이스 중도 종료: ${s.withdrawn_reason ?? '-'})` });
    }
    // 프로필(태그) 복사 — 매칭 추천용. 순위·희망 멘토는 새 라운드에서 다시 정한다.
    const { data: prof } = await admin.from('mentee_profiles').select('*').eq('case_id', s.id).maybeSingle();
    if (prof) {
      const { case_id: _c, created_at: _ca, updated_at: _ua, ...rest } = prof;
      void _c; void _ca; void _ua;
      const { error: profErr } = await admin.from('mentee_profiles').upsert({ ...rest, case_id: created.caseId, rank: null, preferred_mentor: null }, { onConflict: 'case_id' });
      if (profErr) console.error('succession profile copy failed:', profErr.message);
    }
    // 팀원 복사
    const { data: team } = await admin.from('case_team_members').select('*').eq('case_id', s.id).order('sort_order');
    if (team && team.length > 0) {
      const { error: teamErr } = await admin.from('case_team_members').insert(team.map((t) => ({ case_id: created.caseId, program_id: input.programId, name: t.name, phone: t.phone, email: t.email, is_representative: t.is_representative, member_role: t.member_role, sort_order: t.sort_order })));
      if (teamErr) console.error('succession team copy failed:', teamErr.message);
    }
    let docsCopied = 0;
    if (copyDocs) docsCopied = await copyRequiredDocuments(s.id, created.caseId, input.targetGroupId, input.actorId);

    let mentorAssigned = false;
    let mentorError: string | null = null;
    if (keepMentor) {
      const { data: assign } = await admin.from('mentor_assignments').select('mentor_id').eq('case_id', s.id).order('is_active', { ascending: false }).order('assigned_at', { ascending: false }).limit(1).maybeSingle();
      if (assign) {
        try {
          await ensureDesignationForTarget(assign.mentor_id, input.targetGroupId, input.programId);
          const r = await assignMentor(created.caseId, assign.mentor_id, input.actorId, 'manual');
          mentorAssigned = r.ok;
          if (!r.ok) mentorError = r.error;
          else await afterAssignmentConfirmed(input.programId, assign.mentor_id, input.actorId);
        } catch (err) {
          mentorError = err instanceof Error ? err.message : '배정 실패';
        }
      } else {
        mentorError = '이전 케이스에 배정 이력이 없음';
      }
    }
    let autoMatched = false;
    if (!mentorAssigned) {
      try {
        const am = await autoMatchMentee(created.caseId, input.actorId);
        autoMatched = am.assigned;
      } catch (err) {
        console.error('succession auto-match failed:', err instanceof Error ? err.message : err);
      }
    }
    result.created.push({ sourceCaseId: s.id, caseId: created.caseId, businessName: s.business_name, mentorAssigned, mentorError, autoMatched, docsCopied });
  }
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: input.actorId,
    program_id: input.programId,
    action: kind === 'relocation' ? 'case.relocation' : 'case.succession',
    entity_type: 'support_types',
    entity_id: input.targetGroupId,
    metadata: { kind, created: result.created.length, skipped: result.skipped.length, keep_mentor: keepMentor, copy_required_docs: copyDocs, mentor_failed: result.created.filter((c) => c.mentorError).length, docs_copied: result.created.reduce((a, c) => a + (c.docsCopied ?? 0), 0) },
  });
  if (auditError) console.error('succession audit insert failed:', auditError.message);
  return { ok: true, result };
}
