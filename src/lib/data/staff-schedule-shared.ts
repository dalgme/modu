/**
 * 운영사 [스케줄] 탭 — 순수 헬퍼 (서버·클라이언트 공용, DB 접근 없음).
 *
 * 서버 로더(`staff-schedule.ts`, server-only)가 읽은 회차를 여기 함수로 분류·집계하고,
 * 클라이언트 컴포넌트는 상수(라벨·색)만 이 파일에서 읽는다 — `'use client'` 파일에 상수를 두면
 * 서버 컴포넌트에서 클라이언트 참조가 되어 500 이 난다(CLAUDE.md §6-10).
 *
 * 날짜는 전부 KST 'YYYY-MM-DD' 문자열로 다룬다(`src/lib/utils/kst.ts`) — 서버(UTC)·브라우저(KST) 어디서 계산해도 같다.
 */
import { KST_WEEKDAYS, kstHm, kstTodayYmd, kstYmd } from '@/lib/utils/kst';

/**
 * 회차 상태 (P12 2단계 기준)
 *  - done    완료        = 보고서(2단계) 등록 (`report_registered_at` not null)
 *  - planned 예약(계획)  = 보고서 없음 + 시작 시각이 아직 오지 않음
 *  - pending 보고서 대기 = 보고서 없음 + 시작 시각이 지남
 */
export type RoundStatus = 'planned' | 'pending' | 'done';

export const ROUND_STATUS_ORDER: RoundStatus[] = ['planned', 'pending', 'done'];

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  planned: '예약',
  pending: '보고서 대기',
  done: '완료',
};

/** 범례 설명 — 화면 범례와 문서가 같은 문구를 쓴다 */
export const ROUND_STATUS_HELP: Record<RoundStatus, string> = {
  planned: '계획(1단계)만 등록, 진행 전',
  pending: '진행 시각이 지났지만 보고서 미등록',
  done: '보고서(2단계)까지 등록 = 이행 인정',
};

/** 배지·칩 색 (멘토·멘티 스케줄 달력과 같은 톤: 예약 하늘 / 대기 주황 / 완료 초록) */
export const ROUND_STATUS_STYLE: Record<RoundStatus, string> = {
  planned: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-700',
  pending: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700',
  done: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700',
};

/** 미등록(계획 미입력) 행 스타일 */
export const UNREGISTERED_STYLE = 'bg-muted text-muted-foreground border-dashed border-muted-foreground/40';

export function roundStatus(r: { reported: boolean; startedAt: string }, nowMs: number): RoundStatus {
  if (r.reported) return 'done';
  return new Date(r.startedAt).getTime() > nowMs ? 'planned' : 'pending';
}

/**
 * 스케줄에 올릴 회차인가 — 중도 종료(withdrawn) 케이스는 **이행(보고서 등록) 회차만** 남긴다.
 * 종료된 케이스의 계획 회차는 더 이상 진행되지 않으므로 예약·대기로 보이면 안 된다.
 * (종결·정산 단계 케이스는 종결 게이트가 전 회차 보고서를 요구하므로 미보고 회차가 없다.)
 */
export function includeRound(caseStatus: string, reported: boolean): boolean {
  if (caseStatus === 'withdrawn') return reported;
  return true;
}

/** 화면에 내려보내는 회차 1건 — 직렬화 가능한 값만 */
export interface StaffRound {
  id: string;
  caseId: string;
  roundNo: number;
  /** 이 케이스의 목표 회차(그룹 required_rounds + 승인된 추가 회차) */
  requiredTotal: number;
  menteeLabel: string;
  menteePhone: string | null;
  mentorId: string;
  mentorName: string;
  mentorPhone: string | null;
  mode: 'online' | 'offline';
  startedAt: string;
  endedAt: string;
  place: string | null;
  reported: boolean;
  caseStatus: string;
  groupName: string;
  /** 서버가 한 번의 now 로 계산해 내려준다(하이드레이션 불일치 방지) */
  status: RoundStatus;
}

export interface StaffScheduleCase {
  id: string;
  menteeLabel: string;
  menteePhone: string | null;
  status: string;
  groupName: string;
  requiredTotal: number;
  /** 현재 활성 담당 멘토 */
  activeMentorId: string | null;
  /** 과거(교체·종료) 포함 이 케이스를 맡았던 멘토 */
  mentorIds: string[];
}

export interface ScheduleMentor {
  id: string;
  name: string;
  phone: string | null;
  /** 범위 안에서 이 멘토가 진행(등록)한 회차 수 */
  roundCount: number;
  /** 현재 담당(활성 배정) 멘티 수 */
  activeCases: number;
}

