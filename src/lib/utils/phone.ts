/**
 * 휴대폰 번호 정규화 (P31) — 서버·클라이언트 공용 (server-only 아님).
 * 엑셀·폼·붙여넣기로 들어오는 온갖 표기(하이픈·공백·괄호·+82·앞자리 0 유실)를 숫자 11자리(또는 10자리)로 통일한다.
 *  - 숫자만 남긴다
 *  - '82' 국가코드로 시작하면 '0' 으로 치환 (+82 10-1234-5678 → 01012345678)
 *  - 엑셀이 앞자리 0 을 떼어낸 1XXXXXXXXX(10자리)는 0 을 되살린다
 *  - 최종적으로 ^01[016789]\d{7,8}$ 이 아니면 null (휴대폰이 아님)
 */
export function normalizePhone(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('82')) d = `0${d.slice(2)}`;
  if (/^1\d{9}$/.test(d)) d = `0${d}`;
  return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}

/** 정규화된 숫자열 → 표시/저장 형식 (010-1234-5678 / 010-123-4567). 정규화 실패면 null */
export function formatPhone(raw: string | number | null | undefined): string | null {
  const d = normalizePhone(raw);
  if (!d) return null;
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** 이메일 정규화 — 계정 생성·조회·비교는 전부 이 값으로 (P31) */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}
