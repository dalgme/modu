import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone as normalizeMobile } from '@/lib/utils/phone';

/** 문자열에서 숫자만 남긴다 (휴대폰 번호 비교용). */
export function normalizePhone(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

/**
 * 저장용 표준 휴대폰 형식으로 변환한다 (010-XXXX-XXXX / 010-XXX-XXXX).
 * 표준 휴대폰 패턴이 아니면 원본(trim)을 유지하고, 빈 값이면 null 을 반환한다.
 * DB 저장 시 형식을 일관화해 표시·검색을 깔끔하게 유지한다(로그인은 숫자 정규화로 매칭).
 */
export function toStoredPhone(v: string | null | undefined): string | null {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  // (P31) +82·앞자리 0 유실·괄호 등 표기 편차를 utils/phone 으로 흡수 — 휴대폰 패턴이면 하이픈 형식으로 저장
  const d = normalizeMobile(raw);
  if (d && d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d && d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

/**
 * 멘티 로그인 아이디 = 한글이름(공백제거) + 휴대폰 뒷 4자리. 예: "강종복" + "0306" → "강종복0306".
 * 이름 또는 뒷4자리가 없으면 null.
 */
export function menteeLoginKey(
  name: string | null | undefined,
  phone: string | null | undefined,
): string | null {
  const n = (name ?? '').replace(/\s+/g, '');
  const last4 = normalizePhone(phone).slice(-4);
  if (!n || last4.length < 4) return null;
  return `${n}${last4}`;
}

export interface ResolvedUser {
  id: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

/**
 * 이메일 · 휴대폰 번호 · 멘티 아이디(이름+뒷4자리)로 사용자 1명을 찾는다 (service_role).
 *  - '@' 포함 → 이메일(대소문자 무시) 조회
 *  - 숫자·기호만(6자리+) → 휴대폰 번호로 매칭 (정규화 비교)
 *  - 그 외(한글 등 포함) → 멘티 아이디(이름+뒷4자리)로 매칭
 * 반환: 사용자 | null(없음) | 'ambiguous'(둘 이상 매칭)
 */
export async function resolveUserByIdentifier(
  identifier: string,
): Promise<ResolvedUser | null | 'ambiguous'> {
  const admin = createAdminClient();
  const id = identifier.trim();
  if (!id) return null;

  if (id.includes('@')) {
    const { data } = await admin
      .from('users')
      .select('id, email, phone, is_active')
      .ilike('email', id)
      .limit(2);
    if (!data || data.length === 0) return null;
    if (data.length > 1) return 'ambiguous';
    return data[0]!;
  }

  // 휴대폰 번호(숫자·기호만, 6자리 이상)로 보이면 휴대폰 매칭
  const digits = normalizePhone(id);
  if (/^[\d\s()+.-]+$/.test(id) && digits.length >= 6) {
    // 뒷 4자리로 좁혀 읽는다 — users 전체 스캔은 1,000행 캡에 잘려 로그인이 실패한다 (P30)
    const { data } = await admin
      .from('users')
      .select('id, email, phone, is_active')
      .not('phone', 'is', null)
      .ilike('phone', `%${digits.slice(-4)}`)
      .limit(1000);
    const matches = (data ?? []).filter((u) => normalizePhone(u.phone) === digits);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) return 'ambiguous';
    return null;
  }

  // 멘티 아이디 = 한글이름 + 휴대폰 뒷4자리 (예: 강종복0306)
  const key = id.replace(/\s+/g, '');
  // 기본 역할이 멘티이거나, 어느 행사에서든 멘티 역할로 소속된 계정 (설계 B)
  // 아이디 = 이름 + 뒷4자리 → 이름·뒷자리로 좁혀 읽은 뒤 키를 재검증 (전체 스캔 금지, P30)
  const last4 = key.slice(-4);
  const nameKey = key.slice(0, -4);
  if (!/^\d{4}$/.test(last4) || !nameKey) return null;
  const { data: candidates } = await admin
    .from('users')
    .select('id, email, phone, is_active, name')
    .ilike('phone', `%${last4}`)
    .limit(1000);
  const hits = (candidates ?? []).filter((u) => menteeLoginKey(u.name, u.phone) === key);
  if (hits.length === 1) {
    const u = hits[0]!;
    return { id: u.id, email: u.email, phone: u.phone, is_active: u.is_active };
  }
  if (hits.length > 1) return 'ambiguous';
  return null;
}
