import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { queueNotification } from '@/lib/workflow/notifications';
import { assertTransition, TRANSITIONS } from '@/lib/workflow/transitions';
import { resolveLimits, resolveRate, kstDate, type ConsultingMode } from '@/lib/settlement/rates';
import { getRoundAllowance, photoDocKey, reportDocKey } from '@/lib/data/rounds';
import { renderRoundReport, resolveRoundReportPolicy } from '@/lib/documents/round-report';
import type { WorkflowResult } from '@/lib/workflow/cases';

/** 회차 참가자 (스냅샷 — 팀원 명단이 나중에 바뀌어도 회차 기록은 유지) */
export interface RoundParticipant {
  name: string;
  /** representative = 멘티 본인·팀 대표 / member = 팀원 */
  role: 'representative' | 'member';
}

/** 1단계 — 계획/실행 정보 등록 (사전·사후 모두 가능). 보고서는 2단계에서 등록한다. */
export interface RoundInput {
  caseId: string;
  mentorId: string;
  mode: ConsultingMode;
  startedAt: string; // ISO
  endedAt: string; // ISO
  place?: string;
  /** 참가자 (멘티 개인·팀 대표·팀원·복수 구성원) — 최소 1명 */
  participants: RoundParticipant[];
}

export type RoundResult = { ok: true; caseId: string; logId: string; roundNo: number } | { ok: false; error: string };

function isStaging(p: string): boolean {
  return p.startsWith('_staging/') && !p.includes('..');
}

function normalizeParticipants(raw: RoundParticipant[]): RoundParticipant[] {
  return (Array.isArray(raw) ? raw : [])
    .map((p) => ({ name: String(p?.name ?? '').trim().slice(0, 40), role: p?.role === 'member' ? ('member' as const) : ('representative' as const) }))
    .filter((p) => p.name.length > 0)
    .slice(0, 20);
}

/** 사전(계획) 등록 허용 범위 — 오늘부터 최대 60일 뒤까지 */
const PLAN_MAX_FUTURE_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * 회차 1단계 등록 (계획 또는 실행) — docs/MODU-DESIGN.md §4-3 검증 7항목 전부 서버 코드에서 직접.
 *  1 담당 멘토(호출부 mentorOfCaseOrNull) 2 상태 3 회차 상한 4 같은 멘티·같은 날 합산 상한
 *  5 멘토 1일 건수 6 시간 겹침 7 단가 스냅샷
 * 미래 일시(사전 계획)도 허용된다. 통계·정산의 기본데이터이므로 일시·유형·참가자는 여기서 확정된다.
 */
