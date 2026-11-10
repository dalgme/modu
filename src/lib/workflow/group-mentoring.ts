import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { OVERLAP_LOOKBACK_MS, roundSpanError } from '@/lib/workflow/round-time';
import { HOURLY_ONLY_ERROR, isWholeHours, roundAmount } from '@/lib/settlement/round-amount';
import { resolveRate, kstDate, type ConsultingMode } from '@/lib/settlement/rates';
import { actingNote } from '@/lib/auth/impersonation';
import { logAudit } from '@/lib/workflow/audit';
import { TRANSITIONS } from '@/lib/workflow/transitions';
import { getRoundAllowance } from '@/lib/data/rounds';
import { firstEmptyRoundNo } from '@/lib/workflow/round-slots';
import { isGroupMatchingPublished } from '@/lib/matching/visibility';
import { menteeLabel } from '@/lib/utils/labels';
import {
  GROUP_MIN_MENTEES,
  groupMentoringSetting,
  groupSessionEditable,
  groupSessionLimitError,
  planGroupFee,
  type GroupFeeLog,
} from '@/lib/workflow/group-mentoring-rule';

/**
 * 그룹멘토링 (2026-11-04) — 세션 등록·일정 수정·삭제·수당 배정·멘토 화면 데이터.
 * 규칙(수당 대표 회차·횟수 제한·수정 가능 여부)은 group-mentoring-rule.ts 한 곳.
 * 배정 관계(멘토 ↔ 케이스)는 RLS 가 아니라 여기서 직접 확인한다(§6-2).
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const PLAN_MAX_FUTURE_MS = 60 * 24 * 60 * 60 * 1000;
const SUBMIT_FROM = new Set<string>(TRANSITIONS.submit_round.from as readonly string[]);

/** 세션 회차들의 수당 배정을 다시 맞춘다 — 세션 생성·보고서 등록·회차 삭제·단가 재적용 뒤에 부른다. 실패해도 본 작업은 유지(로그). */
export async function rebalanceGroupSession(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return;
  const admin = createAdminClient();
  const [{ data: session }, { data: logs, error }] = await Promise.all([
    admin.from('group_mentoring_sessions').select('id, program_id, support_type_id, mode, started_at, ended_at').eq('id', sessionId).maybeSingle(),
    admin.from('mentoring_logs').select('id, settlement_id, amount_snapshot, unit_price_snapshot, report_registered_at, group_fee_holder, created_at, rate_id').eq('group_session_id', sessionId).order('created_at').order('id'),
  ]);
  if (error) {
    console.error('rebalanceGroupSession read failed:', error.message);
    return;
  }
  if (!session) return;
  const rows = logs ?? [];
  if (rows.length === 0) {
    // 참여 회차가 모두 지워진 세션은 정리한다
    await admin.from('group_mentoring_sessions').delete().eq('id', sessionId);
    return;
  }
  const rate = await resolveRate(session.program_id, session.support_type_id, session.mode, kstDate(new Date(session.started_at)));
  if (!rate) return;
  const full = { unitPrice: rate.unitPrice, amount: roundAmount(rate.unitPrice, session.started_at, session.ended_at) };
  const feeLogs: GroupFeeLog[] = rows.map((r, i) => ({
    id: r.id,
    settled: !!r.settlement_id,
    amount: Number(r.amount_snapshot),
    unitPrice: Number(r.unit_price_snapshot),
    reportedAt: r.report_registered_at,
    holder: !!r.group_fee_holder,
    seq: i,
  }));
  for (const u of planGroupFee(feeLogs, full)) {
    const { error: upErr } = await admin
      .from('mentoring_logs')
      .update({ group_fee_holder: u.holder, unit_price_snapshot: u.unitPrice, amount_snapshot: u.amount, rate_id: rate.rateId })
      .eq('id', u.id)
      .is('settlement_id', null);
    if (upErr) console.error('rebalanceGroupSession update failed:', upErr.message);
  }
}

