import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { isPL, isStaffGrade, resolveGrants, type CapabilityKey } from '@/lib/auth/capabilities';
import { getRealSessionProfile } from '@/lib/auth/guards';
import { actingNote } from '@/lib/auth/impersonation';
import { logAudit } from '@/lib/workflow/audit';
import { htmlToPdf, renderTemplate } from '@/lib/documents/render';
import { uploadFile, moveFile, sha256Hex } from '@/lib/storage/files';
import { queueNotification } from '@/lib/workflow/notifications';
import { assertTransition, TRANSITIONS } from '@/lib/workflow/transitions';
import { getRoundAllowance } from '@/lib/data/rounds';
import { missingRequiredMenteeDocs } from '@/lib/workflow/case-documents';
import { getBranding } from '@/lib/programs/data';
import { fmt } from '@/lib/programs/branding';
import type { WorkflowResult } from '@/lib/workflow/cases';

export interface ObservationContent {
  summary: string; // 멘토링 총평
  strengths: string; // 강점
  weaknesses: string; // 보완점
  recommendations: string; // 권고 사항
  next_steps: string; // 향후 계획·연계 제안
  overall_rating: number | null; // 1~5
}

const EMPTY: ObservationContent = { summary: '', strengths: '', weaknesses: '', recommendations: '', next_steps: '', overall_rating: null };

export function normalizeObservation(raw: unknown): ObservationContent {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ObservationContent, unknown>>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const rating = typeof o.overall_rating === 'number' && o.overall_rating >= 1 && o.overall_rating <= 5 ? o.overall_rating : null;
  return {
    summary: str(o.summary),
    strengths: str(o.strengths),
    weaknesses: str(o.weaknesses),
    recommendations: str(o.recommendations),
    next_steps: str(o.next_steps),
    overall_rating: rating,
  };
}

