import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { actingNote } from '@/lib/auth/impersonation';
import { logAudit } from '@/lib/workflow/audit';
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

/** 첨부 상한 (P31) — 클라이언트 사전 검증과 같은 값을 서버에서 강제한다 */
const MAX_PHOTOS = 10;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const REPORT_MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = new Set(['pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xlsx', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'heic']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.hancom.hwp',
  'application/hwp+zip',
  'application/vnd.hancom.hwpx',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** 보고서 파일 형식 검증 (P31) — 확장자 허용목록 + MIME(브라우저가 hwp 등을 빈값/octet-stream 으로 보내는 경우 허용) */
function validateReportFile(fileName: string, mimeType: string): string | null {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return '보고서 파일은 PDF·HWP·HWPX·DOC·DOCX·XLSX·PPTX·JPG·PNG·WEBP·HEIC 형식만 올릴 수 있습니다.';
  const mime = (mimeType || '').toLowerCase();
  if (mime && mime !== 'application/octet-stream' && !ALLOWED_MIME.has(mime)) return `허용되지 않는 파일 형식입니다 (${mime}).`;
  return null;
}

/**
 * 회차 일자 하한 (P31) — 케이스 등록일과 (그 멘토의) 배정일 중 늦은 날짜. 그 이전 일자로는 회차를 등록·수정할 수 없다.
 * 대행 중 담당자가 과거 일자를 잘못 입력하거나 이전 멘토 기간을 침범하는 것을 막는다.
 */
async function roundDayLowerBound(caseId: string, mentorId: string): Promise<string | null> {
  const admin = createAdminClient();
  const [{ data: c }, { data: a }] = await Promise.all([
    admin.from('cases').select('created_at').eq('id', caseId).maybeSingle(),
    admin.from('mentor_assignments').select('assigned_at').eq('case_id', caseId).eq('mentor_id', mentorId).order('assigned_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const days = [c?.created_at, a?.assigned_at].filter((d): d is string => !!d).map((d) => kstDate(d));
  if (days.length === 0) return null;
  return days.sort()[days.length - 1] ?? null;
}

function lowerBoundError(minDay: string): string {
  const [, m, d] = minDay.split('-');
  return `배정일(${Number(m)}/${Number(d)}) 이전 일자는 등록할 수 없습니다.`;
}

function noRateError(day: string): string {
  return `해당 일자(${day})에 적용되는 단가가 없습니다. 운영 설정의 단가 적용 시작일을 확인하세요.`;
}

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
  // 배정일(케이스 등록일·멘토 배정일) 이전 일자 차단 (P31)
  const minDay = await roundDayLowerBound(c.id, input.mentorId);
  if (minDay && day < minDay) return { ok: false, error: lowerBoundError(minDay) };

  const participants = normalizeParticipants(input.participants);
  if (participants.length === 0) return { ok: false, error: '참가자를 1명 이상 선택하세요.' };

  // 3) 회차 상한 = 그룹 회차 + 승인된 추가 회차
  const [{ data: group }, { count: existingCount }, allowance] = await Promise.all([
    admin.from('support_types').select('required_rounds, status, ends_on').eq('id', c.support_type_id).maybeSingle(),
    admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', c.id),
    getRoundAllowance(c.id),
  ]);
  if (!group) return { ok: false, error: '사업그룹을 찾을 수 없습니다.' };
  // 그룹 종료일 이후 일정은 등록 불가 (P30) — 운영사가 종료일을 늘리거나 승계 개설로 이어간다
  if (group.ends_on && day > group.ends_on) return { ok: false, error: `그룹 종료일(${group.ends_on}) 이후 일정은 등록할 수 없습니다. 운영사에 문의하세요.` };
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
  if (!rate) return { ok: false, error: noRateError(day) };
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
        note: await actingNote('1회차 등록 → 컨설팅 진행 중', input.mentorId), // 대행 중이면 표기 (P31)
      });
    }
  }

  await logAudit(admin, {
    actorId: input.mentorId,
    programId: c.program_id,
    action: 'round.create',
    entityType: 'mentoring_logs',
    entityId: log.id,
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
    .select('id, case_id, mentor_id, round_no, mode, started_at, ended_at, settlement_id, report_registered_at, cases!inner(status, program_id, support_type_id, mentee_id)')
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
  // 첨부 서버 검증 (P31) — 사진 장수·형식, 보고서 형식. 크기는 스테이징 파일을 내려받아 확인한다(moveStaging).
  const photoPaths = Array.isArray(input.photoPaths) ? input.photoPaths : [];
  if (photoPaths.length > MAX_PHOTOS) return { ok: false, error: `사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다.` };
  if (input.reportFile) {
    const bad = validateReportFile(input.reportFile.fileName, input.reportFile.mimeType);
    if (bad) return { ok: false, error: bad };
  }

  // (P31) 단가·추가 회차 판정은 보고서 등록 시점(수행일 기준)으로 재확정 — 계획 등록 뒤 단가 적용일·필수 회차·추가 승인이 바뀌었을 수 있다.
  // 같은 날 합산 상한·멘토 1일 건수·시간 겹침도 등록과 같은 규칙으로 다시 통과해야 한다. 정산에 포함된 회차는 위에서 이미 차단.
  const [{ data: group }, allowance] = await Promise.all([
    admin.from('support_types').select('required_rounds').eq('id', c.support_type_id).maybeSingle(),
    getRoundAllowance(log.case_id),
  ]);
  if (!group) return { ok: false, error: '사업그룹을 찾을 수 없습니다.' };
  const v = await validateRoundSchedule({
    caseId: log.case_id,
    mentorId: log.mentor_id,
    programId: c.program_id,
    supportTypeId: c.support_type_id,
    mode: log.mode,
    started: new Date(log.started_at),
    ended: new Date(log.ended_at),
    excludeLogId: log.id,
    enforceLowerBound: false,
  });
  if (!v.ok) return v;
  const isExtra = log.round_no > group.required_rounds;
  const allowanceExceeded = log.round_no > group.required_rounds + allowance.approvedExtra;

  // 첨부를 먼저 옮기고 documents 행을 만든다 — 전부 성공했을 때만 report_registered_at 을 기록한다 (P31).
  // 실패하면 옮긴 파일·만든 행을 되돌린다(등록됐는데 첨부가 없는 반쪽 상태 방지).
  const movedFiles: { bucket: 'documents' | 'photos'; path: string }[] = [];
  const insertedDocIds: string[] = [];
  const rollback = async () => {
    const byBucket = { documents: [] as string[], photos: [] as string[] };
    for (const f of movedFiles) byBucket[f.bucket].push(f.path);
    if (byBucket.documents.length) await admin.storage.from('documents').remove(byBucket.documents);
    if (byBucket.photos.length) await admin.storage.from('photos').remove(byBucket.photos);
    if (insertedDocIds.length) await admin.from('documents').delete().in('id', insertedDocIds);
  };

  if (input.reportFile) {
    const moved = await moveStaging('documents', log.case_id, input.reportFile.stagingPath, REPORT_MAX_BYTES);
    if (!moved.ok) return { ok: false, error: moved.error };
    movedFiles.push({ bucket: 'documents', path: moved.dest });
    const { data: doc, error: docErr } = await admin
      .from('documents')
      .insert({
        case_id: log.case_id,
        doc_key: reportDocKey(log.id),
        doc_name: input.reportFile.fileName || `${log.round_no}회차 보고서`,
        storage_path: moved.dest,
        sha256: moved.sha256,
        uploaded_by: input.mentorId,
        uploaded_role: 'mentor',
        file_size: moved.size,
        mime_type: input.reportFile.mimeType || moved.mime || 'application/octet-stream',
      })
      .select('id')
      .single();
    if (docErr || !doc) {
      await rollback();
      return { ok: false, error: `보고서 파일 등록에 실패했습니다: ${docErr?.message ?? '알 수 없는 오류'}` };
    }
    insertedDocIds.push(doc.id);
  }
  const photos = await attachPhotos(log.case_id, log.id, input.mentorId, photoPaths);
  movedFiles.push(...photos.moved.map((path) => ({ bucket: 'photos' as const, path })));
  insertedDocIds.push(...photos.docIds);
  if (!photos.ok) {
    await rollback();
    return { ok: false, error: photos.error };
  }

  const { data: registered, error: upErr } = await admin
    .from('mentoring_logs')
    .update({
      topic: input.topic?.trim() || null,
      content: reportKind === 'web' ? input.content!.trim() : null,
      result: input.result?.trim() || null,
      report_kind: reportKind,
      report_registered_at: new Date().toISOString(),
      unit_price_snapshot: v.rate.unitPrice,
      amount_snapshot: v.rate.unitPrice,
      rate_id: v.rate.rateId,
      is_extra: isExtra,
    })
    .eq('id', log.id)
    .is('report_registered_at', null)
    .is('settlement_id', null)
    .select('id');
  if (upErr || !registered || registered.length === 0) {
    await rollback();
    return { ok: false, error: upErr?.message ?? '이미 보고서가 등록된 회차입니다. 새로고침 후 확인하세요.' };
  }

  // 웹 작성 보고서 → 행사/그룹 양식 PDF (멘토 자동 서명 정책 반영). 실패해도 등록은 유지(감사로그).
  if (reportKind === 'web') await renderRoundReport(log.id);

  // 멘티 확인 서명 정책이 켜져 있을 때만 "확인·서명" 안내 발송 — 서명 대상(보고서)이 생긴 지금 보낸다
  const reportPolicy = await resolveRoundReportPolicy(c.program_id, c.support_type_id);
  if (c.mentee_id && reportPolicy.menteeConfirmSignature) {
    await queueNotification(admin, { caseId: log.case_id, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'round_registered', payload: { log_id: log.id, round_no: log.round_no } });
  }
  await logAudit(admin, {
    actorId: input.mentorId,
    programId: c.program_id,
    action: 'round.report',
    entityType: 'mentoring_logs',
    entityId: log.id,
    metadata: { case_id: log.case_id, round_no: log.round_no, report_kind: reportKind, photos: photoPaths.length, amount: v.rate.unitPrice, is_extra: isExtra, ...(allowanceExceeded ? { allowance_exceeded: true } : {}) },
  });

  // 목표 회차(그룹 required_rounds) 보고서 등록 완료 → 멘티 만족도 조사 자동 개시 (P20)
  const { count: reported } = await admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', log.case_id).not('report_registered_at', 'is', null);
  if ((reported ?? 0) >= group.required_rounds) {
    await admin.from('cases').update({ survey_opened_at: new Date().toISOString() }).eq('id', log.case_id).is('survey_opened_at', null);
  }

  return { ok: true, caseId: log.case_id };
}

/** 회차 수정(본문·장소·주제·결과·사진 추가). 일시·유형·단가는 잠금(정산 근거) — 잘못 등록했으면 삭제 후 재등록. */
export async function updateRound(input: {
  logId: string;
  mentorId: string;
  /** 호출 화면의 케이스 — 다른 케이스의 logId 로 수정하는 것을 막는다 (P30) */
  caseId?: string;
  place?: string;
  topic?: string;
  content?: string;
  result?: string;
  photoPaths: string[];
}): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: log } = await admin.from('mentoring_logs').select('id, case_id, mentor_id, settlement_id, report_kind, report_registered_at, mentee_signed_at, cases!inner(status, program_id)').eq('id', input.logId).maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (input.caseId && log.case_id !== input.caseId) return { ok: false, error: '이 케이스의 회차가 아닙니다.' };
  if (log.mentor_id !== input.mentorId) return { ok: false, error: '다른 멘토가 진행한 회차는 수정할 수 없습니다.' };
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
  const photos = await attachPhotos(log.case_id, log.id, input.mentorId, Array.isArray(input.photoPaths) ? input.photoPaths : []);
  if (!photos.ok) {
    if (photos.moved.length) await admin.storage.from('photos').remove(photos.moved);
    return { ok: false, error: photos.error };
  }
  if (log.report_kind === 'web') await renderRoundReport(log.id);
  await logAudit(admin, {
    actorId: input.mentorId,
    programId: c.program_id,
    action: 'round.update',
    entityType: 'mentoring_logs',
    entityId: log.id,
    metadata: { case_id: log.case_id, photos_added: input.photoPaths.length },
  });
  return { ok: true, caseId: log.case_id };
}