/** 여러 세션 한꺼번에 (단가 재적용·멘토 계획 회차 정리 뒤) */
export async function rebalanceGroupSessions(ids: Iterable<string | null | undefined>): Promise<void> {
  for (const id of Array.from(new Set(Array.from(ids).filter((x): x is string => !!x)))) await rebalanceGroupSession(id);
}

export interface GroupCaseOption {
  caseId: string;
  menteeName: string;
  nextRoundNo: number;
  maxRounds: number;
  /** 등록할 수 없으면 이유 */
  blocked: string | null;
}

export interface GroupSessionItem {
  id: string;
  mode: ConsultingMode;
  startedAt: string;
  endedAt: string;
  place: string | null;
  editable: boolean;
  fee: number;
  participants: { caseId: string; logId: string; menteeName: string; roundNo: number; reported: boolean; settled: boolean; holder: boolean }[];
}

export interface GroupMentoringRound {
  groupId: string;
  groupName: string;
  enabled: boolean;
  maxPerMentor: number;
  used: number;
  limitError: string | null;
  rates: { online: number | null; offline: number | null };
  cases: GroupCaseOption[];
  sessions: GroupSessionItem[];
}

/** 멘토가 활성 배정된 케이스 (행사·그룹 범위, 매칭 공개 라운드만) */
async function mentorActiveCases(mentorId: string, programId: string, supportTypeId: string | null) {
  const admin = createAdminClient();
  const { data: asg } = await admin.from('mentor_assignments').select('case_id').eq('mentor_id', mentorId).eq('is_active', true);
  const ids = (asg ?? []).map((a) => a.case_id);
  if (ids.length === 0) return [];
  let q = admin.from('cases').select('id, status, program_id, support_type_id, owner_name, business_name, mentee_id').in('id', ids).eq('program_id', programId);
  if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
  const { data } = await q;
  return data ?? [];
}