export async function submitRound(input: RoundInput): Promise<RoundResult> {
  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, status, program_id, support_type_id, mentee_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('submit_round', c.status);
  if (denied) return { ok: false, error: denied };

  const started = new Date(input.startedAt);
  const ended = new Date(input.endedAt);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return { ok: false, error: '일시를 확인하세요.' };
  if (ended <= started) return { ok: false, error: '종료 시각은 시작 시각보다 늦어야 합니다.' };
  // 사전(계획) 등록 허용 — 단, 너무 먼 미래는 차단
  if (started.getTime() > Date.now() + PLAN_MAX_FUTURE_MS) return { ok: false, error: '60일 이후의 일정은 미리 등록할 수 없습니다.' };
  if (kstDate(started) !== kstDate(ended)) return { ok: false, error: '한 회차는 같은 날 안에서 끝나야 합니다.' };
  const day = kstDate(started);

  const participants = normalizeParticipants(input.participants);
  if (participants.length === 0) return { ok: false, error: '참가자를 1명 이상 선택하세요.' };

  // 3) 회차 상한 = 그룹 회차 + 승인된 추가 회차
  const [{ data: group }, { count: existingCount }, allowance] = await Promise.all([
    admin.from('support_types').select('required_rounds, status').eq('id', c.support_type_id).maybeSingle(),
    admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', c.id),
    getRoundAllowance(c.id),
  ]);
  if (!group) return { ok: false, error: '사업그룹을 찾을 수 없습니다.' };
  const maxRounds = group.required_rounds + allowance.approvedExtra;
  const roundNo = (existingCount ?? 0) + 1;
  if (roundNo > maxRounds) {
    return { ok: false, error: `이 그룹은 ${group.required_rounds}회(승인된 추가 ${allowance.approvedExtra}회 포함 최대 ${maxRounds}회)까지 등록할 수 있습니다. 추가 회차가 필요하면 요청하세요.` };
  }

  // 7) 단가 스냅샷 + 한도 설정
  const [rate, limits] = await Promise.all([
    resolveRate(c.program_id, c.support_type_id, input.mode, day),
    resolveLimits(c.program_id, c.support_type_id, day),
  ]);
  if (!rate) return { ok: false, error: '이 유형의 단가가 설정되지 않았습니다. 운영사 설정을 확인하세요.' };
  if (!limits) return { ok: false, error: '운영 한도가 설정되지 않았습니다. 운영사 설정을 확인하세요.' };

  // 4) 같은 멘티·같은 날 합산 (회차 수 + 유형별 금액)
  const dayStart = new Date(`${day}T00:00:00+09:00`).toISOString();
  const dayEnd = new Date(`${day}T23:59:59.999+09:00`).toISOString();
  const { data: sameDay } = await admin
    .from('mentoring_logs')
    .select('id, mode, amount_snapshot')
    .eq('case_id', c.id)
    .gte('started_at', dayStart)
    .lte('started_at', dayEnd);
  const sameDayRows = sameDay ?? [];
  if (sameDayRows.length + 1 > limits.caseDailyRoundLimit) {
    return { ok: false, error: `같은 멘티에게는 하루 최대 ${limits.caseDailyRoundLimit}회까지만 등록할 수 있습니다.` };
  }
  const sameModeAmount = sameDayRows.filter((r) => r.mode === input.mode).reduce((s, r) => s + Number(r.amount_snapshot), 0);
  if (sameModeAmount + rate.unitPrice > rate.dailyCapAmount) {
    const remain = Math.max(0, rate.dailyCapAmount - sameModeAmount);
    return { ok: false, error: `같은 날 ${input.mode === 'online' ? '온라인' : '오프라인'} 일일 상한(${rate.dailyCapAmount.toLocaleString('ko-KR')}원)을 넘습니다. 남은 한도 ${remain.toLocaleString('ko-KR')}원.` };
  }

  // 5) 멘토 1일 건수 + 6) 시간 겹침
  const { data: mentorDay } = await admin
    .from('mentoring_logs')
    .select('id, case_id, started_at, ended_at')
    .eq('mentor_id', input.mentorId)
    .gte('started_at', dayStart)
    .lte('started_at', dayEnd);
  const otherCases = new Set((mentorDay ?? []).map((r) => r.case_id).filter((id) => id !== c.id));
  if (otherCases.size + 1 > limits.mentorDailyCaseLimit) {
    return { ok: false, error: `멘토는 하루 최대 ${limits.mentorDailyCaseLimit}명(건)의 멘티만 컨설팅할 수 있습니다.` };
  }
  const overlap = (mentorDay ?? []).find((r) => new Date(r.started_at) < ended && new Date(r.ended_at) > started);
  if (overlap) return { ok: false, error: '같은 시간대에 이미 등록된 회차가 있습니다. 시간을 확인하세요.' };

  // 저장
  const { data: log, error: insErr } = await admin
    .from('mentoring_logs')
    .insert({
      case_id: c.id,
      mentor_id: input.mentorId,
      round_no: roundNo,
      mode: input.mode,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      place: input.place?.trim() || null,
      participants: participants as never,
      report_registered_at: null,
      unit_price_snapshot: rate.unitPrice,
      amount_snapshot: rate.unitPrice,
      rate_id: rate.rateId,
      is_extra: roundNo > group.required_rounds,
    })
    .select('id')
    .single();
  if (insErr || !log) {
    if (insErr?.code === '23505') return { ok: false, error: '동시에 등록이 겹쳤습니다. 새로고침 후 다시 시도하세요.' };
    return { ok: false, error: insErr?.message ?? '회차 저장에 실패했습니다.' };
  }

  // 첫 회차: mentor_assigned → in_progress
  if (c.status === 'mentor_assigned') {
    const { data: moved } = await admin
      .from('cases')
      .update({ status: 'in_progress' })
      .eq('id', c.id)
      .in('status', [...TRANSITIONS.submit_round.from])
      .select('id');
    if (moved && moved.length > 0) {
      await admin.from('case_status_history').insert({
        case_id: c.id,
        from_status: 'mentor_assigned',
        to_status: 'in_progress',
        changed_by: input.mentorId,
        note: '1회차 등록 → 컨설팅 진행 중',
      });
    }
  }

  await admin.from('audit_logs').insert({
    actor_id: input.mentorId,
    program_id: c.program_id,
    action: 'round.create',
    entity_type: 'mentoring_logs',
    entity_id: log.id,
    metadata: {
      case_id: c.id,
      round_no: roundNo,
      mode: input.mode,
      amount: rate.unitPrice,
      participants: participants.length,
      planned: started.getTime() > Date.now(),
    },
  });
  return { ok: true, caseId: c.id, logId: log.id, roundNo };
}

