import 'server-only';

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 행사별 문자 API 자격증명 — 다중 보안 계층 (docs/MODU-DESIGN.md §21 · 2026-09-07 요건)
 *
 *  L1 저장소  : `program_sms_settings` 는 RLS 정책이 없어 anon/authenticated 로 조회 불가. service_role(서버)만.
 *  L2 암호화  : 봉투 암호화. 행사별 DEK(32B 난수)로 AES-256-GCM 암호화, DEK 는 환경변수 KEK(`SMS_KEK`)로 감싼다.
 *               → DB 덤프만으로는 복호화 불가, 환경변수만으로는 어떤 값도 알 수 없다.
 *  L3 바인딩  : GCM AAD = program_id + 필드명. 다른 행사 행에 붙여 넣거나 필드를 바꿔치기하면 복호화가 실패한다.
 *  L4 무결성  : fingerprint = HMAC(KEK, program_id|apiKey|sender). 복호화 후 대조 → 변조 감지.
 *  L5 노출 최소화: 평문은 발송 함수 안에서만 메모리에 존재. 화면·서버 액션 반환값·로그에는 힌트(앞4/뒤4)만.
 *  L6 변경 통제: 설정·교체·비활성은 운영사 + 행사 멤버 + **비밀번호 재인증**(실패 5회 → 15분 잠금) + 감사·접근 로그.
 *  L7 폴백    : 행사 설정이 없거나 KEK 미설정이면 플랫폼 환경변수(SOLAPI_*)로 발송(기존 동작).
 */

export interface SmsCredentials {
  provider: 'solapi';
  apiKey: string;
  apiSecret: string;
  senderNumber: string;
  /** 출처 — 로그·화면 표시용 */
  source: 'program' | 'platform';
}

export interface SmsSettingsView {
  configured: boolean;
  provider: 'solapi';
  apiKeyHint: string | null;
  senderHint: string | null;
  isActive: boolean;
  verifiedAt: string | null;
  rotatedAt: string | null;
  /** 플랫폼 환경변수 폴백 사용 가능 여부 */
  platformFallback: boolean;
  kekConfigured: boolean;
}

const ALG = 'aes-256-gcm';

function kek(): Buffer | null {
  const raw = process.env.SMS_KEK;
  if (!raw) return null;
  // 64 hex → 32B, 또는 base64 44자 → 32B
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

export function smsKekConfigured(): boolean {
  return kek() !== null;
}

function seal(key: Buffer, plain: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}

function open(key: Buffer, sealed: string, aad: string): Buffer {
  const [ivB, tagB, ctB] = sealed.split('.');
  if (!ivB || !tagB || !ctB) throw new Error('sealed_format');
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivB, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]);
}

function fingerprintOf(key: Buffer, programId: string, apiKey: string, sender: string): string {
  return createHmac('sha256', key).update(`${programId}|${apiKey}|${sender}`).digest('hex');
}

function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

/** 저장(신규·교체). 호출부가 권한·재인증을 끝낸 뒤에만 부른다. 반환값에 평문 없음. */
export async function storeProgramSmsCredentials(input: {
  programId: string;
  apiKey: string;
  apiSecret: string;
  senderNumber: string;
  actorId: string;
}): Promise<{ ok: true; apiKeyHint: string; senderHint: string } | { ok: false; error: string }> {
  const k = kek();
  if (!k) return { ok: false, error: '서버에 SMS_KEK 가 설정되지 않아 저장할 수 없습니다. 플랫폼 관리자에게 문의하세요.' };
  const apiKey = input.apiKey.trim();
  const apiSecret = input.apiSecret.trim();
  const sender = digitsOnly(input.senderNumber);
  if (apiKey.length < 8 || apiSecret.length < 8) return { ok: false, error: 'API 키/시크릿 형식이 올바르지 않습니다.' };
  if (sender.length < 8 || sender.length > 12) return { ok: false, error: '발신번호는 숫자 8~12자리여야 합니다.' };

  const dek = randomBytes(32);
  const pid = input.programId;
  const row = {
    program_id: pid,
    provider: 'solapi' as const,
    enc_version: 1,
    dek_wrapped: seal(k, dek, `${pid}:dek`),
    api_key_enc: seal(dek, Buffer.from(apiKey), `${pid}:api_key`),
    api_secret_enc: seal(dek, Buffer.from(apiSecret), `${pid}:api_secret`),
    sender_number_enc: seal(dek, Buffer.from(sender), `${pid}:sender`),
    api_key_hint: apiKey.slice(0, 4),
    sender_number_hint: sender.slice(-4),
    fingerprint: fingerprintOf(k, pid, apiKey, sender),
    is_active: true,
    verified_at: null,
    rotated_at: new Date().toISOString(),
    updated_by: input.actorId,
  };
  const admin = createAdminClient();
  const { data: existing } = await admin.from('program_sms_settings').select('program_id').eq('program_id', pid).maybeSingle();
  const { error } = existing
    ? await admin.from('program_sms_settings').update(row).eq('program_id', pid)
    : await admin.from('program_sms_settings').insert({ ...row, created_by: input.actorId });
  if (error) return { ok: false, error: error.message };
  await logSmsAccess(pid, input.actorId, existing ? 'rotate' : 'set', { api_key_hint: row.api_key_hint, sender_hint: row.sender_number_hint });
  // 평문 참조 제거 (GC 힌트)
  dek.fill(0);
  return { ok: true, apiKeyHint: row.api_key_hint, senderHint: row.sender_number_hint };
}

