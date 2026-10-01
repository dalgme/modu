'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';

export type CaseDeleteResult = { ok: true } | { ok: false; error: string };

/**
 * 케이스 완전 삭제 (P21 — 테스트 데이터 청소용).
 * 회차·보고서·서명·정산·메시지·팀원 등 하위 데이터는 DB FK CASCADE 로 함께 삭제되고,
 * 스토리지 파일(documents/photos/signatures)은 여기서 직접 정리한다.
 *
 * 안전장치:
 *  - 운영사 + case.delete 권한(기본 PL 전용), 행사 컨텍스트 범위 안의 케이스만
 *  - 지급 품의에 편성된 정산(batch_id 있음)이 있으면 차단 — 품의 기록이 오염되지 않게
 *  - 감사기록에 삭제 요약(멘티·회차·정산 건수)을 남긴다 (INSERT-only 라 삭제 이력은 보존)
 */
export async function deleteCaseAction(caseId: string, confirmText: string): Promise<CaseDeleteResult> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  // 완전 삭제는 별도 권한 키(case.delete, 기본 PL 전용) — 케이스 등록 권한(case.manage)만으로는 불가
  const denied = denyUnless(ctx, 'case.delete');
  if (denied) return { ok: false, error: denied };
  if (confirmText.trim() !== '삭제') return { ok: false, error: '확인 문구가 일치하지 않습니다. "삭제" 를 입력하세요.' };

  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, program_id, owner_name, business_name, status, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const [{ data: settlements }, { count: roundCount }, { data: docRows }, { data: sigRows }] = await Promise.all([
    admin.from('settlements').select('id, batch_id, status').eq('case_id', caseId),
    admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', caseId),
    admin.from('documents').select('storage_path, doc_key').eq('case_id', caseId),
    admin.from('signatures').select('storage_path').eq('case_id', caseId),
  ]);
  if ((settlements ?? []).some((s) => s.batch_id)) {
    return { ok: false, error: '지급 품의에 편성된 정산이 있는 케이스는 삭제할 수 없습니다. 품의를 먼저 확인하세요.' };
  }

  // 스토리지 파일 정리 (행 삭제 전에 경로 확보) — 파일 삭제 실패가 본 삭제를 막지는 않는다
  const docPaths = { documents: [] as string[], photos: [] as string[] };
  for (const d of docRows ?? []) {
    (d.doc_key.startsWith('mentoring_photo:') ? docPaths.photos : docPaths.documents).push(d.storage_path);
  }
  try {
    if (docPaths.documents.length) await admin.storage.from('documents').remove(docPaths.documents);
    if (docPaths.photos.length) await admin.storage.from('photos').remove(docPaths.photos);
    const sigPaths = (sigRows ?? []).map((s) => s.storage_path).filter(Boolean);
    if (sigPaths.length) await admin.storage.from('signatures').remove(sigPaths);
  } catch {
    /* 스토리지 정리 실패는 무시 — 고아 파일은 남지만 데이터 정합에는 영향 없음 */
  }

  // mentoring_logs.settlement_id → settlements FK 순환을 피하기 위해 참조 해제 후 케이스 삭제(CASCADE)
  await admin.from('mentoring_logs').update({ settlement_id: null }).eq('case_id', caseId).not('settlement_id', 'is', null);
  const { error } = await admin.from('cases').delete().eq('id', caseId);
  if (error) return { ok: false, error: `삭제 실패: ${error.message}` };

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: ctx.programId,
    action: 'case.delete',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: {
      owner_name: c.owner_name,
      business_name: c.business_name,
      status: c.status,
      mentee_id: c.mentee_id,
      rounds: roundCount ?? 0,
      settlements: (settlements ?? []).length,
      files: (docRows ?? []).length + (sigRows ?? []).length,
    },
  });
  if (auditError) console.error('case delete audit failed:', auditError.message);

  revalidatePath('/nextlab/dashboard');
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/reports');
  return { ok: true };
}

/** 진행 내역 삭제 시 지우는 서류 — 멘토링 산출물만. 사업계획서·필수서류·멘티 서류는 남긴다 */
function isProgressDoc(docKey: string): boolean {
  return docKey.startsWith('mentoring_report:') || docKey.startsWith('mentoring_photo:') || docKey === 'observation_report' || docKey.startsWith('settlement_statement');
}

/**
 * 케이스 진행 내역 삭제 (2026-10-01) — **라운드(그룹)·멘토 매칭·멘티 정보는 남기고** 진행 기록만 지운다.
 * 지우는 것: 회차·보고서·사진·관찰의견서·서명·검수 기록·보완 요청·추가 회차/중도 종료/멘토 변경 요청·만족도 응답·정산(품의 편성 전).
 * 남기는 것: 케이스 행(그룹·멘티)·멘토 배정·멘티 프로필·팀원·추천·사업계획서·필수서류·멘티 서류·메시지.
 * 상태는 멘토가 있으면 '멘토 배정', 없으면 '멘티 등록'으로 되돌린다. 종결·중도 종료로 끝난 마지막 배정은 다시 활성화한다.
 * 감사 action 은 `case.progress_reset` — 케이스 [조치 이력]이 이 시점 이전의 진행 기록을 숨긴다(P42).
 */