/**
 * 계획(미보고) 회차의 일정 수정 (P20) — 일자·시각·유형·장소.
 * 보고서(2단계) 등록 전 회차만. 일자·유형이 바뀌면 단가 스냅샷을 다시 확정하고,
 * 등록과 같은 검증(일일 상한·멘토 1일 건수·시간 겹침)을 자기 자신 제외로 다시 수행한다.
 */
export async function updatePlannedRound(input: {
  logId: string;
  mentorId: string;
  caseId?: string;
  mode: ConsultingMode;
  startedAt: string;
  endedAt: string;
  place?: string;
}): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: log } = await admin
    .from('mentoring_logs')
    .select('id, case_id, round_no, settlement_id, report_registered_at, cases!inner(status, program_id, support_type_id)')
    .eq('id', input.logId)
    .maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (input.caseId && log.case_id !== input.caseId) return { ok: false, error: '이 케이스의 회차가 아닙니다.' };
  if (log.settlement_id) return { ok: false, error: '정산에 포함된 회차는 수정할 수 없습니다.' };
  if (log.report_registered_at) return { ok: false, error: '보고서가 등록된 회차는 일정을 바꿀 수 없습니다. (내용 수정은 [회차 수정])' };
  const c = log.cases as unknown as { status: string; program_id: string; support_type_id: string };
  const denied = assertTransition('submit_round', c.status as never);
  if (denied) return { ok: false, error: denied };

  const started = new Date(input.startedAt);
  const ended = new Date(input.endedAt);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return { ok: false, error: '일시를 확인하세요.' };
  if (ended <= started) return { ok: false, error: '종료 시각은 시작 시각보다 늦어야 합니다.' };
  if (started.getTime() > Date.now() + PLAN_MAX_FUTURE_MS) return { ok: false, error: '60일 이후의 일정으로는 변경할 수 없습니다.' };
  if (kstDate(started) !== kstDate(ended)) return { ok: false, error: '한 회차는 같은 날 안에서 끝나야 합니다.' };
  const day = kstDate(started);
  const minDay = await roundDayLowerBound(log.case_id, input.mentorId);
  if (minDay && day < minDay) return { ok: false, error: lowerBoundError(minDay) };

  const [rate, limits] = await Promise.all([
    resolveRate(c.program_id, c.support_type_id, input.mode, day),
    resolveLimits(c.program_id, c.support_type_id, day),
  ]);
  if (!rate) return { ok: false, error: noRateError(day) };
  if (!limits) return { ok: false, error: '운영 한도가 설정되지 않았습니다. 운영사 설정을 확인하세요.' };

  const dayStart = new Date(`${day}T00:00:00+09:00`).toISOString();
  const dayEnd = new Date(`${day}T23:59:59.999+09:00`).toISOString();
  const { data: sameDay } = await admin
    .from('mentoring_logs')
    .select('id, mode, amount_snapshot')
    .eq('case_id', log.case_id)
    .gte('started_at', dayStart)
    .lte('started_at', dayEnd)
    .neq('id', log.id);
  const sameDayRows = sameDay ?? [];
  if (sameDayRows.length + 1 > limits.caseDailyRoundLimit) {
    return { ok: false, error: `같은 멘티에게는 하루 최대 ${limits.caseDailyRoundLimit}회까지만 등록할 수 있습니다.` };
  }
  const sameModeAmount = sameDayRows.filter((r) => r.mode === input.mode).reduce((s, r) => s + Number(r.amount_snapshot), 0);
  if (sameModeAmount + rate.unitPrice > rate.dailyCapAmount) {
    return { ok: false, error: `같은 날 ${input.mode === 'online' ? '온라인' : '오프라인'} 일일 상한(${rate.dailyCapAmount.toLocaleString('ko-KR')}원)을 넘습니다.` };
  }
  const { data: mentorDay } = await admin
    .from('mentoring_logs')
    .select('id, case_id, started_at, ended_at')
    .eq('mentor_id', input.mentorId)
    .gte('started_at', dayStart)
    .lte('started_at', dayEnd)
    .neq('id', log.id);
  const otherCases = new Set((mentorDay ?? []).map((r) => r.case_id).filter((id) => id !== log.case_id));
  if (otherCases.size + 1 > limits.mentorDailyCaseLimit) {
    return { ok: false, error: `멘토는 하루 최대 ${limits.mentorDailyCaseLimit}명(건)의 멘티만 컨설팅할 수 있습니다.` };
  }
  const overlap = (mentorDay ?? []).find((r) => new Date(r.started_at) < ended && new Date(r.ended_at) > started);
  if (overlap) return { ok: false, error: '같은 시간대에 이미 등록된 회차가 있습니다. 시간을 확인하세요.' };

  const { error } = await admin
    .from('mentoring_logs')
    .update({
      mode: input.mode,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      place: input.place?.trim() || null,
      unit_price_snapshot: rate.unitPrice,
      amount_snapshot: rate.unitPrice,
      rate_id: rate.rateId,
    })
    .eq('id', log.id);
  if (error) return { ok: false, error: error.message };
  await logAudit(admin, {
    actorId: input.mentorId,
    programId: c.program_id,
    action: 'round.plan_update',
    entityType: 'mentoring_logs',
    entityId: log.id,
    metadata: { case_id: log.case_id, round_no: log.round_no, mode: input.mode, day },
  });
  return { ok: true, caseId: log.case_id };
}