/** 멘토 [그룹멘토링] 화면 데이터 — 라운드별 사용 여부·사용 횟수·등록 가능한 매칭 멘티·등록한 세션 */
export async function loadMentorGroupMentoring(mentorId: string, programId: string, supportTypeId: string | null): Promise<GroupMentoringRound[]> {
  const admin = createAdminClient();
  const cases = await mentorActiveCases(mentorId, programId, supportTypeId);
  let gq = admin.from('support_types').select('*').eq('program_id', programId);
  if (supportTypeId) gq = gq.eq('id', supportTypeId);
  const [{ data: groups }, { data: sessions }] = await Promise.all([
    gq,
    (() => {
      let q = admin.from('group_mentoring_sessions').select('id, support_type_id, mode, started_at, ended_at, place').eq('program_id', programId).eq('mentor_id', mentorId).order('started_at');
      if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
      return q;
    })(),
  ]);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: sLogs } = sessionIds.length
    ? await admin.from('mentoring_logs').select('id, case_id, round_no, group_session_id, report_registered_at, settlement_id, group_fee_holder, amount_snapshot').in('group_session_id', sessionIds)
    : { data: [] as never[] };
  const logCaseIds = Array.from(new Set((sLogs ?? []).map((l) => l.case_id)));
  const { data: logCases } = logCaseIds.length ? await admin.from('cases').select('id, owner_name, business_name').in('id', logCaseIds) : { data: [] as never[] };
  const caseName = new Map<string, string>();
  for (const c of [...(logCases ?? []), ...cases]) caseName.set(c.id, menteeLabel(c.owner_name ?? '', c.business_name));

  const out: GroupMentoringRound[] = [];
  for (const g of groups ?? []) {
    const setting = groupMentoringSetting(g);
    const myCases = cases.filter((c) => c.support_type_id === g.id);
    const mySessions = (sessions ?? []).filter((s) => s.support_type_id === g.id);
    if (!setting.enabled && mySessions.length === 0) continue;
    if (myCases.length === 0 && mySessions.length === 0) continue;
    if (!(await isGroupMatchingPublished(g.id))) continue;
    const [{ data: on }, { data: off }] = await Promise.all([
      resolveRate(programId, g.id, 'online', kstDate(new Date())).then((r) => ({ data: r })),
      resolveRate(programId, g.id, 'offline', kstDate(new Date())).then((r) => ({ data: r })),
    ]);
    const options: GroupCaseOption[] = [];
    for (const c of myCases) {
      const [{ data: rows }, allowance] = await Promise.all([admin.from('mentoring_logs').select('round_no').eq('case_id', c.id), getRoundAllowance(c.id)]);
      const next = firstEmptyRoundNo((rows ?? []).map((r) => r.round_no));
      const max = g.required_rounds + allowance.approvedExtra;
      const blocked = !SUBMIT_FROM.has(c.status) ? '지금 단계에서는 회차를 등록할 수 없습니다.' : next > max ? `회차를 모두 등록했습니다 (${max}회).` : null;
      options.push({ caseId: c.id, menteeName: caseName.get(c.id) ?? '-', nextRoundNo: next, maxRounds: max, blocked });
    }
    options.sort((a, b) => a.menteeName.localeCompare(b.menteeName, 'ko'));
    const items: GroupSessionItem[] = mySessions.map((s) => {
      const parts = (sLogs ?? [])
        .filter((l) => l.group_session_id === s.id)
        .map((l) => ({ caseId: l.case_id, logId: l.id, menteeName: caseName.get(l.case_id) ?? '-', roundNo: l.round_no, reported: !!l.report_registered_at, settled: !!l.settlement_id, holder: !!l.group_fee_holder }))
        .sort((a, b) => a.menteeName.localeCompare(b.menteeName, 'ko'));
      const fee = (sLogs ?? []).filter((l) => l.group_session_id === s.id).reduce((sum, l) => sum + Number(l.amount_snapshot), 0);
      return { id: s.id, mode: s.mode, startedAt: s.started_at, endedAt: s.ended_at, place: s.place, editable: groupSessionEditable(parts), fee, participants: parts };
    });
    out.push({
      groupId: g.id,
      groupName: g.name,
      enabled: setting.enabled,
      maxPerMentor: setting.maxPerMentor,
      used: mySessions.length,
      limitError: groupSessionLimitError(mySessions.length, setting.maxPerMentor),
      rates: { online: on?.unitPrice ?? null, offline: off?.unitPrice ?? null },
      cases: options,
      sessions: items,
    });
  }
  return out.sort((a, b) => a.groupName.localeCompare(b.groupName, 'ko'));
}

interface ScheduleInput {
  mode: ConsultingMode;
  startedAt: string;
  endedAt: string;
  place?: string;
}

function checkTimes(input: ScheduleInput): Result<{ started: Date; ended: Date; day: string }> {
  const started = new Date(input.startedAt);
  const ended = new Date(input.endedAt);
  if (input.mode !== 'online' && input.mode !== 'offline') return { ok: false, error: '방법을 선택하세요.' };
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return { ok: false, error: '일시를 확인하세요.' };
  { const spanErr = roundSpanError(started, ended); if (spanErr) return { ok: false, error: spanErr }; }
  if (!isWholeHours(started, ended)) return { ok: false, error: HOURLY_ONLY_ERROR };
  if (started.getTime() > Date.now() + PLAN_MAX_FUTURE_MS) return { ok: false, error: '60일 이후의 일정은 미리 등록할 수 없습니다.' };
  return { ok: true, started, ended, day: kstDate(started) };
}

/** 같은 시간대의 다른 회차(이 세션 제외)가 있는지 — 멘토 기준 */
async function mentorOverlap(mentorId: string, day: string, started: Date, ended: Date, excludeSessionId: string | null): Promise<boolean> {
  const admin = createAdminClient();
  void day;
  // 앞 날짜 밤에 시작해 자정을 넘긴 회차도 겹침 검사에 넣는다 (2026-11-10)
  const { data } = await admin.from('mentoring_logs').select('id, started_at, ended_at, group_session_id').eq('mentor_id', mentorId).gte('started_at', new Date(started.getTime() - OVERLAP_LOOKBACK_MS).toISOString()).lt('started_at', ended.toISOString());
  return (data ?? []).some((r) => (!excludeSessionId || r.group_session_id !== excludeSessionId) && new Date(r.started_at) < ended && new Date(r.ended_at) > started);
}

