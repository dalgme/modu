/**
 * 한국시간(KST, UTC+9) 고정 시각 유틸 (P35-D).
 *
 * 서버(Vercel)는 UTC, 브라우저는 KST 라서 `Date#getHours()` 같은 로컬 getter 로 표시하면
 *  (a) 클라이언트 컴포넌트에서는 서버 HTML 과 클라이언트 렌더가 달라 하이드레이션 오류(React #418/#423/#425),
 *  (b) 서버 컴포넌트에서는 시각이 9시간 어긋나 표시된다.
 * 여기의 함수는 전부 **UTC getter + 9시간** 으로 계산하므로 실행 환경의 TZ 와 무관하게 같은 결과를 낸다.
 * 엑셀 쪽(`src/lib/excel/sheet.ts`)은 별도 목적의 같은 방식 구현이라 그대로 둔다.
 */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 요일 라벨 (0 = 일요일) */
export const KST_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface KstParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  /** 0 = 일요일 … 6 = 토요일 */
  weekday: number;
}

/** 'YYYY-MM-DD' (시각 없는 date 컬럼 값) 인지 */
export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 입력을 Date(순간) 로 — 잘못된 값이면 null */
export function toInstant(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * KST 로 분해. 'YYYY-MM-DD' 만 있는 값은 그 날짜 그대로(00:00) 돌려준다 — +9h 로 날짜가 밀리지 않게.
 */
export function toKstParts(value: string | number | Date | null | undefined): KstParts | null {
  if (typeof value === 'string' && DATE_ONLY_RE.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(5, 7));
    const d = Number(value.slice(8, 10));
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { y, m, d, hh: 0, mm: 0, ss: 0, weekday };
  }
  const inst = toInstant(value);
  if (!inst) return null;
  const s = new Date(inst.getTime() + KST_OFFSET_MS);
  return {
    y: s.getUTCFullYear(),
    m: s.getUTCMonth() + 1,
    d: s.getUTCDate(),
    hh: s.getUTCHours(),
    mm: s.getUTCMinutes(),
    ss: s.getUTCSeconds(),
    weekday: s.getUTCDay(),
  };
}

/** 'YYYY-MM-DD' (KST). 잘못된 값은 '' */
export function kstYmd(value: string | number | Date | null | undefined): string {
  const p = toKstParts(value);
  return p ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : '';
}

/** 'HH:mm' (KST). 잘못된 값은 '' */
export function kstHm(value: string | number | Date | null | undefined): string {
  const p = toKstParts(value);
  return p ? `${pad2(p.hh)}:${pad2(p.mm)}` : '';
}

/** 오늘(KST) 'YYYY-MM-DD' */
export function kstTodayYmd(now: number = Date.now()): string {
  return kstYmd(now);
}

/** 요일 라벨('일'~'토', KST). 잘못된 값은 '' */
export function kstWeekdayLabel(value: string | number | Date | null | undefined): string {
  const p = toKstParts(value);
  return p ? (KST_WEEKDAYS[p.weekday] ?? '') : '';
}

/** 'M/D' (KST) — 표 안의 짧은 날짜 */
export function kstMd(value: string | number | Date | null | undefined): string {
  const p = toKstParts(value);
  return p ? `${p.m}/${p.d}` : '';
}

/** 'M/D(요일) HH:mm' (KST) — 일정 한 줄 표기 */
export function kstWhen(value: string | number | Date | null | undefined): string {
  const p = toKstParts(value);
  return p ? `${p.m}/${p.d}(${KST_WEEKDAYS[p.weekday]}) ${pad2(p.hh)}:${pad2(p.mm)}` : '';
}

/** 'YYYY-MM-DD' (KST 날짜) → 그 날 00:00 KST 의 순간(Date). 잘못된 값은 null */
export function kstStartOfDay(ymd: string): Date | null {
  if (!DATE_ONLY_RE.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "KST 달력 날짜" 를 UTC 필드에 담은 Date(= 순간 + 9h). 달력 산술(월 이동·주 시작 등)은 이 값에
 * `getUTC*`/`setUTC*` 를 써서 환경 TZ 와 무관하게 계산한다. `fromKstCalendar` 로 되돌린다.
 */
export function toKstCalendar(value: string | number | Date): Date {
  const inst = toInstant(value) ?? new Date(NaN);
  return new Date(inst.getTime() + KST_OFFSET_MS);
}

/** `toKstCalendar` 의 역 — 달력 Date → 실제 순간 */
export function fromKstCalendar(cal: Date): Date {
  return new Date(cal.getTime() - KST_OFFSET_MS);
}

/** 달력 Date(UTC 필드 = KST) → 'YYYY-MM-DD' */
export function calendarYmd(cal: Date): string {
  return `${cal.getUTCFullYear()}-${pad2(cal.getUTCMonth() + 1)}-${pad2(cal.getUTCDate())}`;
}
