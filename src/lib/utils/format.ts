import { DATE_ONLY_RE, toKstParts } from '@/lib/utils/kst';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * ISO 문자열/Date → 'yyyy.MM.dd' — **KST 고정**(P35-D). 서버(UTC)·브라우저(KST) 어디서 렌더해도 같은 문자열이라
 * 하이드레이션 불일치가 없고, 서버 컴포넌트에서도 한국 날짜로 나온다.
 * 'YYYY-MM-DD' 만 있는 값(date 컬럼: starts_on·ends_on·effective_from 등)은 시각이 없으므로 그대로 y.m.d 로 표시한다.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const p = toKstParts(value);
  return p ? `${p.y}.${pad2(p.m)}.${pad2(p.d)}` : '-';
}

/** ISO 문자열/Date → 'yyyy.MM.dd HH:mm' — KST 고정. 'YYYY-MM-DD' 만 있는 값은 날짜만 표시 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const p = toKstParts(value);
  if (!p) return '-';
  if (typeof value === 'string' && DATE_ONLY_RE.test(value)) return `${p.y}.${pad2(p.m)}.${pad2(p.d)}`;
  return `${p.y}.${pad2(p.m)}.${pad2(p.d)} ${pad2(p.hh)}:${pad2(p.mm)}`;
}

/**
 * 방문 일시 등 '벽시계(wall-clock)' 시각의 구성요소를 타임존 변환 없이 그대로 추출.
 * visited_at 은 사용자가 입력한 현지(KST) 시각을 문자열로 저장한 값이라, Date 로 파싱하면
 * 서버(UTC)·클라이언트(KST) 환경에 따라 시각이 어긋난다(수정 화면에서 시각이 바뀌어 보이는 원인).
 * 저장된 문자열의 'YYYY-MM-DDTHH:mm' 부분을 그대로 읽어 어느 환경에서나 동일하게 표시한다.
 */
export function parseWallClock(
  value: string | null | undefined,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  if (!value) return null;
  const m = String(value).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

/** 벽시계 시각 → 'yyyy.MM.dd HH:mm' (타임존 변환 없음). visited_at 표시용. */
export function formatWallClock(value: string | null | undefined): string {
  const p = parseWallClock(value);
  if (!p) return '-';
  return `${p.year}.${pad2(p.month)}.${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** 방문 일시 → 'yyyy.MM.dd HH:mm~HH:mm (N시간 M분)'. duration 없으면 시작만 표시 */
export function formatVisitRange(
  visitedAt: string | null | undefined,
  durationMinutes: number | null | undefined,
): string {
  const p = parseWallClock(visitedAt);
  if (!p) return '-';
  const base = `${p.year}.${pad2(p.month)}.${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
  if (durationMinutes == null || durationMinutes <= 0) return base;
  const endTotal = (p.hour * 60 + p.minute + durationMinutes) % (24 * 60);
  const endStr = `${pad2(Math.floor(endTotal / 60))}:${pad2(endTotal % 60)}`;
  const h = Math.floor(durationMinutes / 60);
  const m = durationMinutes % 60;
  const dur = m ? `${h}시간 ${m}분` : `${h}시간`;
  return `${base}~${endStr} (${dur})`;
}

/** 숫자 → '1,234,567원' */
export function formatKRW(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString('ko-KR')}원`;
}

/**
 * 숫자 → '1,234,567' (단위 '원' 없음).
 * 서식 셀이 뒤에 ' 원'을 직접 붙이는 경우 사용 (formatKRW 사용 시 '원 원' 이중표기 방지).
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('ko-KR');
}
