import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { listMentorCases, listMenteeCases, type CaseListItem } from '@/lib/data/cases';
import { resolveRoundReportPolicy } from '@/lib/documents/round-report';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { menteeLabel } from '@/lib/utils/labels';

/**
 * 멘토·멘티 대시보드 "다음 할 일" 데이터 (P28) — 케이스별 회차 상태를 한 번에 읽어
 * 멘토에게는 "지금 무엇을 해야 하는지", 멘티에게는 "담당 멘토·다음 일정·내가 할 일"을 만든다.
 * 회차 규칙은 CLAUDE.md §3-1: 이행 = 보고서(2단계) 등록. 서명은 그룹 정책(menteeConfirmSignature)이 켜진 경우만.
 */

export type MentorActionKey = 'plan_first' | 'report' | 'upcoming' | 'plan_next' | 'observation' | 'closure' | 'wait_review' | 'revision' | 'settled' | 'inactive';

export interface RoundLite {
  id: string;
  roundNo: number;
  startedAt: string;
  endedAt: string;
  mode: 'online' | 'offline';
  place: string | null;
  reported: boolean;
  signed: boolean;
}

export interface MentorCaseTodo {
  caseId: string;
  label: string;
  groupName: string | null;
  status: CaseStatus;
  statusLabel: string;
  roundsDone: number;
  requiredRounds: number;
  menteePhone: string | null;
  menteeEmail: string | null;
  item: string | null;
  /** 미래 일정 중 가장 가까운 계획 회차 */
  nextPlanned: RoundLite | null;
  /** 지난 일정인데 보고서가 없는 회차 */
  reportPending: RoundLite[];
  /** 서명 정책이 켜진 그룹에서 멘티 서명이 없는 이행 회차 수 */
  unsignedRounds: number;
  hasObservation: boolean;
  action: { key: MentorActionKey; label: string; hint: string; href: string; urgent: boolean };
}

export interface MentorDashboardData {
  cases: MentorCaseTodo[];
  /** 앞으로 7일 안의 계획 회차 (시간순) */
  upcoming: (RoundLite & { caseId: string; label: string })[];
  reportPendingCount: number;
  /** 보고서 등록됐지만 아직 정산 확정 전인 회차의 세전 합계 (예상, 미확정) */
  estimatedGross: number;
  confirmedNet: number;
}

interface LogRow {
  id: string;
  case_id: string;
  round_no: number;
  started_at: string;
  ended_at: string;
  mode: string;
  place: string | null;
  report_registered_at: string | null;
  mentee_signed_at: string | null;
  amount_snapshot: number;
  settlement_id: string | null;
  mentor_id: string;
}

function toLite(l: LogRow): RoundLite {
  return { id: l.id, roundNo: l.round_no, startedAt: l.started_at, endedAt: l.ended_at, mode: l.mode === 'offline' ? 'offline' : 'online', place: l.place, reported: !!l.report_registered_at, signed: !!l.mentee_signed_at };
}

async function loadLogs(caseIds: string[]): Promise<LogRow[]> {
  if (caseIds.length === 0) return [];
  const { data } = await createAdminClient()
    .from('mentoring_logs')
    .select('id, case_id, round_no, started_at, ended_at, mode, place, report_registered_at, mentee_signed_at, amount_snapshot, settlement_id, mentor_id')
    .in('case_id', caseIds)
    .order('started_at');
  return (data ?? []) as LogRow[];
}

async function signaturePolicyByGroup(programId: string, groupIds: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  await Promise.all(
    Array.from(new Set(groupIds)).map(async (gid) => {
      try {
        const p = await resolveRoundReportPolicy(programId, gid);
        out.set(gid, !!p.menteeConfirmSignature);
      } catch {
        out.set(gid, false);
      }
    }),
  );
  return out;
}