/**
 * 계획(미보고) 회차 삭제 (P20) — 마지막이 아니어도, 그 뒤 회차가 전부 미보고·미정산이면
 * 삭제하고 뒤 회차 번호를 당긴다(is_extra 재계산).
 */
export async function deletePlannedRound(logId: string, mentorId: string, caseId?: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: log } = await admin
    .from('mentoring_logs')
    .select('id, case_id, round_no, settlement_id, report_registered_at, cases!inner(status, program_id, support_type_id)')
    .eq('id', logId)
    .maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (caseId && log.case_id !== caseId) return { ok: false, error: '이 케이스의 회차가 아닙니다.' };
  if (log.settlement_id) return { ok: false, error: '정산에 포함된 회차는 삭제할 수 없습니다.' };
  if (log.report_registered_at) return { ok: false, error: '보고서가 등록된 회차는 여기서 삭제할 수 없습니다.' };
  const c = log.cases as unknown as { status: string; program_id: string; support_type_id: string };
  const denied = assertTransition('submit_round', c.status as never);
  if (denied) return { ok: false, error: denied };

  const { data: after } = await admin
    .from('mentoring_logs')
    .select('id, round_no, report_registered_at, settlement_id')
    .eq('case_id', log.case_id)
    .gt('round_no', log.round_no)
    .order('round_no');
  if ((after ?? []).some((r) => r.report_registered_at || r.settlement_id)) {
    return { ok: false, error: '이 회차 뒤에 보고서가 등록된 회차가 있어 삭제할 수 없습니다.' };
  }

  const { error } = await admin.from('mentoring_logs').delete().eq('id', log.id);
  if (error) return { ok: false, error: error.message };
  // 뒤 회차 번호 당기기 + is_extra 재계산
  const { data: group } = await admin.from('support_types').select('required_rounds').eq('id', c.support_type_id).maybeSingle();
  const required = group?.required_rounds ?? 0;
  for (const r of after ?? []) {
    const newNo = r.round_no - 1;
    await admin.from('mentoring_logs').update({ round_no: newNo, is_extra: newNo > required }).eq('id', r.id);
  }
  await logAudit(admin, {
    actorId: mentorId,
    programId: c.program_id,
    action: 'round.plan_delete',
    entityType: 'mentoring_logs',
    entityId: logId,
    metadata: { case_id: log.case_id, round_no: log.round_no, renumbered: (after ?? []).length },
  });
  return { ok: true, caseId: log.case_id };
}