/** 같은 멘티·같은 날·같은 방법 금액 상한 — 세션 1회분 전액을 각 멘티 기준으로 검사(수당 대표가 바뀌어도 넘지 않게) */
async function capError(caseId: string, menteeName: string, day: string, mode: ConsultingMode, amount: number, cap: number, excludeSessionId: string | null): Promise<string | null> {
  const admin = createAdminClient();
  const dayStart = new Date(`${day}T00:00:00+09:00`).toISOString();
  const dayEnd = new Date(`${day}T23:59:59.999+09:00`).toISOString();
  const { data } = await admin.from('mentoring_logs').select('mode, amount_snapshot, group_session_id').eq('case_id', caseId).gte('started_at', dayStart).lte('started_at', dayEnd);
  const used = (data ?? []).filter((r) => r.mode === mode && (!excludeSessionId || r.group_session_id !== excludeSessionId)).reduce((s, r) => s + Number(r.amount_snapshot), 0);
  if (used + amount > cap) return `${menteeName}: 같은 날 ${mode === 'online' ? '온라인' : '오프라인'} 일일 상한(${cap.toLocaleString('ko-KR')}원)을 넘습니다.`;
  return null;
}

/**
 * 그룹멘토링 일정 등록 — 선택한 매칭 멘티마다 회차 1행(각 멘티 1회차), 수당은 1회분.
 * 검증: 라운드 사용·멘토 1인당 횟수 / 멘티 2명 이상·모두 이 멘토의 활성 배정·같은 라운드·회차 등록 가능 단계·회차 상한 /
 *       1시간 단위·60일·같은 날·라운드 종료일 / 단가 / 멘티별 일일 금액 상한 / 멘토 시간 겹침.
 */