function decideAction(c: CaseListItem, rounds: RoundLite[], nextPlanned: RoundLite | null, reportPending: RoundLite[], hasObservation: boolean, href: string): MentorCaseTodo['action'] {
  const done = rounds.filter((r) => r.reported).length;
  switch (c.status) {
    case 'registered':
    case 'reassignment_pending':
    case 'withdrawn':
      return { key: 'inactive', label: CASE_STATUS_META[c.status].short, hint: '운영사가 처리 중입니다.', href, urgent: false };
    case 'closure_requested':
      return { key: 'wait_review', label: '운영사 검수 대기', hint: '관찰의견서와 종결 요청이 접수되었습니다. 검수 결과를 기다려 주세요.', href, urgent: false };
    case 'revision_requested':
      return { key: 'revision', label: '보완 후 다시 종결 요청', hint: '운영사가 보완을 요청했습니다. 케이스의 보완 요청 내용을 확인하고 수정한 뒤 다시 종결을 요청하세요.', href, urgent: true };
    case 'settlement_pending':
    case 'settlement_batched':
    case 'closed':
      return { key: 'settled', label: c.status === 'closed' ? '종결 완료' : '정산 진행 중', hint: c.status === 'closed' ? '모든 과정이 끝났습니다.' : '검수가 끝나 정산이 확정되었습니다. 내 정산 내역에서 확인하세요.', href: '/mentor/settlements', urgent: false };
    default:
      break;
  }
  if (reportPending.length > 0) {
    const r = reportPending[0]!;
    return { key: 'report', label: `${r.roundNo}회차 보고서 등록`, hint: `${reportPending.length}개 회차가 진행됐지만 보고서(2단계)가 없습니다. 보고서를 올려야 이행으로 인정되고 정산에 포함됩니다.`, href: `${href}#rounds`, urgent: true };
  }
  if (nextPlanned) {
    return { key: 'upcoming', label: `${nextPlanned.roundNo}회차 예정`, hint: `${nextPlanned.mode === 'online' ? '온라인' : '오프라인'}${nextPlanned.place ? ` · ${nextPlanned.place}` : ''} — 진행 후 보고서를 등록하세요.`, href: `${href}#rounds`, urgent: false };
  }
  if (rounds.length === 0) {
    return { key: 'plan_first', label: '첫 회차 일정 등록', hint: '멘티에게 연락해 첫 컨설팅 일정을 잡고 [회차 등록]으로 계획을 남기세요.', href: `${href}#rounds`, urgent: true };
  }
  if (done < c.requiredRounds) {
    return { key: 'plan_next', label: `${done + 1}회차 일정 등록`, hint: `필수 ${c.requiredRounds}회 중 ${done}회 이행. 다음 회차 일정을 등록하세요.`, href: `${href}#rounds`, urgent: false };
  }
  if (!hasObservation) {
    return { key: 'observation', label: '관찰의견서 작성', hint: '필수 회차를 모두 이행했습니다. 관찰의견서를 작성하면 종결을 요청할 수 있습니다.', href: `${href}#observation`, urgent: true };
  }
  return { key: 'closure', label: '종결 요청', hint: '관찰의견서가 준비됐습니다. [종결 요청]을 누르면 운영사 검수 후 정산이 확정됩니다.', href: `${href}#requests`, urgent: true };
}

/** 멘토 대시보드 데이터 — 활성 배정 케이스 기준 (범위: 행사/그룹) */
export async function loadMentorDashboard(mentorId: string, programId: string, supportTypeId: string | null, caseHrefBase = '/mentor/cases'): Promise<MentorDashboardData> {
  const cases = await listMentorCases(mentorId, { programId, supportTypeId: supportTypeId ?? undefined });
  const ids = cases.map((c) => c.id);
  const admin = createAdminClient();
  const [logs, { data: obs }, policy, { data: settled }] = await Promise.all([
    loadLogs(ids),
    ids.length ? admin.from('observation_reports').select('case_id, content').in('case_id', ids) : Promise.resolve({ data: [] as { case_id: string; content: unknown }[] }),
    signaturePolicyByGroup(programId, cases.map((c) => c.support_type_id)),
    ids.length ? admin.from('settlements').select('case_id, net').eq('mentor_id', mentorId).in('case_id', ids).neq('status', 'canceled') : Promise.resolve({ data: [] as { case_id: string; net: number }[] }),
  ]);
  const hasObs = new Set(
    (obs ?? [])
      .filter((o) => {
        const content = (o.content ?? {}) as { summary?: unknown };
        return typeof content.summary === 'string' && content.summary.trim().length > 0;
      })
      .map((o) => o.case_id),
  );
  const now = Date.now();
  const logsByCase = new Map<string, LogRow[]>();
  for (const l of logs) (logsByCase.get(l.case_id) ?? logsByCase.set(l.case_id, []).get(l.case_id)!).push(l);

  const todos: MentorCaseTodo[] = cases.map((c) => {
    const rows = (logsByCase.get(c.id) ?? []).map(toLite);
    const nextPlanned = rows.filter((r) => !r.reported && new Date(r.startedAt).getTime() > now).sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0] ?? null;
    const reportPending = rows.filter((r) => !r.reported && new Date(r.startedAt).getTime() <= now);
    const signOn = policy.get(c.support_type_id) ?? false;
    const href = `${caseHrefBase}/${c.id}`;
    return {
      caseId: c.id,
      label: menteeLabel(c.owner_name, c.business_name),
      groupName: c.supportTypeName,
      status: c.status,
      statusLabel: CASE_STATUS_META[c.status].short,
      roundsDone: c.roundsDone,
      requiredRounds: c.requiredRounds,
      menteePhone: c.phone || null,
      menteeEmail: c.email,
      item: c.item,
      nextPlanned,
      reportPending,
      unsignedRounds: signOn ? rows.filter((r) => r.reported && !r.signed).length : 0,
      hasObservation: hasObs.has(c.id),
      action: decideAction(c, rows, nextPlanned, reportPending, hasObs.has(c.id), href),
    };
  });
  const ORDER: Record<MentorActionKey, number> = { report: 0, revision: 1, plan_first: 2, observation: 3, closure: 4, upcoming: 5, plan_next: 6, wait_review: 7, settled: 8, inactive: 9 };
  todos.sort((a, b) => ORDER[a.action.key] - ORDER[b.action.key] || a.label.localeCompare(b.label, 'ko'));

  const weekEnd = now + 7 * 86400000;
  const labelOf = new Map(todos.map((t) => [t.caseId, t.label]));
  const upcoming = logs
    .filter((l) => !l.report_registered_at && new Date(l.started_at).getTime() >= now - 3600000 && new Date(l.started_at).getTime() <= weekEnd)
    .map((l) => ({ ...toLite(l), caseId: l.case_id, label: labelOf.get(l.case_id) ?? '-' }))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return {
    cases: todos,
    upcoming,
    reportPendingCount: todos.reduce((a, t) => a + t.reportPending.length, 0),
    estimatedGross: logs.filter((l) => l.mentor_id === mentorId && l.report_registered_at && !l.settlement_id).reduce((a, l) => a + Number(l.amount_snapshot), 0),
    confirmedNet: (settled ?? []).reduce((a, s) => a + Number(s.net), 0),
  };
}

