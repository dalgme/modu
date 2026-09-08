'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { reauthenticate } from '@/lib/sms/reauth';
import { disableProgramSms, logSmsAccess, markSmsVerified, resolveSmsCredentials, storeProgramSmsCredentials } from '@/lib/sms/secrets';
import { sendSolapiSms } from '@/lib/notifications/solapi';
import { normalizePhone } from '@/lib/auth/identifier';

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function guard(): Promise<{ id: string; email: string | null; phone: string | null; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 설정할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'sms');
  if (denied) return { error: denied };
  return { id: profile.id, email: profile.email, phone: profile.phone, programId: ctx.programId };
}

/** 문자 API 등록/교체 — 비밀번호 재인증 필수. 입력값은 저장 즉시 암호화되고 반환값에 평문이 없다. */
export async function saveSmsCredentialsAction(formData: FormData): Promise<Result> {
  const g = await guard();
  if ('error' in g) return { ok: false, error: g.error };
  const password = String(formData.get('password') ?? '');
  const re = await reauthenticate({ id: g.id, email: g.email }, password);
  if (!re.ok) {
    await logSmsAccess(g.programId, g.id, 'reauth_fail', { action: 'save' });
    return { ok: false, error: re.error };
  }
  const r = await storeProgramSmsCredentials({
    programId: g.programId,
    apiKey: String(formData.get('apiKey') ?? ''),
    apiSecret: String(formData.get('apiSecret') ?? ''),
    senderNumber: String(formData.get('senderNumber') ?? ''),
    actorId: g.id,
  });
  if (!r.ok) return r;
  revalidatePath('/nextlab/settings/sms-api');
  return { ok: true, message: `저장되었습니다. (API 키 ${r.apiKeyHint}…, 발신번호 …${r.senderHint})` };
}

/** 비활성화(플랫폼 기본으로 폴백) — 재인증 필수 */
export async function disableSmsCredentialsAction(formData: FormData): Promise<Result> {
  const g = await guard();
  if ('error' in g) return { ok: false, error: g.error };
  const re = await reauthenticate({ id: g.id, email: g.email }, String(formData.get('password') ?? ''));
  if (!re.ok) {
    await logSmsAccess(g.programId, g.id, 'reauth_fail', { action: 'disable' });
    return { ok: false, error: re.error };
  }
  await disableProgramSms(g.programId, g.id);
  revalidatePath('/nextlab/settings/sms-api');
  return { ok: true, message: '행사 문자 API 를 비활성화했습니다.' };
}

/** 테스트 발송 — 실행자 본인 휴대폰으로만. 성공 시 verified_at 기록. */
export async function testSmsAction(): Promise<Result> {
  const g = await guard();
  if ('error' in g) return { ok: false, error: g.error };
  const phone = g.phone ? normalizePhone(g.phone) : null;
  if (!phone) return { ok: false, error: '내 계정에 휴대폰 번호가 없어 테스트 발송을 할 수 없습니다.' };
  const creds = await resolveSmsCredentials(g.programId, 'test');
  if (!creds || creds.source !== 'program') return { ok: false, error: '행사 문자 API 가 설정되지 않았거나 복호화에 실패했습니다.' };
  const r = await sendSolapiSms(phone, '[문자 API 연결 테스트] 이 문자가 도착하면 행사 문자 설정이 정상입니다.', { creds });
  await markSmsVerified(g.programId, g.id, r.ok, r.ok ? { providerId: r.providerId } : { error: r.error });
  revalidatePath('/nextlab/settings/sms-api');
  return r.ok ? { ok: true, message: '테스트 문자를 발송했습니다. 휴대폰을 확인하세요.' } : { ok: false, error: `발송 실패: ${r.error}` };
}
