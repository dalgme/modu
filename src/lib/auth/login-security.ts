import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';
import { createHash, randomBytes, randomInt } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms, smsConfigured } from '@/lib/notifications/provider';
import { logAudit } from '@/lib/workflow/audit';
import { normalizeEmail, normalizePhone } from '@/lib/utils/phone';
import { readMfaVerified, readTrustedToken, setMfaVerified } from '@/lib/auth/mfa-cookie';

/**
 * 로그인 보안 코어 (P35-A · SECURITY-POLICY R-2·R-6) — 전부 service_role 경로.
 *  - 실패 기록·잠금: `login_attempts` (계정 10분 내 5회 → 15분 잠금, IP 10분 내 30회 → 15분 차단)
 *  - 2단계 인증: `login_otps` (6자리·5분·5회·발급 60초 쿨다운 — password_reset_otps 와 같은 규칙)
 *  - 신뢰 기기: `trusted_devices` (쿠키 원문 ↔ DB sha256, 30일)
 * 대상 판정(`requiresMfa`)은 "발주처·운영사 역할을 어느 행사에서든 가진 계정 + 플랫폼 관리자". 멘토·멘티는 대상 아님.
 * 원문 식별자·IP 는 저장하지 않는다(해시만).
 */

// ── 잠금 정책 ────────────────────────────────────────────────────────────────
const ACCOUNT_FAIL_LIMIT = 5;
const ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const IP_FAIL_LIMIT = 30;
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_LOCK_MS = 15 * 60 * 1000;

// ── OTP 정책 ────────────────────────────────────────────────────────────────
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_PER_HOUR = 10;

const STAFF_ROLES = ['institution', 'nextlab'] as const;

/**
 * 잠금 산정에서 제외하는 사유 — locked/ip_blocked(잠금 중 시도: 세면 공격자가 두드리는 동안 잠금이 무한히 연장된다),
 * no_phone/sms_failed/inactive(비밀번호는 맞았고 그 뒤 단계에서 막힌 것 — 비밀번호 추측이 아니다)
 */
const NON_COUNTING_REASONS = new Set(['locked', 'ip_blocked', 'no_phone', 'sms_failed', 'inactive']);

export type LockStatus = { locked: false; reason: null; retryAfterMin: 0 } | { locked: true; reason: 'account' | 'ip'; retryAfterMin: number };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** 입력 식별자(이메일·휴대폰·멘티 아이디)를 정규화해 해시한다 — 표기 편차로 잠금을 피하지 못하게 */
export function hashIdentifier(identifier: string): string {
  const raw = (identifier ?? '').trim();
  let norm: string;
  if (raw.includes('@')) norm = `e:${normalizeEmail(raw)}`;
  else if (/^[\d\s()+.-]+$/.test(raw) && raw.replace(/\D/g, '').length >= 6) norm = `p:${normalizePhone(raw) ?? raw.replace(/\D/g, '')}`;
  else norm = `k:${raw.replace(/\s+/g, '')}`;
  return sha256(`modu:login:${norm}`);
}

/** IP 문자열 → sha256 (원문 미저장). 빈 값이면 null */
export function hashIp(ip: string | null | undefined): string | null {
  const v = (ip ?? '').trim();
  return v ? sha256(`modu:ip:${v}`) : null;
}