/** 2단계 — 실서류(멘토링 보고서) 등록. 웹 작성 또는 파일 업로드 + 사진. 진행이 끝난 회차만 가능. */
export interface RoundReportInput {
  logId: string;
  mentorId: string;
  topic?: string;
  content?: string; // 웹 작성이면 필수
  result?: string;
  /** 브라우저가 documents 버킷 `_staging/…` 로 직접 올린 보고서 파일 (파일 업로드 방식) */
  reportFile?: { stagingPath: string; fileName: string; mimeType: string } | null;
  /** photos 버킷 `_staging/…` 경로들 */
  photoPaths: string[];
}

export async function registerRoundReport(input: RoundReportInput): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: log } = await admin
    .from('mentoring_logs')
    .select('id, case_id, mentor_id, round_no, settlement_id, report_registered_at, started_at, cases!inner(status, program_id, support_type_id, mentee_id)')
    .eq('id', input.logId)
    .maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (log.mentor_id !== input.mentorId) return { ok: false, error: '이 회차의 담당 멘토가 아닙니다.' };
  if (log.settlement_id) return { ok: false, error: '정산에 포함된 회차입니다.' };
  if (log.report_registered_at) return { ok: false, error: '이미 보고서가 등록된 회차입니다.' };
  const c = log.cases as unknown as { status: string; program_id: string; support_type_id: string; mentee_id: string | null };
  const denied = assertTransition('submit_round', c.status as never);
  if (denied) return { ok: false, error: denied };
  if (new Date(log.started_at).getTime() > Date.now()) {
    return { ok: false, error: '아직 진행 전(계획) 회차입니다. 멘토링을 진행한 뒤 보고서를 등록하세요.' };
  }

  const reportKind: 'web' | 'file' = input.reportFile ? 'file' : 'web';
  if (reportKind === 'web' && !(input.content ?? '').trim()) return { ok: false, error: '컨설팅 내용을 입력하거나 보고서 파일을 첨부하세요.' };
  if (reportKind === 'file' && !isStaging(input.reportFile!.stagingPath)) return { ok: false, error: '잘못된 업로드 경로입니다.' };

  const { error: upErr } = await admin
    .from('mentoring_logs')
    .update({
      topic: input.topic?.trim() || null,
      content: reportKind === 'web' ? input.content!.trim() : null,
      result: input.result?.trim() || null,
      report_kind: reportKind,
      report_registered_at: new Date().toISOString(),
    })
    .eq('id', log.id)
    .is('report_registered_at', null);
  if (upErr) return { ok: false, error: upErr.message };

  // 첨부: 보고서 파일 · 사진 (스테이징 → 케이스 폴더)
  if (input.reportFile) {
    const moved = await moveStaging('documents', log.case_id, input.reportFile.stagingPath);
    if (moved) {
      await admin.from('documents').insert({
        case_id: log.case_id,
        doc_key: reportDocKey(log.id),
        doc_name: input.reportFile.fileName || `${log.round_no}회차 보고서`,
        storage_path: moved.dest,
        sha256: moved.sha256,
        uploaded_by: input.mentorId,
        uploaded_role: 'mentor',
        file_size: moved.size,
        mime_type: input.reportFile.mimeType || 'application/octet-stream',
      });
    }
  }
  await attachPhotos(log.case_id, log.id, input.mentorId, input.photoPaths);
  // 웹 작성 보고서 → 행사/그룹 양식 PDF (멘토 자동 서명 정책 반영). 실패해도 등록은 유지(감사로그).
  if (reportKind === 'web') await renderRoundReport(log.id);

  // 멘티 확인 서명 정책이 켜져 있을 때만 "확인·서명" 안내 발송 — 서명 대상(보고서)이 생긴 지금 보낸다
  const reportPolicy = await resolveRoundReportPolicy(c.program_id, c.support_type_id);
  if (c.mentee_id && reportPolicy.menteeConfirmSignature) {
    await queueNotification(admin, { caseId: log.case_id, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'round_registered' });
  }
  await admin.from('audit_logs').insert({
    actor_id: input.mentorId,
    program_id: c.program_id,
    action: 'round.report',
    entity_type: 'mentoring_logs',
    entity_id: log.id,
    metadata: { case_id: log.case_id, round_no: log.round_no, report_kind: reportKind, photos: input.photoPaths.length },
  });
  return { ok: true, caseId: log.case_id };
}

