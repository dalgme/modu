'use server';

import { redirect } from 'next/navigation';
import { createHash, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveUserByIdentifier, normalizePhone } from '@/lib/auth/identifier';
import { sendSms, smsConfigured } from '@/lib/notifications/provider';
import { changePasswordSchema } from '@/lib/validations/auth';

export type ResetState =
  | { ok: true }
  | { ok?: false; error: string }
  | undefined;

const OTP_TTL_MS = 5 * 60 * 1000; // 5분
const RESEND_COOLDOWN_MS = 60 * 1000; // 60초
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

interface OtpRow {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
  attempts: number;
  created_at: string;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** password_reset_otps 는 타입 생성 전(0031) 테이블이라 loosely-typed 클라이언트로 접근한다. */
function otpTable(admin: ReturnType<typeof createAdminClient>) {
  return (admin as unknown as SupabaseClient).from('password_reset_otps');
}

/**
 * 1단계: 이메일/휴대폰으로 재설정 요청 → 등록된 휴대폰으로 6자리 인증번호 SMS 발송.
 * 계정 존재 여부를 노출하지 않기 위해 결과는 항상 동일한 성공 응답(익명화)을 반환한다.
 * 레이트리밋: 재발송 쿨다운 60초 + 시간당 최대 5회.
 */
export async function requestPasswordResetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  if (!identifier) return { error: '이메일 또는 휴대폰 번호를 입력하세요.' };

  const ok = { ok: true } as const;
  const admin = createAdminClient();
  const resolved = await resolveUserByIdentifier(identifier);
  if (!resolved || resolved === 'ambiguous' || !resolved.is_active) return ok;

  const phone = normalizePhone(resolved.phone);
  if (phone.length < 10 || !smsConfigured()) return ok; // 등록 번호 없음/발송 불가 — 익명화

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await otpTable(admin)
    .select('created_at')
    .eq('user_id', resolved.id)
    .gte('created_at', hourAgo)
    .order('created_at', { ascending: false });
  const recentRows = (recent ?? []) as Pick<OtpRow, 'created_at'>[];
  if (recentRows.length >= MAX_REQUESTS_PER_HOUR) return ok;
  if (recentRows[0] && Date.now() - new Date(recentRows[0].created_at).getTime() < RESEND_COOLDOWN_MS) {
    return ok;
  }

  // 이전 미사용 코드 무효화
  await otpTable(admin)
    .update({ consumed_at: new Date().toISOString() })
    .eq('user_id', resolved.id)
    .is('consumed_at', null);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error: insertError } = await otpTable(admin).insert({
    user_id: resolved.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  // 코드 저장 실패 시 SMS 를 보내지 않는다. (저장 안 된 코드를 발송하면 사용자는
  // 문자를 받고도 항상 '만료/불일치'로 실패해 원인 파악이 어려워진다.)
  if (insertError) {
    console.error('[password-reset] OTP 저장 실패 — SMS 미발송:', insertError.message);
    return ok;
  }

  try {
    await sendSms(
      resolved.phone!,
      `[멘토링 플랫폼] 비밀번호 재설정 인증번호 ${code} · 5분 내 입력하세요. 본인이 요청하지 않았다면 무시하세요.`,
    );
  } catch {
    // 발송 실패는 익명화(일반 성공 응답) — 사용자는 재요청으로 재시도 가능
  }
  return ok;
}

/**
 * 2단계: 인증번호 + 새 비밀번호 검증 후 재설정. 성공 시 로그인 화면으로.
 * 코드 불일치는 시도 횟수 증가(최대 5회), 만료/초과 시 재요청 유도. 메시지는 일반화.
 */
export async function verifyPasswordResetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  const parsed = changePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' };
  }
  if (code.length !== 6) return { error: '인증번호 6자리를 입력하세요.' };

  const admin = createAdminClient();
  const resolved = await resolveUserByIdentifier(identifier);
  const invalid = { error: '인증번호가 올바르지 않거나 만료되었습니다. 다시 요청해 주세요.' } as const;
  if (!resolved || resolved === 'ambiguous') return invalid;

  const { data: rows } = await otpTable(admin)
    .select('*')
    .eq('user_id', resolved.id)
    .is('consumed_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  const otp = ((rows ?? []) as OtpRow[])[0];
  if (!otp) return invalid;

  if (otp.attempts >= MAX_ATTEMPTS) {
    await otpTable(admin).update({ consumed_at: new Date().toISOString() }).eq('id', otp.id);
    return { error: '인증 시도 횟수를 초과했습니다. 처음부터 다시 요청해 주세요.' };
  }
  if (otp.code_hash !== hashCode(code)) {
    await otpTable(admin)
      .update({ attempts: otp.attempts + 1 })
      .eq('id', otp.id);
    return { error: '인증번호가 올바르지 않습니다.' };
  }

  // 검증 성공 → 비밀번호 재설정 (service_role)
  const { error: pwError } = await admin.auth.admin.updateUserById(resolved.id, {
    password: parsed.data.password,
  });
  if (pwError) return { error: '비밀번호 변경에 실패했습니다. 잠시 후 다시 시도하세요.' };

  await admin
    .from('users')
    .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq('id', resolved.id);
  await otpTable(admin).update({ consumed_at: new Date().toISOString() }).eq('id', otp.id);
  await admin.from('audit_logs').insert({
    actor_id: resolved.id,
    action: 'account.password_reset_sms',
    entity_type: 'users',
    entity_id: resolved.id,
    metadata: {},
  });

  redirect('/login?reset=1');
}