export const MODE_LABEL: Record<'online' | 'offline', string> = { online: '온라인', offline: '오프라인' };

/* ───────── 날짜 ───────── */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;
const pad2 = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 24 * 3600 * 1000;

function ymdToUtc(ymd: string): Date {
  return new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))));
}
function utcToYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** ?date= 파라미터 → 유효한 KST 날짜, 아니면 오늘(KST) */
export function parseYmdParam(v: string | undefined | null, nowMs: number = Date.now()): string {
  if (v && YMD_RE.test(v)) {
    const d = ymdToUtc(v);
    if (!Number.isNaN(d.getTime()) && utcToYmd(d) === v) return v;
  }
  return kstTodayYmd(nowMs);
}

/** ?month= 파라미터 → 'YYYY-MM', 아니면 fallback 날짜(기본 오늘 KST)의 달 */
export function parseMonthParam(v: string | undefined | null, fallbackYmd?: string, nowMs: number = Date.now()): string {
  if (v && YM_RE.test(v)) {
    const m = Number(v.slice(5, 7));
    if (m >= 1 && m <= 12) return v;
  }
  return (fallbackYmd && YMD_RE.test(fallbackYmd) ? fallbackYmd : kstTodayYmd(nowMs)).slice(0, 7);
}

export function shiftYmd(ymd: string, days: number): string {
  return utcToYmd(new Date(ymdToUtc(ymd).getTime() + days * DAY_MS));
}

export function shiftMonth(ym: string, months: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + months;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** 'YYYY년 M월' */
export function monthTitle(ym: string): string {
  return `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
}

/** 'M월 D일 (요일)' */
export function dayTitle(ymd: string): string {
  const d = ymdToUtc(ymd);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${KST_WEEKDAYS[d.getUTCDay()]})`;
}

/** 'YYYY.MM.DD(요일)' — 표의 날짜 칸 */
export function dateWithWeekday(iso: string): string {
  const ymd = kstYmd(iso);
  if (!ymd) return '';
  const d = ymdToUtc(ymd);
  return `${ymd.replace(/-/g, '.')}(${KST_WEEKDAYS[d.getUTCDay()]})`;
}

/** 'HH:MM~HH:MM' (KST) */
export function timeRange(startedAt: string, endedAt: string): string {
  const s = kstHm(startedAt);
  const e = kstHm(endedAt);
  return e ? `${s}~${e}` : s;
}

export interface MonthCell {
  ymd: string;
  day: number;
  weekday: number;
  inMonth: boolean;
}

/** 월 격자 42칸(6주, 일요일 시작) */
export function monthGrid(ym: string): MonthCell[] {
  const first = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1));
  const start = first.getTime() - first.getUTCDay() * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start + i * DAY_MS);
    return { ymd: utcToYmd(d), day: d.getUTCDate(), weekday: d.getUTCDay(), inMonth: d.getUTCMonth() === first.getUTCMonth() };
  });
}

/* ───────── 분류·집계 ───────── */

export function sortRounds<T extends { startedAt: string; roundNo: number; menteeLabel: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.menteeLabel.localeCompare(b.menteeLabel, 'ko') || a.roundNo - b.roundNo);
}

/** KST 날짜별 묶음 (시작 시각 기준) */
export function groupByDay<T extends { startedAt: string; roundNo: number; menteeLabel: string }>(rows: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of sortRounds(rows)) {
    const k = kstYmd(r.startedAt);
    if (!k) continue;
    (out[k] ??= []).push(r);
  }
  return out;
}

export function roundsOnDay<T extends { startedAt: string; roundNo: number; menteeLabel: string }>(rows: T[], ymd: string): T[] {
  return sortRounds(rows.filter((r) => kstYmd(r.startedAt) === ymd));
}

export function roundsInMonth<T extends { startedAt: string }>(rows: T[], ym: string): T[] {
  return rows.filter((r) => kstYmd(r.startedAt).slice(0, 7) === ym);
}

export type StatusCounts = Record<RoundStatus, number>;

export function countByStatus(rows: { status: RoundStatus }[]): StatusCounts {
  const c: StatusCounts = { planned: 0, pending: 0, done: 0 };
  for (const r of rows) c[r.status] += 1;
  return c;
}

/** 검색 — 멘티·멘토 이름과 휴대폰(숫자만 비교) */
export function matchesRoundSearch(r: { menteeLabel: string; mentorName: string; menteePhone: string | null; mentorPhone: string | null }, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if (r.menteeLabel.toLowerCase().includes(t) || r.mentorName.toLowerCase().includes(t)) return true;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 2) {
    return [r.menteePhone, r.mentorPhone].some((p) => (p ?? '').replace(/\D/g, '').includes(digits));
  }
  return false;
}