export async function resetCaseProgressAction(caseId: string, confirmText: string): Promise<CaseDeleteResult> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.delete');
  if (denied) return { ok: false, error: denied };
  if (confirmText.trim() !== '초기화') return { ok: false, error: '확인 문구가 일치하지 않습니다. "초기화" 를 입력하세요.' };

  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, owner_name, status').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };

  const [{ data: settlements }, { data: logs }, { data: docRows }, { data: sigRows }, { data: assigns }] = await Promise.all([
    admin.from('settlements').select('id, batch_id').eq('case_id', caseId),
    admin.from('mentoring_logs').select('id').eq('case_id', caseId),
    admin.from('documents').select('id, storage_path, doc_key').eq('case_id', caseId),
    admin.from('signatures').select('id, storage_path').eq('case_id', caseId),
    admin.from('mentor_assignments').select('id, is_active, end_kind, assigned_at').eq('case_id', caseId).order('assigned_at', { ascending: false }),
  ]);
  if ((settlements ?? []).some((s) => s.batch_id)) {
    return { ok: false, error: '지급 품의에 편성된 정산이 있는 케이스는 초기화할 수 없습니다. 품의를 먼저 확인하세요.' };
  }
  const progressDocs = (docRows ?? []).filter((d) => isProgressDoc(d.doc_key));

  // 스토리지 파일 먼저 정리 — 실패해도 진행(고아 파일만 남음)
  try {
    const docs = progressDocs.filter((d) => !d.doc_key.startsWith('mentoring_photo:')).map((d) => d.storage_path).filter(Boolean);
    const photos = progressDocs.filter((d) => d.doc_key.startsWith('mentoring_photo:')).map((d) => d.storage_path).filter(Boolean);
    const sigs = (sigRows ?? []).map((s) => s.storage_path).filter(Boolean);
    if (docs.length) await admin.storage.from('documents').remove(docs);
    if (photos.length) await admin.storage.from('photos').remove(photos);
    if (sigs.length) await admin.storage.from('signatures').remove(sigs);
  } catch (e) {
    console.error('case progress reset storage cleanup failed:', e instanceof Error ? e.message : e);
  }

  const steps: { label: string; run: () => PromiseLike<{ error: { message: string } | null }> }[] = [
    { label: '회차 정산 연결', run: () => admin.from('mentoring_logs').update({ settlement_id: null }).eq('case_id', caseId).not('settlement_id', 'is', null) },
    { label: '정산', run: () => admin.from('settlements').delete().eq('case_id', caseId) },
    { label: '서명', run: () => admin.from('signatures').delete().eq('case_id', caseId) },
    { label: '서류', run: () => (progressDocs.length ? admin.from('documents').delete().in('id', progressDocs.map((d) => d.id)) : Promise.resolve({ error: null })) },
    { label: '회차', run: () => admin.from('mentoring_logs').delete().eq('case_id', caseId) },
    { label: '관찰의견서', run: () => admin.from('observation_reports').delete().eq('case_id', caseId) },
    { label: '검수 기록', run: () => admin.from('reviews').delete().eq('case_id', caseId) },
    { label: '보완 요청', run: () => admin.from('supplement_requests').delete().eq('case_id', caseId) },
    { label: '추가 회차 요청', run: () => admin.from('round_extension_requests').delete().eq('case_id', caseId) },
    { label: '중도 종료 요청', run: () => admin.from('mentor_withdrawal_requests').delete().eq('case_id', caseId) },
    { label: '멘토 변경 요청', run: () => admin.from('mentor_change_requests').delete().eq('case_id', caseId) },
    { label: '만족도 응답', run: () => admin.from('survey_responses').delete().eq('case_id', caseId) },
  ];
  for (const s of steps) {
    const { error } = await s.run();
    if (error) return { ok: false, error: `${s.label} 삭제 실패: ${error.message}` };
  }

  // 배정: 활성 배정이 없고 마지막 배정이 종결·중도 종료로 끝났으면 다시 활성화 (매칭 정보 유지)
  const list = assigns ?? [];
  let hasMentor = list.some((a) => a.is_active);
  const last = list[0];
  if (!hasMentor && last && (last.end_kind === 'case_closed' || last.end_kind === 'case_withdrawn')) {
    const { error } = await admin.from('mentor_assignments').update({ is_active: true, ended_at: null, ended_by: null, end_kind: null, end_reason: null }).eq('id', last.id);
    if (error) return { ok: false, error: `멘토 배정 복원 실패: ${error.message}` };
    hasMentor = true;
  }
  const toStatus = hasMentor ? 'mentor_assigned' : 'registered';
  const { error: upErr } = await admin.from('cases').update({ status: toStatus, closed_at: null, survey_opened_at: null, survey_reminded_at: null }).eq('id', caseId);
  if (upErr) return { ok: false, error: `상태 변경 실패: ${upErr.message}` };
  if (c.status !== toStatus) {
    const { error: hErr } = await admin.from('case_status_history').insert({ case_id: caseId, from_status: c.status, to_status: toStatus, changed_by: actor.id, note: '진행 내역 삭제(초기화)' });
    if (hErr) console.error('case progress reset history failed:', hErr.message);
  }

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: ctx.programId,
    action: 'case.progress_reset',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: {
      case_id: caseId,
      owner_name: c.owner_name,
      from_status: c.status,
      to_status: toStatus,
      rounds: (logs ?? []).length,
      settlements: (settlements ?? []).length,
      files: progressDocs.length + (sigRows ?? []).length,
      via: 'operator_reset',
    },
  });
  if (auditError) console.error('case progress reset audit failed:', auditError.message);

  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/reports');
  return { ok: true };
}
