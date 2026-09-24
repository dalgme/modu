import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';

/**
 * 지연 케이스 감지 (P22) — 규모(멘토 80·멘티 400)에서 수동 추적을 대신한다.
 * 기준(일)은 아래 상수 한 곳. 지연 종류별 책임 주체가 다르다:
 *  - unassigned  등록 후 배정 지연 → 운영사 할 일 (문자 대상 아님)
 *  - reassign    재배정 대기 지연 → 운영사 할 일
 *  - no_round    배정 후 첫 회차 없음 → 멘토 독려
 *  - stalled     마지막 활동 후 장기 무진행(잔여 회차 있음) → 멘토 독려
 *  - revision    보완 요청 후 재제출 지연 → 멘토 독려
 */
import { DELAY_DAYS, type DelayedCase } from '@/lib/reports/delays-shared';

export { DELAY_DAYS, DELAY_LABELS, type DelayKind, type DelayedCase } from '@/lib/reports/delays-shared';

const daysSince = (iso: string | null): number =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;

export async function listDelayedCases(programId: string, supportTypeId?: string | null): Promise<DelayedCase[]> {
  const admin = createAdminClient();
  let q = admin
    .from('cases')
    .select('id, owner_name, business_name, status, created_at, updated_at, support_type_id, support_types(name, required_rounds)')
    .eq('program_id', programId)
    .in('status', ['registered', 'mentor_assigned', 'in_progress', 'revision_requested', 'reassignment_pending']);
  if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
  const { data: cases } = await q;
  const list = cases ?? [];
  if (list.length === 0) return [];
  const caseIds = list.map((c) => c.id);

  const [{ data: assigns }, logs, { data: history }, { data: extraOk }] = await Promise.all([
    admin.from('mentor_assignments').select('case_id, mentor_id, assigned_at').in('case_id', caseIds).eq('is_active', true),
    fetchAllIn<{ case_id: string; started_at: string; report_registered_at: string | null }>(caseIds, (chunk, from, to) => admin.from('mentoring_logs').select('case_id, started_at, report_registered_at').in('case_id', chunk).range(from, to)),
    admin
      .from('case_status_history')
      .select('case_id, to_status, created_at')
      .in('case_id', caseIds)
      .in('to_status', ['revision_requested', 'reassignment_pending'])
      .order('created_at', { ascending: false }),
    admin.from('round_extension_requests').select('case_id, extra_rounds').in('case_id', caseIds).eq('status', 'approved'),
  ]);
  const assignByCase = new Map((assigns ?? []).map((a) => [a.case_id, a]));
  const mentorIds = Array.from(new Set((assigns ?? []).map((a) => a.mentor_id)));
  const { data: mentors } = mentorIds.length
    ? await admin.from('users').select('id, name, phone').in('id', mentorIds)
    : { data: [] as { id: string; name: string; phone: string | null }[] };
  const mentorName = new Map((mentors ?? []).map((m) => [m.id, m.name]));
  const mentorPhone = new Map((mentors ?? []).map((m) => [m.id, m.phone ?? null]));

  // 이행 = 보고서 등록 회차만. 최근 활동 = 보고서 등록 시각(미래 계획 회차의 일정은 활동이 아니다) (P30)
  const nowIso = new Date().toISOString();
  const roundsByCase = new Map<string, { count: number; planned: number; lastActivity: string | null }>();
  for (const l of logs) {
    const cur = roundsByCase.get(l.case_id) ?? { count: 0, planned: 0, lastActivity: null };
    cur.planned += 1;
    if (l.report_registered_at) {
      cur.count += 1;
      const act = l.report_registered_at > nowIso ? nowIso : l.report_registered_at;
      if (!cur.lastActivity || act > cur.lastActivity) cur.lastActivity = act;
    }
    roundsByCase.set(l.case_id, cur);
  }
  const lastTransition = new Map<string, string>(); // case → 최근 revision/reassign 진입 시각
  for (const h of history ?? []) {
    const key = `${h.case_id}:${h.to_status}`;
    if (!lastTransition.has(key)) lastTransition.set(key, h.created_at);
  }
  const extraByCase = new Map<string, number>();
  for (const e of extraOk ?? []) extraByCase.set(e.case_id, (extraByCase.get(e.case_id) ?? 0) + (e.extra_rounds ?? 0));

  const out: DelayedCase[] = [];
  for (const c of list) {
    const st = c.support_types as unknown as { name: string; required_rounds: number } | null;
    const target = (st?.required_rounds ?? 0) + (extraByCase.get(c.id) ?? 0);
    const rounds = roundsByCase.get(c.id) ?? { count: 0, planned: 0, lastActivity: null };
    const assign = assignByCase.get(c.id);
    const base = {
      caseId: c.id,
      ownerName: c.owner_name,
      businessName: c.business_name,
      groupName: st?.name ?? null,
      status: c.status,
      mentorId: assign?.mentor_id ?? null,
      mentorName: assign ? (mentorName.get(assign.mentor_id) ?? null) : null,
      mentorPhone: assign ? (mentorPhone.get(assign.mentor_id) ?? null) : null,
      roundsDone: rounds.count,
      requiredRounds: target,
    };
    if (c.status === 'registered') {
      const d = daysSince(c.created_at);
      if (d >= DELAY_DAYS.unassigned) out.push({ ...base, kind: 'unassigned', days: d });
    } else if (c.status === 'reassignment_pending') {
      const d = daysSince(lastTransition.get(`${c.id}:reassignment_pending`) ?? c.updated_at);
      if (d >= DELAY_DAYS.reassign) out.push({ ...base, kind: 'reassign', days: d });
    } else if (c.status === 'revision_requested') {
      const d = daysSince(lastTransition.get(`${c.id}:revision_requested`) ?? c.updated_at);
      if (d >= DELAY_DAYS.revision) out.push({ ...base, kind: 'revision', days: d });
    } else if (c.status === 'mentor_assigned' && rounds.planned === 0) {
      const d = daysSince(assign?.assigned_at ?? c.updated_at);
      if (d >= DELAY_DAYS.no_round) out.push({ ...base, kind: 'no_round', days: d });
    } else if ((c.status === 'in_progress' || c.status === 'mentor_assigned') && rounds.count < target) {
      // 재배정 직후 새 멘토가 바로 '무진행'이 되지 않게 배정일을 하한으로 둔다
      const ref = [rounds.lastActivity, assign?.assigned_at, c.updated_at].filter((x): x is string => !!x).sort().pop()!;
      const d = daysSince(ref);
      if (d >= DELAY_DAYS.stalled) out.push({ ...base, kind: 'stalled', days: d });
    }
  }
  return out.sort((a, b) => b.days - a.days);
}