export interface MenteeDashboardExtra {
  mentor: { id: string; name: string; phone: string | null; email: string | null; organization: string | null; expertise: string[] } | null;
  nextPlanned: RoundLite | null;
  lastDone: RoundLite | null;
  rounds: RoundLite[];
  /** 멘토가 등록한 회차 중 아직 진행 전(계획)인 수 */
  plannedCount: number;
}

/** 멘티 대시보드 보조 데이터 — 담당 멘토 연락처·다음 일정·회차 요약 (주 케이스 1건) */
export async function loadMenteeDashboardExtra(caseItem: CaseListItem | null, programId: string): Promise<MenteeDashboardExtra> {
  if (!caseItem) return { mentor: null, nextPlanned: null, lastDone: null, rounds: [], plannedCount: 0 };
  const admin = createAdminClient();
  const [logs, mentorR, profR] = await Promise.all([
    loadLogs([caseItem.id]),
    caseItem.mentorId ? admin.from('users').select('id, name, phone, email, organization').eq('id', caseItem.mentorId).maybeSingle() : Promise.resolve({ data: null }),
    caseItem.mentorId ? admin.from('mentor_profiles').select('expertise').eq('program_id', programId).eq('user_id', caseItem.mentorId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rounds = logs.map(toLite);
  const now = Date.now();
  const planned = rounds.filter((r) => !r.reported && new Date(r.startedAt).getTime() > now).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const done = rounds.filter((r) => r.reported).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const m = mentorR.data as { id: string; name: string; phone: string | null; email: string | null; organization: string | null } | null;
  return {
    mentor: m ? { id: m.id, name: m.name, phone: m.phone, email: m.email, organization: m.organization, expertise: ((profR.data as { expertise?: string[] } | null)?.expertise ?? []).slice(0, 10) } : null,
    nextPlanned: planned[0] ?? null,
    lastDone: done[0] ?? null,
    rounds,
    plannedCount: planned.length,
  };
}

/** 멘티 주 케이스 선택 규칙 — 그룹 컨텍스트가 있으면 그 그룹 케이스 우선 */
export async function pickMenteePrimaryCase(menteeId: string, programId: string, supportTypeId: string | null): Promise<{ primary: CaseListItem | null; all: CaseListItem[] }> {
  const all = await listMenteeCases(menteeId, { programId });
  const ordered = supportTypeId ? [...all.filter((c) => c.support_type_id === supportTypeId), ...all.filter((c) => c.support_type_id !== supportTypeId)] : all;
  return { primary: ordered[0] ?? null, all: ordered };
}
