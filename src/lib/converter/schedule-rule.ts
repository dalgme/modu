/**
 * 한글 PDF 자동 변환 — 점검 시각 규칙 (2026-11-16). 서버·클라이언트 중립.
 * 변환 PC 는 이 규칙으로 계산한 답(지금 실행할지·다음 확인까지 몇 초 잘지)만 받는다 — PC 쪽에 시각 계산을 두지 않는다.
 *  - 시각은 한국 시간(KST) "HH:MM", 하루 최대 8회.
 *  - 지금 실행 = 오늘 지난 점검 시각 중 가장 늦은 것이 마지막 실행보다 뒤(PC 가 꺼져 있다 켜졌을 때 오늘 놓친 1회는 바로 실행)
 *                또는 [지금 변환 요청]이 마지막 실행보다 뒤.
 *  - PC 는 다음 점검 시각까지 자되, 설정 변경을 놓치지 않게 최대 1시간마다 일정만 다시 묻는다(파일 점검은 아님).
 */
export interface ConverterSchedule {
  enabled: boolean;
  times: string[];
}

export const DEFAULT_CONVERTER_SCHEDULE: ConverterSchedule = { enabled: true, times: ['09:00', '12:00', '17:00'] };
export const MAX_CONVERTER_TIMES = 8;
const KST_MS = 9 * 3600 * 1000;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeTime(v: string): string | null {
  const t = v.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hh = m[1]!.padStart(2, '0');
  const s = `${hh}:${m[2]}`;
  return TIME_RE.test(s) ? s : null;
}

/** 저장값(jsonb) → 정리된 일정. 이상한 값은 버리고, 시각이 하나도 없으면 기본 시각 */
export function parseConverterSchedule(v: unknown): ConverterSchedule {
  const o = (v && typeof v === 'object' ? v : {}) as { enabled?: unknown; times?: unknown };
  const raw = Array.isArray(o.times) ? o.times.filter((x): x is string => typeof x === 'string') : [];
  const times = Array.from(new Set(raw.map(normalizeTime).filter((x): x is string => !!x))).sort().slice(0, MAX_CONVERTER_TIMES);
  return { enabled: o.enabled !== false, times: times.length ? times : [...DEFAULT_CONVERTER_SCHEDULE.times] };
}

/** 입력 검사 — 오류 문구 또는 정리된 시각 */
export function validateConverterTimes(input: string[]): { ok: true; times: string[] } | { ok: false; error: string } {
  const cleaned: string[] = [];
  for (const t of input) {
    if (!t.trim()) continue;
    const n = normalizeTime(t);
    if (!n) return { ok: false, error: `시각 형식이 올바르지 않습니다: ${t} (예: 09:00)` };
    cleaned.push(n);
  }
  const times = Array.from(new Set(cleaned)).sort();
  if (times.length === 0) return { ok: false, error: '점검 시각을 1개 이상 입력하세요.' };
  if (times.length > MAX_CONVERTER_TIMES) return { ok: false, error: `점검 시각은 하루 ${MAX_CONVERTER_TIMES}회까지 정할 수 있습니다.` };
  return { ok: true, times };
}

/** KST 날짜(00:00)의 UTC ms */
function kstMidnightUtc(nowMs: number): number {
  const k = nowMs + KST_MS;
  return k - (k % 86_400_000) - KST_MS;
}

function slotMs(dayStartUtc: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return dayStartUtc + (h! * 60 + m!) * 60_000;
}

export interface ScheduleDecision {
  runNow: boolean;
  /** 다음 점검 시각 (ISO) — 꺼져 있으면 null */
  nextRunAt: string | null;
  /** PC 가 다음에 일정을 다시 물을 때까지 잘 시간(초, 60~3600) */
  sleepSeconds: number;
}

export function decideConverterRun(schedule: ConverterSchedule, lastRunAt: string | null, runRequestedAt: string | null, nowMs: number): ScheduleDecision {
  const last = lastRunAt ? Date.parse(lastRunAt) : 0;
  const requested = runRequestedAt ? Date.parse(runRequestedAt) : 0;
  const manual = requested > last && requested <= nowMs;
  if (!schedule.enabled) return { runNow: manual, nextRunAt: null, sleepSeconds: 3600 };
  const today = kstMidnightUtc(nowMs);
  const slots = [...schedule.times.map((t) => slotMs(today, t)), ...schedule.times.map((t) => slotMs(today + 86_400_000, t))].sort((a, b) => a - b);
  const passedToday = slots.filter((s) => s <= nowMs && s >= today);
  const latestPassed = passedToday.length ? passedToday[passedToday.length - 1]! : null;
  const due = latestPassed !== null && last < latestPassed;
  const next = slots.find((s) => s > nowMs) ?? null;
  const untilNext = next === null ? 3600 : Math.ceil((next - nowMs) / 1000);
  return { runNow: manual || due, nextRunAt: next === null ? null : new Date(next).toISOString(), sleepSeconds: Math.max(60, Math.min(3600, untilNext)) };
}

/** 원본 파일이 한글(HWP·HWPX)인지 — 이름·MIME */
export function isHwpFile(name: string, mime?: string | null): 'hwp' | 'hwpx' | null {
  const n = name.toLowerCase();
  if (n.endsWith('.hwpx')) return 'hwpx';
  if (n.endsWith('.hwp')) return 'hwp';
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/vnd.hancom.hwpx') return 'hwpx';
  if (m === 'application/x-hwp' || m === 'application/haansofthwp' || m === 'application/vnd.hancom.hwp') return 'hwp';
  return null;
}

/** 실패가 이만큼 쌓이면 자동 재시도를 멈춘다(운영 설정에서 [다시 시도]) */
export const MAX_CONVERT_ATTEMPTS = 3;