export async function createGroupSession(input: ScheduleInput & { mentorId: string; programId: string; supportTypeId: string; caseIds: string[] }): Promise<Result<{ sessionId: string; count: number }>> {
  const admin = createAdminClient();
  const caseIds = Array.from(new Set((input.caseIds ?? []).filter(Boolean)));
  if (caseIds.length < GROUP_MIN_MENTEES) return { ok: false, error: `그룹멘토링은 멘티 ${GROUP_MIN_MENTEES}명 이상을 선택해야 합니다.` };
  const { data: group } = await admin.from('support_types').select('*').eq('id', input.supportTypeId).eq('program_id', input.programId).maybeSingle();
  if (!group) return { ok: false, error: '라운드를 찾을 수 없습니다.' };
  const setting = groupMentoringSetting(group);
  if (!setting.enabled) return { ok: false, error: '이 라운드는 그룹멘토링을 사용하지 않습니다. 운영사에 문의하세요.' };
  if (!(await isGroupMatchingPublished(group.id))) return { ok: false, error: '이 라운드의 매칭 정보가 아직 공개되지 않았습니다.' };
  const { count: used } = await admin.from('group_mentoring_sessions').select('id', { count: 'exact', head: true }).eq('support_type_id', group.id).eq('mentor_id', input.mentorId);
  const limit = groupSessionLimitError(used ?? 0, setting.maxPerMentor);
  if (limit) return { ok: false, error: limit };

  const t = checkTimes(input);
  if (!t.ok) return t;
  if (group.ends_on && t.day > group.ends_on) return { ok: false, error: `라운드 종료일(${group.ends_on}) 이후 일정은 등록할 수 없습니다.` };

  // 멘티 확인 — 이 멘토의 활성 배정 + 같은 행사·라운드 (코드에서 직접 확인)
  const mine = await mentorActiveCases(input.mentorId, input.programId, group.id);
  const mineById = new Map(mine.map((c) => [c.id, c]));
  const picked = caseIds.map((id) => mineById.get(id));
  if (picked.some((c) => !c)) return { ok: false, error: '내가 매칭된 이 라운드의 멘티만 그룹멘토링에 넣을 수 있습니다.' };
  const targets = picked as NonNullable<(typeof picked)[number]>[];

  const rate = await resolveRate(input.programId, group.id, input.mode, t.day);
  if (!rate) return { ok: false, error: `해당 일자(${t.day})에 적용되는 단가가 없습니다. 운영 설정의 단가 적용 시작일을 확인하세요.` };
  const full = roundAmount(rate.unitPrice, t.started, t.ended);

  const plan: { c: (typeof targets)[number]; roundNo: number; isExtra: boolean }[] = [];
  for (const c of targets) {
    const name = menteeLabel(c.owner_name ?? '', c.business_name);
    if (!SUBMIT_FROM.has(c.status)) return { ok: false, error: `${name}: 지금 단계에서는 회차를 등록할 수 없습니다.` };
    const [{ data: rows }, allowance] = await Promise.all([admin.from('mentoring_logs').select('round_no').eq('case_id', c.id), getRoundAllowance(c.id)]);
    const roundNo = firstEmptyRoundNo((rows ?? []).map((r) => r.round_no));
    const max = group.required_rounds + allowance.approvedExtra;
    if (roundNo > max) return { ok: false, error: `${name}: 회차를 모두 등록했습니다 (${max}회).` };
    const cap = await capError(c.id, name, t.day, input.mode, full, rate.dailyCapAmount, null);
    if (cap) return { ok: false, error: cap };
    plan.push({ c, roundNo, isExtra: roundNo > group.required_rounds });
  }
  if (await mentorOverlap(input.mentorId, t.day, t.started, t.ended, null)) return { ok: false, error: '같은 시간대에 이미 등록된 회차가 있습니다. 시간을 확인하세요.' };

  const { data: session, error: sErr } = await admin
    .from('group_mentoring_sessions')
    .insert({ program_id: input.programId, support_type_id: group.id, mentor_id: input.mentorId, mode: input.mode, started_at: t.started.toISOString(), ended_at: t.ended.toISOString(), place: input.place?.trim() || null, created_by: input.mentorId })
    .select('id')
    .single();
  if (sErr || !session) return { ok: false, error: sErr?.message ?? '그룹멘토링 저장에 실패했습니다.' };

  const inserted: string[] = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]!;
    const holder = i === 0;
    const { data: log, error } = await admin
      .from('mentoring_logs')
      .insert({
        case_id: p.c.id,
        mentor_id: input.mentorId,
        round_no: p.roundNo,
        mode: input.mode,
        started_at: t.started.toISOString(),
        ended_at: t.ended.toISOString(),
        place: input.place?.trim() || null,
        participants: [{ name: p.c.owner_name ?? menteeLabel(p.c.owner_name ?? '', p.c.business_name), role: 'representative' }] as never,
        report_registered_at: null,
        unit_price_snapshot: holder ? rate.unitPrice : 0,
        amount_snapshot: holder ? full : 0,
        rate_id: rate.rateId,
        is_extra: p.isExtra,
        group_session_id: session.id,
        group_fee_holder: holder,
      })
      .select('id')
      .single();
    if (error || !log) {
      if (inserted.length) await admin.from('mentoring_logs').delete().in('id', inserted);
      await admin.from('group_mentoring_sessions').delete().eq('id', session.id);
      const name = menteeLabel(p.c.owner_name ?? '', p.c.business_name);
      return { ok: false, error: error?.code === '23505' ? `${name}: 동시에 등록이 겹쳤습니다. 새로고침 후 다시 시도하세요.` : `${name} 회차 저장 실패: ${error?.message ?? '알 수 없는 오류'}` };
    }
    inserted.push(log.id);
  }

  // 첫 회차인 멘티: mentor_assigned → in_progress
  for (const p of plan) {
    if (p.c.status !== 'mentor_assigned') continue;
    const { data: moved } = await admin.from('cases').update({ status: 'in_progress' }).eq('id', p.c.id).in('status', [...TRANSITIONS.submit_round.from]).select('id');
    if (moved && moved.length > 0) {
      await admin.from('case_status_history').insert({ case_id: p.c.id, from_status: 'mentor_assigned', to_status: 'in_progress', changed_by: input.mentorId, note: await actingNote('그룹멘토링 1회차 등록 → 컨설팅 진행 중', input.mentorId) });
    }
  }

  await logAudit(admin, {
    actorId: input.mentorId,
    programId: input.programId,
    action: 'group_mentoring.create',
    entityType: 'group_mentoring_sessions',
    entityId: session.id,
    metadata: { support_type_id: group.id, case_ids: plan.map((p) => p.c.id), log_ids: inserted, mode: input.mode, day: t.day, fee: full, mentees: plan.length },
  });
  // 멘티별 케이스 조치 이력에도 남긴다
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]!;
    await logAudit(admin, { actorId: input.mentorId, programId: input.programId, action: 'round.create', entityType: 'mentoring_logs', entityId: inserted[i]!, metadata: { case_id: p.c.id, round_no: p.roundNo, mode: input.mode, group_session_id: session.id, group: true, planned: t.started.getTime() > Date.now() } });
  }
  return { ok: true, sessionId: session.id, count: plan.length };
}

