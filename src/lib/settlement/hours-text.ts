/** 분 → "N시간 M분" (0 이하 = '-') — 서버·클라이언트 공용 */
export function hoursText(min: number): string {
  if (!min || min <= 0) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