/** 현재 요청의 클라이언트 IP(x-forwarded-for 첫 값)·User-Agent. 서버 액션에서만 호출 */
export function requestClientInfo(): { ip: string | null; userAgent: string | null } {
  try {
    const h = headers();
    const fwd = h.get('x-forwarded-for');
    const ip = (fwd ? fwd.split(',')[0] : h.get('x-real-ip') ?? '')?.trim() || null;
    const userAgent = h.get('user-agent')?.slice(0, 300) ?? null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/** 표시용 마스킹 — 010-****-1234 */
export function maskPhone(phone: string | null | undefined): string {
  const d = normalizePhone(phone) ?? (phone ?? '').replace(/\D/g, '');
  if (d.length < 8) return '***';
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

/** `MFA_BYPASS_EMAILS`(콤마 구분) — 배포 스모크 점검 계정 등. 비어 있으면 아무도 예외가 아니다 */
export function isMfaBypassEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  const list = (process.env.MFA_BYPASS_EMAILS ?? '')
    .split(',')
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
  return list.includes(e);
}

// ── 로그인 시도 기록·잠금 ────────────────────────────────────────────────────

export async function recordLoginAttempt(input: {
  identifierHash: string;
  userId?: string | null;
  ipHash: string | null;
  success: boolean;
  reason?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const { error } = await createAdminClient().from('login_attempts').insert({
    identifier_hash: input.identifierHash,
    user_id: input.userId ?? null,
    ip_hash: input.ipHash,
    success: input.success,
    reason: input.success ? null : (input.reason ?? null),
    user_agent: input.userAgent ?? null,
  });
  if (error) console.error('[login-security] attempt insert failed', error.message);
}

type AttemptRow = { created_at: string; success: boolean; reason: string | null };

/**
 * 최근 기록(최신순)에서 "windowMs 안에 limit 회 연속 실패" 묶음을 찾아 잠금 해제 시각을 돌려준다.
 * 마지막 성공 이후의 실패만 센다(성공하면 카운터 리셋). 잠금 중 시도(locked/ip_blocked)는 세지 않는다.
 */
function lockUntilFrom(rows: AttemptRow[], limit: number, windowMs: number, lockMs: number, now: number): number | null {
  const fails: number[] = [];
  for (const r of rows) {
    if (r.success) break;
    if (r.reason && NON_COUNTING_REASONS.has(r.reason)) continue;
    fails.push(new Date(r.created_at).getTime());
  }
  for (let i = 0; i + limit - 1 < fails.length; i++) {
    const newest = fails[i]!;
    const oldest = fails[i + limit - 1]!;
    if (newest - oldest <= windowMs) {
      const until = newest + lockMs;
      return until > now ? until : null; // 최신 묶음이 풀렸으면 더 오래된 묶음도 풀려 있다
    }
  }
  return null;
}

/** 계정(식별자)·IP 잠금 상태. 계정 잠금이 우선 표시된다 */
export async function isLockedOut(identifierHash: string, ipHash: string | null): Promise<LockStatus> {
  const admin = createAdminClient();
  const now = Date.now();
  const sinceAccount = new Date(now - ACCOUNT_WINDOW_MS - ACCOUNT_LOCK_MS).toISOString();
  const { data: accountRows } = await admin
    .from('login_attempts')
    .select('created_at, success, reason')
    .eq('identifier_hash', identifierHash)
    .gte('created_at', sinceAccount)
    .order('created_at', { ascending: false })
    .limit(100);
  const accountUntil = lockUntilFrom(accountRows ?? [], ACCOUNT_FAIL_LIMIT, ACCOUNT_WINDOW_MS, ACCOUNT_LOCK_MS, now);
  if (accountUntil) return { locked: true, reason: 'account', retryAfterMin: Math.max(1, Math.ceil((accountUntil - now) / 60_000)) };

  if (ipHash) {
    const sinceIp = new Date(now - IP_WINDOW_MS - IP_LOCK_MS).toISOString();
    const { data: ipRows } = await admin
      .from('login_attempts')
      .select('created_at, success, reason')
      .eq('ip_hash', ipHash)
      .gte('created_at', sinceIp)
      .order('created_at', { ascending: false })
      .limit(300);
    const ipUntil = lockUntilFrom(ipRows ?? [], IP_FAIL_LIMIT, IP_WINDOW_MS, IP_LOCK_MS, now);
    if (ipUntil) return { locked: true, reason: 'ip', retryAfterMin: Math.max(1, Math.ceil((ipUntil - now) / 60_000)) };
  }
  return { locked: false, reason: null, retryAfterMin: 0 };
}

/** 잠금 안내 문구 (로그인 화면 오류 영역에 그대로 표시) */
export function lockoutMessage(lock: LockStatus): string {
  if (!lock.locked) return '';
  return lock.reason === 'account'
    ? `로그인 실패가 반복되어 이 계정은 잠시 잠겼습니다. 약 ${lock.retryAfterMin}분 후 다시 시도하세요. 비밀번호를 잊으셨다면 [비밀번호를 잊으셨나요?]를 이용하세요.`
    : `이 네트워크에서 로그인 실패가 너무 많아 잠시 차단되었습니다. 약 ${lock.retryAfterMin}분 후 다시 시도하세요.`;
}

// ── 2단계 인증 대상 ───────────────────────────────────────────────────────────

/**
 * 2단계 인증 대상인가 — 플랫폼 관리자, 또는 기본 역할/어느 행사(활성 소속)에서든 발주처·운영사 역할.
 * 요청당 1회 캐시(가드가 레이아웃·페이지에서 거듭 부른다). React cache 는 인자 동일성으로 메모하므로 원시값만 받는다.
 */
export const requiresMfa = cache(async (userId: string): Promise<boolean> => {
  const admin = createAdminClient();
  const { data: u } = await admin.from('users').select('role, is_platform_admin').eq('id', userId).maybeSingle();
  if (!u) return false;
  if (u.is_platform_admin) return true;
  if ((STAFF_ROLES as readonly string[]).includes(u.role)) return true;
  const { data: mem } = await admin
    .from('program_members')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', [...STAFF_ROLES])
    .limit(1);
  return (mem ?? []).length > 0;
});

/**
 * 가드용 종합 판정 — 이 요청이 2단계 인증을 만족하는가.
 *  1) modu_mfa 쿠키 통과  2) 대상 아님  3) 예외 이메일(MFA_BYPASS_EMAILS)  4) 문자 발송 불가(플랫폼 잠김 방지 예외)
 *  5) 신뢰 기기 쿠키가 유효 → 통과시키고 modu_mfa 를 심는다(렌더 중이면 심기는 실패해도 통과).
 * 로그인 시점의 감사(auth.mfa_bypassed / auth.mfa_skipped_no_sms)는 signIn 이 남긴다 — 여기서는 기록하지 않는다.
 */
export const mfaSatisfied = cache(async (userId: string, email: string | null): Promise<boolean> => {
  if (readMfaVerified(userId)) return true;
  if (!(await requiresMfa(userId))) return true;
  if (isMfaBypassEmail(email)) return true;
  if (!smsConfigured()) return true;
  const token = readTrustedToken();
  if (token && (await isTrustedDevice(userId, token))) {
    setMfaVerified(userId);
    return true;
  }
  return false;
});

// ── OTP 발급·검증 ─────────────────────────────────────────────────────────────

export type IssueOtpResult =
  | { ok: true }
  | { ok: false; error: 'no_phone' | 'sms_not_configured' | 'cooldown' | 'too_many' | 'store_failed' | 'send_failed'; retryAfterSec?: number };

/**
 * 로그인 인증번호 발급 + 문자 발송(`sendSms(to, text, null)` — 플랫폼 발송 설정. 로그인 시점엔 행사 컨텍스트가 없다).
 * 이전 미사용 코드는 무효화. 60초 쿨다운·시간당 10회. 저장 실패 시 발송하지 않고, 발송 실패 시 코드를 즉시 무효화한다.
 */
export async function issueLoginOtp(
  userId: string,
  phone: string | null | undefined,
  ipHash: string | null,
  opts: { audit?: 'auth.mfa_sent' | 'auth.mfa_resent' } = {},
): Promise<IssueOtpResult> {
  const to = normalizePhone(phone);
  if (!to) return { ok: false, error: 'no_phone' };
  if (!smsConfigured()) return { ok: false, error: 'sms_not_configured' };

  const admin = createAdminClient();
  const now = Date.now();
  const { data: recent } = await admin
    .from('login_otps')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(now - 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  const rows = recent ?? [];
  if (rows.length >= OTP_MAX_PER_HOUR) return { ok: false, error: 'too_many' };
  if (rows[0]) {
    const elapsed = now - new Date(rows[0].created_at).getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) return { ok: false, error: 'cooldown', retryAfterSec: Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000) };
  }

  await admin.from('login_otps').update({ consumed_at: new Date(now).toISOString() }).eq('user_id', userId).is('consumed_at', null);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { data: inserted, error: insertError } = await admin
    .from('login_otps')
    .insert({ user_id: userId, code_hash: sha256(code), expires_at: new Date(now + OTP_TTL_MS).toISOString(), ip_hash: ipHash })
    .select('id')
    .single();
  if (insertError || !inserted) {
    console.error('[login-security] OTP 저장 실패 — SMS 미발송:', insertError?.message);
    return { ok: false, error: 'store_failed' };
  }

  // 문자 문안 — 기관명 리터럴 금지(플랫폼 공통 문구)
  const text = `[멘토링 운영관리 플랫폼] 로그인 인증번호 ${code} (5분 내 입력, 본인이 아니면 무시하세요)`;
  let sent = false;
  try {
    const res = await sendSms(to, text, null);
    sent = res.ok;
    if (!res.ok) console.error('[login-security] OTP 발송 실패:', res.error);
  } catch (e) {
    console.error('[login-security] OTP 발송 예외:', e instanceof Error ? e.message : e);
  }
  if (!sent) {
    await admin.from('login_otps').update({ consumed_at: new Date().toISOString() }).eq('id', inserted.id);
    return { ok: false, error: 'send_failed' };
  }

  await logAudit(admin, {
    actorId: userId,
    action: opts.audit ?? 'auth.mfa_sent',
    entityType: 'users',
    entityId: userId,
    metadata: { phone: maskPhone(to) },
  });
  return { ok: true };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; attemptsLeft: number }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'exhausted' };

/** 인증번호 검증 — 불일치는 시도 +1, 5회째 불일치·초과 시 그 코드를 무효화(exhausted). 성공 시 소비 */
export async function verifyLoginOtp(userId: string, code: string): Promise<VerifyOtpResult> {
  const digits = (code ?? '').replace(/\D/g, '');
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('login_otps')
    .select('id, code_hash, attempts, expires_at')
    .eq('user_id', userId)
    .is('consumed_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  const otp = (rows ?? [])[0];
  if (!otp) return { ok: false, reason: 'expired' };

  const consume = () => admin.from('login_otps').update({ consumed_at: new Date().toISOString() }).eq('id', otp.id);

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await consume();
    return { ok: false, reason: 'exhausted' };
  }
  if (digits.length !== 6 || otp.code_hash !== sha256(digits)) {
    const attempts = otp.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await consume();
      return { ok: false, reason: 'exhausted' };
    }
    await admin.from('login_otps').update({ attempts }).eq('id', otp.id);
    return { ok: false, reason: 'invalid', attemptsLeft: OTP_MAX_ATTEMPTS - attempts };
  }
  await consume();
  return { ok: true };
}