/** 관찰의견서 웹 작성본 임시 저장 (담당 멘토) */
export async function saveObservationDraft(caseId: string, mentorId: string, content: ObservationContent): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (!TRANSITIONS.request_closure.from.includes(c.status) && c.status !== 'mentor_assigned') {
    return { ok: false, error: '컨설팅 진행 중에만 관찰의견서를 작성할 수 있습니다.' };
  }
  const { error } = await admin
    .from('observation_reports')
    .upsert({ case_id: caseId, mentor_id: mentorId, content: content as never }, { onConflict: 'case_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, caseId };
}

/** 관찰의견서 완성본 파일 업로드 (단일본 — delete-then-insert, DB 유니크 인덱스가 최종 방어선) */
export async function uploadObservationFile(
  caseId: string,
  mentorId: string,
  staging: { stagingPath: string; fileName: string; mimeType: string },
): Promise<WorkflowResult> {
  if (!staging.stagingPath.startsWith('_staging/') || staging.stagingPath.includes('..')) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const admin = createAdminClient();
  // 상태 게이트 (P31) — 웹 작성본(saveObservationDraft)과 같은 조건: 종결 요청 가능 단계(진행 중·보완 요청) + 멘토 배정 단계
  const { data: c } = await admin.from('cases').select('id, status').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (!TRANSITIONS.request_closure.from.includes(c.status) && c.status !== 'mentor_assigned') {
    return { ok: false, error: '컨설팅 진행 중(또는 보완 요청) 단계에서만 관찰의견서를 올릴 수 있습니다.' };
  }
  const basename = staging.stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const { data: blob } = await admin.storage.from('documents').download(staging.stagingPath);
  if (!blob) return { ok: false, error: '업로드된 파일을 확인할 수 없습니다.' };
  const buffer = Buffer.from(await blob.arrayBuffer());
  const dest = `${caseId}/${basename}`;
  try {
    await moveFile('documents', staging.stagingPath, dest);
  } catch {
    return { ok: false, error: '파일 이동에 실패했습니다.' };
  }
  const replaced = await replaceObservationDocument(caseId, {
    doc_name: staging.fileName || '관찰의견서',
    storage_path: dest,
    sha256: sha256Hex(buffer),
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
    uploaded_by: mentorId,
  });
  if (!replaced.ok) {
    await admin.storage.from('documents').remove([dest]);
    return replaced;
  }
  return { ok: true, caseId };
}

/**
 * 관찰의견서 단일본 교체 (P31) — 새 파일 정보를 **먼저 저장**하고 성공했을 때만 이전 파일을 지운다.
 * doc_key 'observation_report' 는 DB 유니크 인덱스(0052)라 새 행을 먼저 insert 할 수 없으므로,
 * 기존 행이 있으면 그 행을 update(경로·해시 교체)하고 없으면 insert 한다. 실패하면 기존 파일·행은 그대로 남는다.
 */
async function replaceObservationDocument(
  caseId: string,
  doc: { doc_name: string; storage_path: string; sha256: string; file_size: number; mime_type: string; uploaded_by: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: old } = await admin.from('documents').select('id, storage_path').eq('case_id', caseId).eq('doc_key', 'observation_report').order('created_at');
  const rows = old ?? [];
  const keep = rows[0] ?? null;
  const { error } = keep
    ? await admin.from('documents').update({ ...doc, uploaded_role: 'mentor', updated_at: new Date().toISOString() }).eq('id', keep.id)
    : await admin.from('documents').insert({ case_id: caseId, doc_key: 'observation_report', uploaded_role: 'mentor', ...doc });
  if (error) return { ok: false, error: `관찰의견서 저장에 실패했습니다: ${error.message}` };
  // 저장 성공 후에만 이전 파일·중복 행 정리
  const stalePaths = rows.map((d) => d.storage_path).filter((p) => p !== doc.storage_path);
  if (stalePaths.length > 0) await admin.storage.from('documents').remove(stalePaths);
  const extraIds = rows.slice(1).map((d) => d.id);
  if (extraIds.length > 0) await admin.from('documents').delete().in('id', extraIds);
  return { ok: true };
}

/**
 * 종결 요청 가능 여부 판정 (멘토 화면 버튼 조건 = requestClosure 서버 게이트와 같은 규칙, P28).
 * 상태 전이 · 필수 회차(보고서 등록 기준) · 관찰의견서 · (정책) 멘티 서명 · (정책) 그룹 필수서류.
 */
export async function checkClosureReadiness(caseId: string): Promise<{ ok: boolean; hint: string; reported: number; required: number }> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id, support_type_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, hint: '케이스를 찾을 수 없습니다.', reported: 0, required: 0 };
  const [{ data: group }, { data: program }, { data: logs }, { data: obs }, { data: obsFile }] = await Promise.all([
    admin.from('support_types').select('required_rounds').eq('id', c.support_type_id).maybeSingle(),
    admin.from('programs').select('closure_policy').eq('id', c.program_id).maybeSingle(),
    admin.from('mentoring_logs').select('round_no, mentee_signed_at, report_registered_at').eq('case_id', caseId).order('round_no'),
    admin.from('observation_reports').select('content').eq('case_id', caseId).maybeSingle(),
    admin.from('documents').select('id').eq('case_id', caseId).eq('doc_key', 'observation_report').maybeSingle(),
  ]);
  const rounds = logs ?? [];
  const required = group?.required_rounds ?? 0;
  const reported = rounds.filter((r) => r.report_registered_at).length;
  const base = { reported, required };
  if (assertTransition('request_closure', c.status)) return { ok: false, hint: '컨설팅 진행 중(또는 보완 요청) 단계에서만 종결을 요청할 수 있습니다.', ...base };
  if (rounds.length < required) return { ok: false, hint: `필수 회차 ${required}회 중 ${rounds.length}회 등록됨 — 회차를 모두 등록하세요.`, ...base };
  const unreported = rounds.filter((r) => !r.report_registered_at).map((r) => r.round_no);
  if (unreported.length > 0) return { ok: false, hint: `보고서가 없는 회차(${unreported.join('·')}회차)가 있습니다. 각 회차의 [보고서 등록]을 완료하세요.`, ...base };
  const content = obs ? normalizeObservation(obs.content) : EMPTY;
  if (!(content.summary.trim().length > 0 || !!obsFile)) return { ok: false, hint: '관찰의견서 총평을 작성(임시 저장)하거나 완성본을 올리면 종결을 요청할 수 있습니다.', ...base };
  const policy = (program?.closure_policy ?? {}) as { require_mentee_signature?: boolean; require_group_docs?: boolean };
  if (policy.require_mentee_signature && rounds.some((r) => !r.mentee_signed_at)) return { ok: false, hint: '이 행사는 모든 회차에 멘티 확인 서명이 있어야 종결을 요청할 수 있습니다. 서명이 없는 회차를 확인하세요.', ...base };
  if (policy.require_group_docs) {
    const missing = await missingRequiredMenteeDocs(caseId);
    if (missing.length > 0) return { ok: false, hint: `멘티 필수서류가 누락되어 종결을 요청할 수 없습니다: ${missing.join(', ')}`, ...base };
  }
  return { ok: true, hint: '관찰의견서를 제출하고 종결을 요청합니다. 운영사 검수 승인 시 정산이 확정됩니다.', ...base };
}