/** 회차 삭제 — 마지막 회차만, 정산 미포함, 종결 요청 전. 삭제 후 회차 번호가 이어진다. */
export async function deleteRound(logId: string, mentorId: string, caseId?: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: log } = await admin.from('mentoring_logs').select('id, case_id, round_no, mentor_id, settlement_id, mentee_signed_at, report_registered_at, cases!inner(status, program_id)').eq('id', logId).maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (caseId && log.case_id !== caseId) return { ok: false, error: '이 케이스의 회차가 아닙니다.' };
  if (log.report_registered_at && log.mentor_id !== mentorId) return { ok: false, error: '다른 멘토가 보고서를 등록한 회차는 삭제할 수 없습니다.' };
  if (log.mentee_signed_at) return { ok: false, error: '멘티가 서명한 회차는 삭제할 수 없습니다. 운영사에 정정을 요청하세요.' };
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
  await logAudit(admin, {
    actorId: mentorId,
    programId: c.program_id,
    action: 'round.delete',
    entityType: 'mentoring_logs',
    entityId: logId,
    metadata: { case_id: log.case_id, round_no: log.round_no },
  });
  return { ok: true, caseId: log.case_id };
}

/**
 * 일정 검증 공용 (P30) — 등록·계획 수정·운영사 정정이 같은 규칙을 읽는다.
 *  일일 상한(같은 멘티·같은 날 회차 수 + 유형별 금액) · 멘토 1일 건수 · 시간 겹침 · 단가 스냅샷.
 *  excludeLogId 가 있으면 자기 자신은 비교에서 뺀다.
 */