async function loadOwnSession(sessionId: string, mentorId: string, programId: string) {
  const admin = createAdminClient();
  const { data: s } = await admin.from('group_mentoring_sessions').select('id, program_id, support_type_id, mentor_id, mode, started_at, ended_at, place').eq('id', sessionId).maybeSingle();
  if (!s || s.program_id !== programId) return { ok: false as const, error: '그룹멘토링 일정을 찾을 수 없습니다.' };
  if (s.mentor_id !== mentorId) return { ok: false as const, error: '내가 등록한 그룹멘토링만 바꿀 수 있습니다.' };
  const { data: logs } = await admin.from('mentoring_logs').select('id, case_id, round_no, report_registered_at, settlement_id, cases!inner(status, owner_name, business_name)').eq('group_session_id', s.id);
  const rows = (logs ?? []).map((l) => {
    const c = l.cases as unknown as { status: string; owner_name: string | null; business_name: string | null };
    return { id: l.id, caseId: l.case_id, roundNo: l.round_no, reported: !!l.report_registered_at, settled: !!l.settlement_id, status: c.status, name: menteeLabel(c.owner_name ?? '', c.business_name) };
  });
  return { ok: true as const, session: s, logs: rows };
}

/** 그룹멘토링 일정 수정 — 참여 회차 전부에 같은 일시·방법·장소. 보고서·정산 회차가 없을 때만. */
export async function updateGroupSession(input: ScheduleInput & { sessionId: string; mentorId: string; programId: string }): Promise<Result> {
  const admin = createAdminClient();
  const loaded = await loadOwnSession(input.sessionId, input.mentorId, input.programId);
  if (!loaded.ok) return loaded;
  const { session, logs } = loaded;
  if (!groupSessionEditable(logs)) return { ok: false, error: '보고서가 등록된 멘티가 있어 일정을 바꿀 수 없습니다.' };
  const blockedCase = logs.find((l) => !SUBMIT_FROM.has(l.status));
  if (blockedCase) return { ok: false, error: `${blockedCase.name}: 지금 단계에서는 회차를 바꿀 수 없습니다.` };
  const t = checkTimes(input);
  if (!t.ok) return t;
  const { data: group } = await admin.from('support_types').select('ends_on').eq('id', session.support_type_id).maybeSingle();
  if (group?.ends_on && t.day > group.ends_on) return { ok: false, error: `라운드 종료일(${group.ends_on}) 이후 일정은 등록할 수 없습니다.` };
  const rate = await resolveRate(input.programId, session.support_type_id, input.mode, t.day);
  if (!rate) return { ok: false, error: `해당 일자(${t.day})에 적용되는 단가가 없습니다.` };
  const full = roundAmount(rate.unitPrice, t.started, t.ended);
  for (const l of logs) {
    const cap = await capError(l.caseId, l.name, t.day, input.mode, full, rate.dailyCapAmount, session.id);
    if (cap) return { ok: false, error: cap };
  }
  if (await mentorOverlap(input.mentorId, t.day, t.started, t.ended, session.id)) return { ok: false, error: '같은 시간대에 이미 등록된 회차가 있습니다. 시간을 확인하세요.' };
  const patch = { mode: input.mode, started_at: t.started.toISOString(), ended_at: t.ended.toISOString(), place: input.place?.trim() || null };
  const { error } = await admin.from('group_mentoring_sessions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', session.id);
  if (error) return { ok: false, error: error.message };
  const { error: lErr } = await admin.from('mentoring_logs').update(patch).eq('group_session_id', session.id).is('report_registered_at', null).is('settlement_id', null);
  if (lErr) return { ok: false, error: lErr.message };
  await rebalanceGroupSession(session.id);
  await logAudit(admin, {
    actorId: input.mentorId,
    programId: input.programId,
    action: 'group_mentoring.update',
    entityType: 'group_mentoring_sessions',
    entityId: session.id,
    metadata: { case_ids: logs.map((l) => l.caseId), before: { mode: session.mode, started_at: session.started_at, ended_at: session.ended_at, place: session.place }, after: patch },
  });
  return { ok: true };
}