/** 멘토 목록 가나다순 */
export function sortMentors<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/* ───────── 세부일정 정보 ───────── */

export interface DetailRow {
  kind: 'round' | 'unregistered';
  roundNo: number;
  round?: StaffRound;
  /** 교체 전 다른 멘토가 진행한 회차 */
  byOtherMentor?: boolean;
}

export interface DetailMentee {
  caseId: string;
  menteeLabel: string;
  menteePhone: string | null;
  groupName: string;
  caseStatus: string;
  requiredTotal: number;
  /** false = 교체·중도 종료로 지금은 이 멘토 담당이 아님(이 멘토가 진행한 회차만 표시, 집계 제외) */
  current: boolean;
  rows: DetailRow[];
}

export interface DetailSummary {
  /** 계획 = 현재 담당 멘티들의 목표 회차 합 */
  plan: number;
  /** 예정 = 등록(계획)됐고 보고서 없음 + 진행 전 */
  scheduled: number;
  /** 보고서 대기 = 등록됐고 진행 시각 지남 + 보고서 없음 */
  pending: number;
  /** 완료 = 보고서 등록 */
  done: number;
  /** 미등록 = 계획 − 등록 회차 (음수면 0) */
  unregistered: number;
  /** 이전 담당(교체·중도 종료) 멘티에서 이 멘토가 완료한 회차 — 집계와 별도 표시 */
  previousDone: number;
}

/**
 * 멘토 1명의 세부일정 — 현재 담당 멘티(활성 배정)는 케이스 단위 누적 회차 전체(교체 전 멘토 회차 포함, §2-3)를
 * 목표 회차까지 채워 보여 주고 빈 자리는 '미등록' 행. 이전 담당 멘티는 이 멘토가 진행한 회차만.
 */
export function buildMentorDetail(mentorId: string, cases: StaffScheduleCase[], rounds: StaffRound[]): { summary: DetailSummary; mentees: DetailMentee[] } {
  const byCase = new Map<string, StaffRound[]>();
  for (const r of rounds) (byCase.get(r.caseId) ?? byCase.set(r.caseId, []).get(r.caseId)!).push(r);

  const summary: DetailSummary = { plan: 0, scheduled: 0, pending: 0, done: 0, unregistered: 0, previousDone: 0 };
  const mentees: DetailMentee[] = [];
  for (const c of cases) {
    const current = c.activeMentorId === mentorId && c.status !== 'withdrawn';
    const caseRounds = (byCase.get(c.id) ?? []).slice().sort((a, b) => a.roundNo - b.roundNo || a.startedAt.localeCompare(b.startedAt));
    const mine = caseRounds.filter((r) => r.mentorId === mentorId);
    if (!current && mine.length === 0) continue;
    const rows: DetailRow[] = [];
    if (current) {
      summary.plan += c.requiredTotal;
      for (const r of caseRounds) {
        rows.push({ kind: 'round', roundNo: r.roundNo, round: r, byOtherMentor: r.mentorId !== mentorId });
        if (r.status === 'done') summary.done += 1;
        else if (r.status === 'planned') summary.scheduled += 1;
        else summary.pending += 1;
      }
      const taken = new Set(caseRounds.map((r) => r.roundNo));
      for (let n = 1; n <= c.requiredTotal; n++) if (!taken.has(n)) rows.push({ kind: 'unregistered', roundNo: n });
      summary.unregistered += Math.max(0, c.requiredTotal - caseRounds.length);
      rows.sort((a, b) => a.roundNo - b.roundNo);
    } else {
      for (const r of mine) {
        rows.push({ kind: 'round', roundNo: r.roundNo, round: r });
        if (r.status === 'done') summary.previousDone += 1;
      }
    }
    mentees.push({ caseId: c.id, menteeLabel: c.menteeLabel, menteePhone: c.menteePhone, groupName: c.groupName, caseStatus: c.status, requiredTotal: c.requiredTotal, current, rows });
  }
  mentees.sort((a, b) => Number(b.current) - Number(a.current) || a.menteeLabel.localeCompare(b.menteeLabel, 'ko'));
  return { summary, mentees };
}

/** "계획 4건, 예정 2건, 완료 2건" (+ 보고서 대기 / 미등록 이 있으면 덧붙임) */
export function summaryText(s: DetailSummary): string {
  const parts = [`계획 ${s.plan}건`, `예정 ${s.scheduled}건`, `완료 ${s.done}건`];
  if (s.pending > 0) parts.push(`보고서 대기 ${s.pending}건`);
  if (s.unregistered > 0) parts.push(`미등록 ${s.unregistered}건`);
  return parts.join(', ');
}