export async function validateRoundSchedule(input: {
  caseId: string;
  mentorId: string;
  programId: string;
  supportTypeId: string;
  mode: ConsultingMode;
  started: Date;
  ended: Date;
  excludeLogId?: string | null;
  /** 배정일 이전 일자 차단 (P31). 보고서 등록처럼 이미 확정된 일자를 재검증할 때는 false */
  enforceLowerBound?: boolean;
}): Promise<{ ok: true; day: string; rate: NonNullable<Awaited<ReturnType<typeof resolveRate>>> } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { started, ended } = input;
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return { ok: false, error: '일시를 확인하세요.' };
  if (ended <= started) return { ok: false, error: '종료 시각은 시작 시각보다 늦어야 합니다.' };
  if (kstDate(started) !== kstDate(ended)) return { ok: false, error: '한 회차는 같은 날 안에서 끝나야 합니다.' };
  const day = kstDate(started);
  if (input.enforceLowerBound !== false) {
    const minDay = await roundDayLowerBound(input.caseId, input.mentorId);
    if (minDay && day < minDay) return { ok: false, error: lowerBoundError(minDay) };
  }
  const [rate, limits] = await Promise.all([resolveRate(input.programId, input.supportTypeId, input.mode, day), resolveLimits(input.programId, input.supportTypeId, day)]);
  if (!rate) return { ok: false, error: noRateError(day) };
  if (!limits) return { ok: false, error: '운영 한도가 설정되지 않았습니다. 운영사 설정을 확인하세요.' };
  const dayStart = new Date(`${day}T00:00:00+09:00`).toISOString();
  const dayEnd = new Date(`${day}T23:59:59.999+09:00`).toISOString();
  let sameDayQ = admin.from('mentoring_logs').select('id, mode, amount_snapshot').eq('case_id', input.caseId).gte('started_at', dayStart).lte('started_at', dayEnd);
  if (input.excludeLogId) sameDayQ = sameDayQ.neq('id', input.excludeLogId);
  const { data: sameDay } = await sameDayQ;
  const sameDayRows = sameDay ?? [];
  if (sameDayRows.length + 1 > limits.caseDailyRoundLimit) return { ok: false, error: `같은 멘티에게는 하루 최대 ${limits.caseDailyRoundLimit}회까지만 등록할 수 있습니다.` };
  const sameModeAmount = sameDayRows.filter((r) => r.mode === input.mode).reduce((s, r) => s + Number(r.amount_snapshot), 0);
  if (sameModeAmount + rate.unitPrice > rate.dailyCapAmount) {
    const remain = Math.max(0, rate.dailyCapAmount - sameModeAmount);
    return { ok: false, error: `같은 날 ${input.mode === 'online' ? '온라인' : '오프라인'} 일일 상한(${rate.dailyCapAmount.toLocaleString('ko-KR')}원)을 넘습니다. 남은 한도 ${remain.toLocaleString('ko-KR')}원.` };
  }
  let mentorDayQ = admin.from('mentoring_logs').select('id, case_id, started_at, ended_at').eq('mentor_id', input.mentorId).gte('started_at', dayStart).lte('started_at', dayEnd);
  if (input.excludeLogId) mentorDayQ = mentorDayQ.neq('id', input.excludeLogId);
  const { data: mentorDay } = await mentorDayQ;
  const otherCases = new Set((mentorDay ?? []).map((r) => r.case_id).filter((id) => id !== input.caseId));
  if (otherCases.size + 1 > limits.mentorDailyCaseLimit) return { ok: false, error: `멘토는 하루 최대 ${limits.mentorDailyCaseLimit}명(건)의 멘티만 컨설팅할 수 있습니다.` };
  const overlap = (mentorDay ?? []).find((r) => new Date(r.started_at) < ended && new Date(r.ended_at) > started);
  if (overlap) return { ok: false, error: '같은 시간대에 이미 등록된 회차가 있습니다. 시간을 확인하세요.' };
  return { ok: true, day, rate };
}