/** 그룹멘토링 삭제 — 참여 회차(계획)까지 함께. 보고서·정산 회차가 없을 때만. 뒤 회차 번호는 멘티별 계획 삭제와 같은 규칙. */
export async function deleteGroupSession(input: { sessionId: string; mentorId: string; programId: string }): Promise<Result> {
  const admin = createAdminClient();
  const loaded = await loadOwnSession(input.sessionId, input.mentorId, input.programId);
  if (!loaded.ok) return loaded;
  const { session, logs } = loaded;
  if (!groupSessionEditable(logs)) return { ok: false, error: '보고서가 등록된 멘티가 있어 삭제할 수 없습니다. 보고서가 없는 멘티만 각 멘티 화면에서 회차를 지우세요.' };
  const { deletePlannedRound } = await import('@/lib/workflow/rounds');
  for (const l of logs) {
    const r = await deletePlannedRound(l.id, input.mentorId, l.caseId);
    if (!r.ok) return { ok: false, error: `${l.name}: ${r.error}` };
  }
  await admin.from('group_mentoring_sessions').delete().eq('id', session.id);
  await logAudit(admin, {
    actorId: input.mentorId,
    programId: input.programId,
    action: 'group_mentoring.delete',
    entityType: 'group_mentoring_sessions',
    entityId: session.id,
    metadata: { case_ids: logs.map((l) => l.caseId), log_ids: logs.map((l) => l.id), mode: session.mode, started_at: session.started_at },
  });
  return { ok: true };
}

/** 세션 참여 멘티 이름 (회차 행에 "함께: …" 표시용) — 케이스 하나의 회차들 기준 */
export async function groupPeersForCase(caseId: string): Promise<Map<string, string[]>> {
  const admin = createAdminClient();
  const { data: mine } = await admin.from('mentoring_logs').select('id, group_session_id').eq('case_id', caseId).not('group_session_id', 'is', null);
  const sessionIds = Array.from(new Set((mine ?? []).map((l) => l.group_session_id!)));
  const out = new Map<string, string[]>();
  if (sessionIds.length === 0) return out;
  const { data: peers } = await admin.from('mentoring_logs').select('case_id, group_session_id').in('group_session_id', sessionIds).neq('case_id', caseId);
  const peerCaseIds = Array.from(new Set((peers ?? []).map((p) => p.case_id)));
  const { data: cs } = peerCaseIds.length ? await admin.from('cases').select('id, owner_name, business_name').in('id', peerCaseIds) : { data: [] as never[] };
  const nameOf = new Map((cs ?? []).map((c) => [c.id, menteeLabel(c.owner_name ?? '', c.business_name)]));
  for (const s of sessionIds) out.set(s, (peers ?? []).filter((p) => p.group_session_id === s).map((p) => nameOf.get(p.case_id) ?? '-'));
  return out;
}
