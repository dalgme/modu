import 'server-only';

import { solapiConfigured, sendSolapiSms } from '@/lib/notifications/solapi';
import { resolveSmsCredentials } from '@/lib/sms/secrets';

export type SendResult = { ok: true; providerId?: string } | { ok: false; error: string };

/** 알림톡 대행사(비즈엠/솔라피 등) 설정 여부 */
export function alimtalkConfigured(): boolean {
  return Boolean(
    process.env.KAKAO_ALIMTALK_PROVIDER &&
    process.env.KAKAO_ALIMTALK_API_KEY &&
    process.env.KAKAO_ALIMTALK_SENDER_PROFILE,
  );
}

/** SMS 발송 설정 여부 (Solapi 우선, 없으면 레거시 SMS_FALLBACK) */
export function smsConfigured(): boolean {
  return (
    solapiConfigured() || Boolean(process.env.SMS_FALLBACK_API_KEY && process.env.SMS_FALLBACK_FROM)
  );
}

/**
 * 카카오 알림톡 발송.
 * 대행사 계약·발신프로필 등록 전에는 not-configured 로 반환한다 (발송 보류).
 * 계약 후 provider 별 실제 HTTP 호출을 이 함수에 구현한다.
 */
export async function sendAlimtalk(
  to: string,
  templateCode: string,
  text: string,
): Promise<SendResult> {
  if (!alimtalkConfigured()) {
    return { ok: false, error: 'alimtalk_not_configured' };
  }
  // TODO(P-계약후): 솔라피/비즈엠 REST API 연동
  //   const res = await fetch(providerEndpoint, { method: 'POST', headers, body })
  //   성공 시 { ok: true, providerId }
  void to;
  void templateCode;
  void text;
  return { ok: false, error: 'alimtalk_provider_not_implemented' };
}

/**
 * SMS 대체발송 (알림톡 실패 시 fallback).
 */
/**
 * SMS 발송. programId 가 있으면 행사별 자격증명(§21)을 먼저 쓰고, 없으면 플랫폼 환경변수로 폴백한다.
 * 행사 설정이 있는데 복호화·지문 검증에 실패하면 폴백하지 않고 실패를 돌려준다(변조 의심).
 */
export async function sendSms(to: string, text: string, programId: string | null = null): Promise<SendResult> {
  if (programId) {
    const creds = await resolveSmsCredentials(programId, 'send');
    if (creds) return sendSolapiSms(to, text, { creds });
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data } = await createAdminClient().from('program_sms_settings').select('is_active').eq('program_id', programId).maybeSingle();
    if (data?.is_active) return { ok: false, error: 'program_sms_credentials_unavailable' };
  }
  if (solapiConfigured()) {
    return sendSolapiSms(to, text);
  }
  const apiKey = process.env.SMS_FALLBACK_API_KEY;
  const from = process.env.SMS_FALLBACK_FROM;
  if (!apiKey || !from) return { ok: false, error: 'sms_not_configured' };
  return { ok: false, error: 'sms_fallback_not_implemented' };
}