/**
 * 운영사 회차 정정 (P30) — 일시·방법·장소를 사후 정정한다. 정산에 포함된 회차는 불가.
 * 보고서·멘티 서명이 있어도 허용하되 서명은 유지되며 감사에 그 사실을 남긴다(서명 대상 문서는 web 양식이면 재생성).
 * 등록과 같은 검증(일일 상한·멘토 1일 건수·시간 겹침·단가 스냅샷)을 다시 통과해야 한다. 호출부가 case.manage 권한을 검사한다.
 */
export async function correctRound(input: {
  caseId: string;
  logId: string;
  actorId: string;
  mode: ConsultingMode;
  startedAt: string;
  endedAt: string;
  place?: string;
  reason: string;
}): Promise<WorkflowResult> {
  if (!input.reason.trim()) return { ok: false, error: '정정 사유를 입력하세요.' };
  const admin = createAdminClient();
  const { data: log } = await admin
    .from('mentoring_logs')
    .select('id, case_id, mentor_id, round_no, mode, started_at, ended_at, place, unit_price_snapshot, amount_snapshot, rate_id, settlement_id, report_kind, report_registered_at, mentee_signed_at, cases!inner(status, program_id, support_type_id)')
    .eq('id', input.logId)
    .maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (log.case_id !== input.caseId) return { ok: false, error: '이 케이스의 회차가 아닙니다.' };
  if (log.settlement_id) return { ok: false, error: '정산에 포함된 회차는 정정할 수 없습니다. 정산 확정을 먼저 취소하세요.' };
  const c = log.cases as unknown as { status: string; program_id: string; support_type_id: string };
  if (c.status === 'closed' || c.status === 'withdrawn') return { ok: false, error: '종결·중도 종료된 케이스의 회차는 정정할 수 없습니다.' };
  const started = new Date(input.startedAt);
  const ended = new Date(input.endedAt);
  if (log.report_registered_at && started.getTime() > Date.now()) return { ok: false, error: '보고서가 등록된 회차는 미래 일시로 정정할 수 없습니다.' };
  if (started.getTime() > Date.now() + PLAN_MAX_FUTURE_MS) return { ok: false, error: '60일 이후의 일정으로는 변경할 수 없습니다.' };
  const v = await validateRoundSchedule({ caseId: log.case_id, mentorId: log.mentor_id, programId: c.program_id, supportTypeId: c.support_type_id, mode: input.mode, started, ended, excludeLogId: log.id });
  if (!v.ok) return v;
  const before = { mode: log.mode, started_at: log.started_at, ended_at: log.ended_at, place: log.place, unit_price_snapshot: log.unit_price_snapshot, amount_snapshot: log.amount_snapshot, rate_id: log.rate_id };
  const after = { mode: input.mode, started_at: started.toISOString(), ended_at: ended.toISOString(), place: input.place?.trim() || null, unit_price_snapshot: v.rate.unitPrice, amount_snapshot: v.rate.unitPrice, rate_id: v.rate.rateId };
  const { error } = await admin.from('mentoring_logs').update({ ...after, corrected_at: new Date().toISOString() }).eq('id', log.id).is('settlement_id', null);
  if (error) return { ok: false, error: error.message };
  if (log.report_kind === 'web' && log.report_registered_at) {
    const r = await renderRoundReport(log.id);
    if (!r.ok) console.error('round PDF regenerate after correction failed:', r.error);
  }
  await logAudit(admin, {
    actorId: input.actorId,
    programId: c.program_id,
    action: 'round.corrected',
    entityType: 'mentoring_logs',
    entityId: log.id,
    metadata: { case_id: log.case_id, round_no: log.round_no, mentor_id: log.mentor_id, reason: input.reason.trim(), before, after, signature_kept: !!log.mentee_signed_at, report_registered: !!log.report_registered_at },
  });
  return { ok: true, caseId: log.case_id };
}