/**
 * T5 종결 요청 — 필수 회차 충족 + 관찰의견서(웹 작성본 또는 업로드본) + (설정) 멘티 서명 전부.
 * 웹 작성본이면 PDF 를 생성해 단일본으로 저장한다.
 */
export async function requestClosure(caseId: string, mentorId: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, status, program_id, support_type_id, business_name, owner_name, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('request_closure', c.status);
  if (denied) return { ok: false, error: denied };

  const [{ data: group }, { data: program }, { data: logs }, { data: obs }, { data: obsFile }, allowance] = await Promise.all([
    admin.from('support_types').select('required_rounds, name').eq('id', c.support_type_id).maybeSingle(),
    admin.from('programs').select('closure_policy').eq('id', c.program_id).maybeSingle(),
    admin.from('mentoring_logs').select('id, round_no, mode, started_at, ended_at, place, mentee_signed_at, report_registered_at').eq('case_id', caseId).order('round_no'),
    admin.from('observation_reports').select('*').eq('case_id', caseId).maybeSingle(),
    admin.from('documents').select('id, created_at, updated_at').eq('case_id', caseId).eq('doc_key', 'observation_report').maybeSingle(),
    getRoundAllowance(caseId),
  ]);
  if (!group) return { ok: false, error: '사업그룹을 찾을 수 없습니다.' };
  const rounds = logs ?? [];
  const required = group.required_rounds;
  if (rounds.length < required) {
    return { ok: false, error: `필수 회차 ${required}회를 모두 등록한 뒤 종결을 요청할 수 있습니다. (현재 ${rounds.length}회, 승인된 추가 ${allowance.approvedExtra}회)` };
  }
  // 2단계(보고서) 미등록 회차가 있으면 종결 불가 — 정산은 보고서가 등록된 회차만 인정된다
  const unreported = rounds.filter((r) => !r.report_registered_at).map((r) => r.round_no);
  if (unreported.length > 0) {
    return { ok: false, error: `보고서가 등록되지 않은 회차가 있습니다 (${unreported.join('·')}회차). 각 회차의 [보고서 등록]을 먼저 완료하세요.` };
  }
  const policy = (program?.closure_policy ?? {}) as { require_mentee_signature?: boolean; require_group_docs?: boolean };
  if (policy.require_mentee_signature && rounds.some((r) => !r.mentee_signed_at)) {
    return { ok: false, error: '모든 회차에 멘티 서명이 있어야 종결을 요청할 수 있습니다.' };
  }
  if (policy.require_group_docs) {
    const missing = await missingRequiredMenteeDocs(caseId);
    if (missing.length > 0) return { ok: false, error: `멘티 필수서류가 누락되어 종결을 요청할 수 없습니다: ${missing.join(', ')}` };
  }

  const content = obs ? normalizeObservation(obs.content) : EMPTY;
  const hasWeb = content.summary.trim().length > 0;
  if (!hasWeb && !obsFile) return { ok: false, error: '관찰의견서를 작성(총평 필수)하거나 완성본 파일을 올린 뒤 종결을 요청하세요.' };
  // 우선순위 (P31): 업로드된 완성본이 웹 작성본(updated_at)보다 나중에 올라왔으면 그 파일을 유지하고 PDF 를 다시 만들지 않는다.
  // 반대(웹 작성본이 더 최신)면 기존처럼 웹 작성본으로 PDF 를 생성해 단일본을 교체한다.
  const fileAt = obsFile ? Math.max(new Date(obsFile.created_at).getTime(), new Date(obsFile.updated_at).getTime()) : 0;
  const webAt = obs ? new Date(obs.updated_at).getTime() : 0;
  const useUploadedFile = !!obsFile && (!hasWeb || fileAt > webAt);

  // 웹 작성본 → PDF 단일본
  if (hasWeb && !useUploadedFile) {
    try {
      const branding = await getBranding(c.program_id);
      const mentor = await admin.from('users').select('name').eq('id', mentorId).maybeSingle();
      const html = renderTemplate(OBSERVATION_TEMPLATE, {
        title: fmt('{program} 관찰의견서', branding),
        program: branding.programName,
        group: group.name,
        business_name: c.business_name,
        owner_name: c.owner_name,
        mentor_name: mentor.data?.name ?? '',
        rounds_table: rounds
          .map((r) => `<tr><td>${r.round_no}</td><td>${r.mode === 'online' ? '온라인' : '오프라인'}</td><td>${fmtDate(r.started_at)}</td><td>${esc(r.place ?? '')}</td><td>${r.mentee_signed_at ? '서명' : '-'}</td></tr>`)
          .join(''),
        summary: nl(content.summary),
        strengths: nl(content.strengths),
        weaknesses: nl(content.weaknesses),
        recommendations: nl(content.recommendations),
        next_steps: nl(content.next_steps),
        rating: content.overall_rating ? `${content.overall_rating} / 5` : '-',
        seal: branding.clientSealName,
        operator: branding.operatorName,
        date: fmtDate(new Date().toISOString()),
      });
      const pdf = await htmlToPdf(html);
      const meta = await uploadFile('documents', caseId, pdf, 'application/pdf', 'pdf');
      const replaced = await replaceObservationDocument(caseId, {
        doc_name: `관찰의견서_${c.business_name}.pdf`,
        storage_path: meta.storagePath,
        sha256: meta.sha256,
        file_size: meta.size,
        mime_type: 'application/pdf',
        uploaded_by: mentorId,
      });
      if (!replaced.ok) {
        await admin.storage.from('documents').remove([meta.storagePath]);
        return replaced;
      }
    } catch (err) {
      return { ok: false, error: `관찰의견서 PDF 생성에 실패했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
    await admin.from('observation_reports').update({ submitted_at: new Date().toISOString() }).eq('case_id', caseId);
  }

  const { data: updated } = await admin
    .from('cases')
    .update({ status: 'closure_requested' })
    .eq('id', caseId)
    .in('status', [...TRANSITIONS.request_closure.from])
    .select('id');
  if (!updated || updated.length === 0) return { ok: false, error: '이미 처리된 케이스입니다. 새로고침 후 다시 시도하세요.' };

  await admin.from('case_status_history').insert({
    case_id: caseId,
    from_status: c.status,
    to_status: 'closure_requested',
    changed_by: mentorId,
    note: await actingNote('관찰의견서 제출 · 종결 요청', mentorId), // 대행 중이면 표기 (P31)
  });
  await notifyProgramStaff(c.program_id, caseId, 'closure_requested');
  // 멘티 만족도 안내 (P31) — 활성 양식이 있고 아직 응답이 없을 때만, 중립 문구('열렸습니다')로. 문구 자체는 템플릿(survey_opened)+payload.message.
  if (c.mentee_id && (await surveyOpenNudgeNeeded(caseId))) {
    await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'survey_opened', payload: { message: '만족도 조사가 열렸습니다. 마이페이지에서 참여해 주세요.' } });
  }
  await logAudit(admin, {
    actorId: mentorId,
    programId: c.program_id,
    action: 'case.closure_requested',
    entityType: 'cases',
    entityId: caseId,
    metadata: { rounds: rounds.length, required, observation: useUploadedFile ? 'file' : 'web' },
  });
  return { ok: true, caseId };
}

/** 만족도 안내 필요 여부 (P31): 케이스 그룹/행사에 활성 만족도 양식이 있고 응답이 아직 없을 때 */
async function surveyOpenNudgeNeeded(caseId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('program_id, support_type_id').eq('id', caseId).maybeSingle();
  if (!c) return false;
  const [{ data: response }, { data: templates }] = await Promise.all([
    admin.from('survey_responses').select('id').eq('case_id', caseId).maybeSingle(),
    admin.from('survey_templates').select('id, support_type_id').eq('program_id', c.program_id).eq('is_active', true),
  ]);
  if (response) return false;
  return (templates ?? []).some((t) => t.support_type_id === c.support_type_id || t.support_type_id === null);
}

/** 추가 회차 요청 (멘토 → 운영사 승인) */
export async function requestRoundExtension(caseId: string, mentorId: string, reason: string, extraRounds: number): Promise<WorkflowResult> {
  if (!reason.trim()) return { ok: false, error: '사유를 입력하세요.' };
  const extra = Math.min(Math.max(Math.floor(extraRounds), 1), 10);
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (!TRANSITIONS.submit_round.from.includes(c.status)) return { ok: false, error: '컨설팅 진행 중에만 추가 회차를 요청할 수 있습니다.' };
  const { count } = await admin.from('round_extension_requests').select('id', { count: 'exact', head: true }).eq('case_id', caseId).eq('status', 'pending');
  if ((count ?? 0) > 0) return { ok: false, error: '처리 대기 중인 추가 회차 요청이 있습니다.' };
  const { error } = await admin.from('round_extension_requests').insert({ case_id: caseId, requested_by: mentorId, reason: reason.trim(), extra_rounds: extra });
  if (error) return { ok: false, error: error.message };
  await notifyProgramStaff(c.program_id, caseId, 'extension_requested');
  await logAudit(admin, { actorId: mentorId, programId: c.program_id, action: 'round.extension_requested', entityType: 'cases', entityId: caseId, metadata: { extra_rounds: extra } });
  return { ok: true, caseId };
}

/** 운영사: 추가 회차 요청 승인/반려 */
export async function decideRoundExtension(requestId: string, actorId: string, decision: 'approved' | 'rejected', note: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: req } = await admin.from('round_extension_requests').select('id, case_id, requested_by, status, extra_rounds').eq('id', requestId).maybeSingle();
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  if (req.status !== 'pending') return { ok: false, error: '이미 처리된 요청입니다.' };
  if (decision === 'rejected' && !note.trim()) return { ok: false, error: '반려 사유를 입력하세요.' };
  const { data: c } = await admin.from('cases').select('id, program_id').eq('id', req.case_id).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const { data: upd } = await admin
    .from('round_extension_requests')
    .update({ status: decision, decided_by: actorId, decided_at: new Date().toISOString(), decision_note: note.trim() || null })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 요청입니다.' };
  await queueNotification(admin, { caseId: c.id, programId: c.program_id, recipientId: req.requested_by, triggerEvent: 'extension_decided', payload: { decision, message: decision === 'approved' ? `추가 ${req.extra_rounds}회가 승인되었습니다.` : `추가 회차 요청이 반려되었습니다. ${note.trim().slice(0, 60)}` } });
  await logAudit(admin, { actorId, programId: c.program_id, action: `round.extension_${decision}`, entityType: 'cases', entityId: c.id, metadata: { request_id: requestId, extra_rounds: req.extra_rounds, note: note.trim() } });
  return { ok: true, caseId: c.id };
}

/** T11a 멘토 자진 중도 종료 요청 (사유 작성 → 운영사 승인) */
export async function requestMentorWithdrawal(caseId: string, mentorId: string, reason: string): Promise<WorkflowResult> {
  if (!reason.trim()) return { ok: false, error: '중도 종료 사유를 입력하세요.' };
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('request_mentor_withdrawal', c.status);
  if (denied) return { ok: false, error: denied };
  const { data: assign } = await admin.from('mentor_assignments').select('id').eq('case_id', caseId).eq('mentor_id', mentorId).eq('is_active', true).maybeSingle();
  if (!assign) return { ok: false, error: '담당 멘토가 아닙니다.' };
  const { count } = await admin.from('mentor_withdrawal_requests').select('id', { count: 'exact', head: true }).eq('case_id', caseId).eq('status', 'pending');
  if ((count ?? 0) > 0) return { ok: false, error: '처리 대기 중인 중도 종료 요청이 있습니다.' };
  const { error } = await admin.from('mentor_withdrawal_requests').insert({ case_id: caseId, assignment_id: assign.id, mentor_id: mentorId, reason: reason.trim() });
  if (error) return { ok: false, error: error.message };
  await notifyProgramStaff(c.program_id, caseId, 'mentor_withdrawal_requested');
  await logAudit(admin, { actorId: mentorId, programId: c.program_id, action: 'mentor.withdrawal_requested', entityType: 'cases', entityId: caseId, metadata: null });
  return { ok: true, caseId };
}

/** 알림 이벤트 → 처리에 필요한 권한 키 (그 권한이 없는 등급(옵저버 등)에게는 보내지 않는다) */
const EVENT_CAPABILITY: Record<string, CapabilityKey> = {
  closure_requested: 'review',
  extension_requested: 'review',
  mentor_withdrawal_requested: 'review',
  mentor_change_requested: 'review',
  closure_overdue: 'review',
};

/**
 * 행사의 담당자에게 알림 큐 (2026-09-24 개정).
 *  - 운영사(nextlab): 등급 권한(resolveGrants, 행사별·회원별 override 반영)이 이벤트에 필요한 키를 포함하는 활성 담당자.
 *    케이스가 있으면 그 케이스 그룹의 **담당자(program_members.duty_groups)** 만 — 담당 지정이 없는 담당자는 전체 그룹 담당으로 본다.
 *    한 명도 남지 않으면 PL 전원에게 폴백.
 *  - 발주처(institution): roles 에 포함된 경우 활성 담당자 전원(권한표 대상 아님).
 */
export async function notifyProgramStaff(programId: string, caseId: string | null, triggerEvent: string, roles: ('nextlab' | 'institution')[] = ['nextlab']): Promise<void> {
  const admin = createAdminClient();
  // 방금 그 작업을 수행한 실제 실행자(대행 중이면 운영사 담당자 본인)는 수신자에서 뺀다 — 자기 작업 알림 방지 (P31).
  // Cron 등 요청 컨텍스트 밖에서는 cookies() 가 없어 예외가 날 수 있으므로 격리한다.
  let actingUserId: string | null = null;
  try {
    actingUserId = (await getRealSessionProfile())?.id ?? null;
  } catch {
    actingUserId = null;
  }
  type StaffRow = { user_id: string; role: string; grade: string | null; duty_groups: string[] | null; users: { is_active: boolean } | null };
  const [{ data: memberRows }, { data: program }, caseGroup] = await Promise.all([
    admin
      .from('program_members')
      // duty_groups 는 0080 컬럼 — database.ts 재생성 전까지 로컬 캐스트
      .select('user_id, role, grade, duty_groups, users!inner(is_active)' as 'user_id, role, grade, users!inner(is_active)')
      .eq('program_id', programId)
      .in('role', roles)
      .eq('is_active', true),
    admin.from('programs').select('staff_permissions').eq('id', programId).maybeSingle(),
    caseId ? admin.from('cases').select('support_type_id').eq('id', caseId).maybeSingle().then((r) => r.data?.support_type_id ?? null) : Promise.resolve(null),
  ]);
  const members = (memberRows ?? []) as unknown as StaffRow[];
  const needKey = EVENT_CAPABILITY[triggerEvent] ?? null;
  const active = members.filter((m) => m.users?.is_active);
  const recipients = new Set<string>();
  for (const m of active) if (m.role === 'institution') recipients.add(m.user_id);
  const staff = active.filter((m) => m.role === 'nextlab');
  const dutyGroups = (m: StaffRow) => m.duty_groups ?? [];
  const gradeOf = (m: StaffRow) => (isStaffGrade(m.grade) ? m.grade : null);
  const capable = staff.filter((m) => !needKey || resolveGrants(gradeOf(m), program?.staff_permissions, m.user_id).includes(needKey));
  const inCharge = caseGroup ? capable.filter((m) => dutyGroups(m).length === 0 || dutyGroups(m).includes(caseGroup)) : capable;
  const chosen = inCharge.length > 0 ? inCharge : staff.filter((m) => isPL(gradeOf(m)));
  for (const m of chosen) recipients.add(m.user_id);
  if (actingUserId) recipients.delete(actingUserId);
  for (const userId of Array.from(recipients)) {
    await queueNotification(admin, { caseId, programId, recipientId: userId, triggerEvent });
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function nl(s: string): string {
  return esc(s).replace(/\n/g, '<br/>');
}
function fmtDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 관찰의견서 기본 서식 (행사별 override 는 document_templates 'observation_report' — P6) */
const OBSERVATION_TEMPLATE = `
<style>
  body { font-family: Pretendard, sans-serif; font-size: 12px; color: #111; padding: 32px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
  th { background: #f2f2f2; width: 22%; text-align: left; }
  .rounds th { width: auto; text-align: center; }
  .rounds td { text-align: center; }
  .section { min-height: 64px; line-height: 1.6; }
  .sign { margin-top: 32px; text-align: right; font-size: 13px; }
</style>
<h1>{{title}}</h1>
<table>
  <tr><th>행사 / 그룹</th><td>{{program}} / {{group}}</td></tr>
  <tr><th>멘티(기업·팀)</th><td>{{business_name}} ({{owner_name}})</td></tr>
  <tr><th>담당 멘토</th><td>{{mentor_name}}</td></tr>
</table>
<table class="rounds">
  <tr><th>회차</th><th>유형</th><th>일자</th><th>장소</th><th>멘티 서명</th></tr>
  {{rounds_table}}
</table>
<table>
  <tr><th>멘토링 총평</th><td class="section">{{summary}}</td></tr>
  <tr><th>강점</th><td class="section">{{strengths}}</td></tr>
  <tr><th>보완점</th><td class="section">{{weaknesses}}</td></tr>
  <tr><th>권고 사항</th><td class="section">{{recommendations}}</td></tr>
  <tr><th>향후 계획 · 연계 제안</th><td class="section">{{next_steps}}</td></tr>
  <tr><th>종합 평가</th><td>{{rating}}</td></tr>
</table>
<p class="sign">{{date}}<br/>담당 멘토: {{mentor_name}} (인)<br/>운영사: {{operator}}</p>
`;