export async function disableProgramSms(programId: string, actorId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from('program_sms_settings').update({ is_active: false, updated_by: actorId }).eq('program_id', programId);
  await logSmsAccess(programId, actorId, 'disable', null);
}

/** 화면용 요약 — 평문 없음 */
export async function getProgramSmsSettingsView(programId: string): Promise<SmsSettingsView> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('program_sms_settings')
    .select('provider, api_key_hint, sender_number_hint, is_active, verified_at, rotated_at')
    .eq('program_id', programId)
    .maybeSingle();
  const platformFallback = Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER_NUMBER_1);
  return {
    configured: !!data,
    provider: 'solapi',
    apiKeyHint: data?.api_key_hint ?? null,
    senderHint: data?.sender_number_hint ?? null,
    isActive: data?.is_active ?? false,
    verifiedAt: data?.verified_at ?? null,
    rotatedAt: data?.rotated_at ?? null,
    platformFallback,
    kekConfigured: smsKekConfigured(),
  };
}

/**
 * 발송용 자격증명 해석: 행사 설정(활성) → 플랫폼 환경변수 폴백 → null.
 * 복호화 실패·지문 불일치는 접근 로그에 남기고 폴백하지 않는다(변조 의심 시 발송 중단).
 */
export async function resolveSmsCredentials(programId: string | null, usage: 'send' | 'test' = 'send'): Promise<SmsCredentials | null> {
  if (programId) {
    const k = kek();
    const admin = createAdminClient();
    const { data } = await admin.from('program_sms_settings').select('*').eq('program_id', programId).maybeSingle();
    if (data && data.is_active) {
      if (!k) {
        await logSmsAccess(programId, null, 'decrypt_fail', { reason: 'kek_missing' });
        return null;
      }
      try {
        const dek = open(k, data.dek_wrapped, `${programId}:dek`);
        const apiKey = open(dek, data.api_key_enc, `${programId}:api_key`).toString('utf8');
        const apiSecret = open(dek, data.api_secret_enc, `${programId}:api_secret`).toString('utf8');
        const sender = open(dek, data.sender_number_enc, `${programId}:sender`).toString('utf8');
        dek.fill(0);
        const expected = Buffer.from(fingerprintOf(k, programId, apiKey, sender));
        const actual = Buffer.from(data.fingerprint);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
          await logSmsAccess(programId, null, 'decrypt_fail', { reason: 'fingerprint_mismatch' });
          return null;
        }
        if (usage === 'send') await logSmsAccess(programId, null, 'send_use', null);
        return { provider: 'solapi', apiKey, apiSecret, senderNumber: sender, source: 'program' };
      } catch (err) {
        await logSmsAccess(programId, null, 'decrypt_fail', { reason: err instanceof Error ? err.message : 'unknown' });
        return null;
      }
    }
  }
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER_NUMBER_1;
  if (apiKey && apiSecret && sender) {
    return { provider: 'solapi', apiKey, apiSecret, senderNumber: sender, source: 'platform' };
  }
  return null;
}

export async function markSmsVerified(programId: string, actorId: string, ok: boolean, detail: unknown): Promise<void> {
  const admin = createAdminClient();
  if (ok) await admin.from('program_sms_settings').update({ verified_at: new Date().toISOString() }).eq('program_id', programId);
  await logSmsAccess(programId, actorId, 'test_send', { ok, detail });
}

export async function logSmsAccess(
  programId: string,
  actorId: string | null,
  action: 'set' | 'rotate' | 'disable' | 'reveal_hint' | 'test_send' | 'send_use' | 'decrypt_fail' | 'reauth_fail',
  detail: unknown,
): Promise<void> {
  try {
    await createAdminClient()
      .from('program_sms_access_log')
      .insert({ program_id: programId, actor_id: actorId, action, detail: (detail ?? null) as never });
  } catch {
    /* 로그 실패는 본 작업을 막지 않는다 */
  }
}