type MovedFile = { ok: true; dest: string; sha256: string; size: number; mime: string } | { ok: false; error: string };

/** 스테이징 파일을 케이스 폴더로 옮긴다. 크기 상한을 넘으면 옮기지 않고 거부한다 (P31). */
async function moveStaging(bucket: 'documents' | 'photos', caseId: string, stagingPath: string, maxBytes: number): Promise<MovedFile> {
  if (!isStaging(stagingPath)) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const admin = createAdminClient();
  const basename = stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const { data: blob } = await admin.storage.from(bucket).download(stagingPath);
  if (!blob) return { ok: false, error: '업로드된 파일을 확인할 수 없습니다. 다시 첨부해 주세요.' };
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    await admin.storage.from(bucket).remove([stagingPath]);
    const mb = Math.round(maxBytes / 1024 / 1024);
    return { ok: false, error: bucket === 'photos' ? `사진 한 장은 ${mb}MB 이하여야 합니다.` : `보고서 파일은 ${mb}MB 이하만 올릴 수 있습니다.` };
  }
  const dest = `${caseId}/${basename}`;
  try {
    await moveFile(bucket, stagingPath, dest);
  } catch {
    return { ok: false, error: '파일 이동에 실패했습니다. 다시 첨부해 주세요.' };
  }
  return { ok: true, dest, sha256: sha256Hex(buffer), size: buffer.byteLength, mime: blob.type || 'application/octet-stream' };
}