/** 회차 수정(본문·장소·주제·결과·사진 추가). 일시·유형·단가는 잠금(정산 근거) — 잘못 등록했으면 삭제 후 재등록. */
export async function updateRound(input: {
  logId: string;
  mentorId: string;
  place?: string;
  topic?: string;
  content?: string;
  result?: string;
  photoPaths: string[];
}): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: log } = await admin.from('mentoring_logs').select('id, case_id, mentor_id, settlement_id, report_kind, report_registered_at, mentee_signed_at, cases!inner(status, program_id)').eq('id', input.logId).maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (log.settlement_id) return { ok: false, error: '정산에 포함된 회차는 수정할 수 없습니다.' };
  if (log.mentee_signed_at) return { ok: false, error: '멘티가 서명한 회차는 내용을 수정할 수 없습니다.' };
  if (!log.report_registered_at) return { ok: false, error: '아직 보고서가 등록되지 않은 회차입니다. [보고서 등록]을 이용하세요.' };
  const c = log.cases as unknown as { status: string; program_id: string };
  const denied = assertTransition('submit_round', c.status as never);
  if (denied) return { ok: false, error: denied };
  if (log.report_kind === 'web' && !(input.content ?? '').trim()) return { ok: false, error: '컨설팅 내용을 입력하세요.' };

  const { error } = await admin
    .from('mentoring_logs')
    .update({
      place: input.place?.trim() || null,
      topic: input.topic?.trim() || null,
      content: log.report_kind === 'web' ? input.content!.trim() : null,
      result: input.result?.trim() || null,
    })
    .eq('id', input.logId);
  if (error) return { ok: false, error: error.message };
  await attachPhotos(log.case_id, log.id, input.mentorId, input.photoPaths);
  if (log.report_kind === 'web') await renderRoundReport(log.id);
  await admin.from('audit_logs').insert({
    actor_id: input.mentorId,
    program_id: c.program_id,
    action: 'round.update',
    entity_type: 'mentoring_logs',
    entity_id: log.id,
    metadata: { photos_added: input.photoPaths.length },
  });
  return { ok: true, caseId: log.case_id };
}

/** 회차 삭제 — 마지막 회차만, 정산 미포함, 종결 요청 전. 삭제 후 회차 번호가 이어진다. */
export async function deleteRound(logId: string, mentorId: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: log } = await admin.from('mentoring_logs').select('id, case_id, round_no, settlement_id, cases!inner(status, program_id)').eq('id', logId).maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (log.settlement_id) return { ok: false, error: '정산에 포함된 회차는 삭제할 수 없습니다.' };
  const c = log.cases as unknown as { status: string; program_id: string };
  const denied = assertTransition('submit_round', c.status as never);
  if (denied) return { ok: false, error: denied };
  const { count } = await admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', log.case_id);
  if ((count ?? 0) !== log.round_no) return { ok: false, error: '마지막 회차만 삭제할 수 있습니다.' };

  const { data: docs } = await admin.from('documents').select('id, storage_path, doc_key').eq('case_id', log.case_id).in('doc_key', [photoDocKey(logId), reportDocKey(logId)]);
  for (const d of docs ?? []) {
    const bucket = d.doc_key.startsWith('mentoring_photo:') ? 'photos' : 'documents';
    await admin.storage.from(bucket).remove([d.storage_path]);
  }
  if ((docs ?? []).length > 0) await admin.from('documents').delete().in('id', (docs ?? []).map((d) => d.id));
  const { error } = await admin.from('mentoring_logs').delete().eq('id', logId);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({
    actor_id: mentorId,
    program_id: c.program_id,
    action: 'round.delete',
    entity_type: 'mentoring_logs',
    entity_id: logId,
    metadata: { case_id: log.case_id, round_no: log.round_no },
  });
  return { ok: true, caseId: log.case_id };
}

async function moveStaging(bucket: 'documents' | 'photos', caseId: string, stagingPath: string): Promise<{ dest: string; sha256: string; size: number; mime: string } | null> {
  if (!isStaging(stagingPath)) return null;
  const admin = createAdminClient();
  const basename = stagingPath.split('/').pop();
  if (!basename) return null;
  const { data: blob } = await admin.storage.from(bucket).download(stagingPath);
  if (!blob) return null;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const dest = `${caseId}/${basename}`;
  try {
    await moveFile(bucket, stagingPath, dest);
  } catch {
    return null;
  }
  return { dest, sha256: sha256Hex(buffer), size: buffer.byteLength, mime: blob.type || 'application/octet-stream' };
}

async function attachPhotos(caseId: string, logId: string, uploadedBy: string, stagingPaths: string[]): Promise<void> {
  const admin = createAdminClient();
  for (const p of stagingPaths.slice(0, 20)) {
    const moved = await moveStaging('photos', caseId, p);
    if (!moved) continue;
    await admin.from('documents').insert({
      case_id: caseId,
      doc_key: photoDocKey(logId),
      doc_name: '컨설팅 사진',
      storage_path: moved.dest,
      sha256: moved.sha256,
      uploaded_by: uploadedBy,
      uploaded_role: 'mentor',
      file_size: moved.size,
      mime_type: moved.mime.startsWith('image/') ? moved.mime : 'image/jpeg',
    });
  }
}