// ── 신뢰 기기 ─────────────────────────────────────────────────────────────────

/** 신뢰 기기 발급 — 원문 토큰을 돌려준다(쿠키에 심는다). DB 에는 sha256 만. 실패 시 null */
export async function issueTrustedDevice(userId: string, userAgent: string | null, ipHash: string | null): Promise<string | null> {
  const token = randomBytes(32).toString('base64url');
  const { error } = await createAdminClient().from('trusted_devices').insert({
    user_id: userId,
    token_hash: sha256(token),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    user_agent: userAgent?.slice(0, 300) ?? null,
    ip_hash: ipHash,
  });
  if (error) {
    console.error('[login-security] trusted device insert failed', error.message);
    return null;
  }
  return token;
}

/** 쿠키 토큰이 이 사용자의 유효한(미해제·미만료) 신뢰 기기인가. 맞으면 last_used_at 갱신 */
export async function isTrustedDevice(userId: string, token: string): Promise<boolean> {
  if (!token) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from('trusted_devices')
    .select('id')
    .eq('token_hash', sha256(token))
    .eq('user_id', userId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!data) return false;
  await admin.from('trusted_devices').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return true;
}

/** 이 사용자의 신뢰 기기를 전부 해제(revoked_at). 해제한 건수 반환 */
export async function revokeTrustedDevices(userId: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('trusted_devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id');
  if (error) {
    console.error('[login-security] trusted device revoke failed', error.message);
    return 0;
  }
  return (data ?? []).length;
}