/**
 * 사진 첨부 (P31) — 장수·크기·형식(image/*) 서버 검증, 병렬 이동. 실패하면 호출부가 moved·docIds 로 되돌린다.
 */
async function attachPhotos(
  caseId: string,
  logId: string,
  uploadedBy: string,
  stagingPaths: string[],
): Promise<{ ok: true; moved: string[]; docIds: string[] } | { ok: false; error: string; moved: string[]; docIds: string[] }> {
  const admin = createAdminClient();
  if (stagingPaths.length > MAX_PHOTOS) return { ok: false, error: `사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다.`, moved: [], docIds: [] };
  const results = await Promise.all(stagingPaths.map((p) => moveStaging('photos', caseId, p, PHOTO_MAX_BYTES)));
  const moved = results.filter((r): r is Extract<MovedFile, { ok: true }> => r.ok).map((r) => r.dest);
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) return { ok: false, error: failed.error, moved, docIds: [] };
  const okResults = results as Extract<MovedFile, { ok: true }>[];
  const notImage = okResults.find((r) => !r.mime.startsWith('image/'));
  if (notImage) return { ok: false, error: '사진은 이미지 파일(JPG·PNG·WEBP·HEIC)만 첨부할 수 있습니다.', moved, docIds: [] };
  if (okResults.length === 0) return { ok: true, moved, docIds: [] };
  const { data: docs, error } = await admin
    .from('documents')
    .insert(
      okResults.map((m) => ({
        case_id: caseId,
        doc_key: photoDocKey(logId),
        doc_name: '컨설팅 사진',
        storage_path: m.dest,
        sha256: m.sha256,
        uploaded_by: uploadedBy,
        uploaded_role: 'mentor' as const,
        file_size: m.size,
        mime_type: m.mime,
      })),
    )
    .select('id');
  if (error) return { ok: false, error: `사진 등록에 실패했습니다: ${error.message}`, moved, docIds: [] };
  return { ok: true, moved, docIds: (docs ?? []).map((d) => d.id) };
}

/**
 * 배정이 끝난 멘토의 미보고(계획만) 회차를 정리한다 — 교체·중도 종료·강제 종료 공용 (P30).
 * 남겨두면 새 멘토의 회차 상한이 줄고 보고서 등록도 mentor_id 불일치로 막힌다. 뒤 번호를 당기고 is_extra 를 재계산한다.
 */
export async function dropPlannedRoundsOfMentor(caseId: string, mentorId: string, actorId: string | null): Promise<number> {
  const admin = createAdminClient();
  const { data: planned } = await admin.from('mentoring_logs').select('id, round_no').eq('case_id', caseId).eq('mentor_id', mentorId).is('report_registered_at', null).is('settlement_id', null);
  if (!planned || planned.length === 0) return 0;
  const { error } = await admin.from('mentoring_logs').delete().in('id', planned.map((p) => p.id));
  if (error) {
    console.error('dropPlannedRoundsOfMentor failed:', error.message);
    return 0;
  }
  const [{ data: rest }, { data: c }] = await Promise.all([
    admin.from('mentoring_logs').select('id, round_no').eq('case_id', caseId).order('round_no'),
    admin.from('cases').select('program_id, support_types(required_rounds)').eq('id', caseId).maybeSingle(),
  ]);
  const required = (c?.support_types as unknown as { required_rounds: number } | null)?.required_rounds ?? 0;
  let no = 0;
  for (const r of rest ?? []) {
    no += 1;
    if (r.round_no !== no) await admin.from('mentoring_logs').update({ round_no: no, is_extra: no > required }).eq('id', r.id);
  }
  await logAudit(admin, { actorId, programId: c?.program_id ?? null, action: 'round.plan_dropped', entityType: 'cases', entityId: caseId, metadata: { case_id: caseId, mentor_id: mentorId, dropped: planned.length } });
  return planned.length;
}
