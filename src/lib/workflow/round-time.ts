/**
 * 회차 시간 규칙 (2026-11-10) — 서버 검증·등록/수정 화면 공용 순수 모듈.
 *
 * 시각은 24시간제 정시(00:00~23:00)로 고른다. 종료 시각이 시작 시각과 같거나 이르면 **다음 날**로 본다
 *   예) 21:00 ~ 00:00 = 21시~자정(3시간), 23:00 ~ 02:00 = 23시~다음 날 새벽 2시(3시간).
 * 자정을 넘는 회차는 최대 12시간까지(잘못 고른 시간이 23시간짜리 회차가 되지 않게).
 * 회차의 '날짜'(단가 적용일·같은 날 금액 상한·일정 달력)는 **시작한 날** 기준이다.
 */

export const OVERNIGHT_MAX_MINUTES = 12 * 60;

const KST_MS = 9 * 3600 * 1000;
const kstYmdOf = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 10);

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface RoundSpan {
  startIso: string;
  endIso: string;
  minutes: number;
  /** 종료가 다음 날 */
  overnight: boolean;
}

/** 화면 입력(시작일 + 시작·종료 HH:MM) → 실제 일시. 종료 ≤ 시작이면 다음 날. 시작 = 종료면 0분 */
export function roundSpan(date: string, startHm: string, endHm: string): RoundSpan | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startHm) || !/^\d{2}:\d{2}$/.test(endHm)) return null;
  const start = new Date(`${date}T${startHm}:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const overnight = endHm < startHm;
  const endDate = overnight ? addDays(date, 1) : date;
  const end = new Date(`${endDate}T${endHm}:00+09:00`);
  if (Number.isNaN(end.getTime())) return null;
  return { startIso: start.toISOString(), endIso: end.toISOString(), minutes: Math.round((end.getTime() - start.getTime()) / 60000), overnight };
}

/** 서버 검증 — 오류 문구 또는 null (등록·일정 수정·운영사 정정·그룹멘토링 공용) */
export function roundSpanError(started: Date, ended: Date): string | null {
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return '일시를 확인하세요.';
  if (ended.getTime() <= started.getTime()) return '종료 시각은 시작 시각보다 늦어야 합니다.';
  const sDay = kstYmdOf(started.getTime());
  const eDay = kstYmdOf(ended.getTime());
  if (sDay === eDay) return null;
  // 자정을 넘는 회차 — 다음 날까지만, 최대 12시간 (종료가 정확히 자정이면 eDay 가 다음 날이지만 같은 규칙으로 통과)
  if (eDay !== addDays(sDay, 1)) return '한 회차는 다음 날까지만 이어질 수 있습니다.';
  if (ended.getTime() - started.getTime() > OVERNIGHT_MAX_MINUTES * 60000) return `자정을 넘는 회차는 최대 ${OVERNIGHT_MAX_MINUTES / 60}시간까지 등록할 수 있습니다. 시간을 확인하세요.`;
  return null;
}

/** 시간 겹침 검사에서 앞 날짜에 시작한 회차까지 보려면 이만큼 앞에서부터 조회한다 */
export const OVERLAP_LOOKBACK_MS = OVERNIGHT_MAX_MINUTES * 60000;

/** 화면 표기 — "21:00~24:00", "23:00~02:00(다음 날)" */
export function roundTimeRangeLabel(startIso: string, endIso: string): string {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return '';
  const hm = (ms: number) => new Date(ms + KST_MS).toISOString().slice(11, 16);
  const sDay = kstYmdOf(s);
  const eDay = kstYmdOf(e);
  if (sDay === eDay) return `${hm(s)}~${hm(e)}`;
  const endHm = hm(e);
  if (endHm === '00:00') return `${hm(s)}~24:00`;
  return `${hm(s)}~${endHm}(다음 날)`;
}

/** 시작 시각을 바꿀 때 종료 기본값 — 1시간 뒤(자정을 넘으면 다음 날 시각으로 돈다) */
export function hmPlus(hhmm: string, addMinutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h ?? 0) * 60 + (m ?? 0) + addMinutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
