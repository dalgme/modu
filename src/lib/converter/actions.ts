'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { getImpersonation } from '@/lib/auth/impersonation';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { converterAudit, hashConverterToken, newConverterToken } from '@/lib/converter/data';
import { featureEnabled } from '@/lib/platform/features';
import { validateConverterTimes } from '@/lib/converter/schedule-rule';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const PATH = '/nextlab/settings';

/** 운영사 실제 신원 + 'settings' 권한 + 대행 중 아님 (연결 키는 사람에게만 보여 준다) */
async function operator(): Promise<{ id: string; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  if (await getImpersonation()) return { error: '대행(화면 보기) 중에는 변경할 수 없습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'settings');
  if (denied) return { error: denied };
  if (!featureEnabled(ctx.program.features, 'hwp_converter')) return { error: '이 행사는 한글 PDF 자동 변환 기능이 꺼져 있습니다(플랫폼 관리자가 켤 수 있습니다).' };
  return { id: profile.id, programId: ctx.programId };
}

/** 점검 시각·사용 여부 저장 (KST "HH:MM", 하루 최대 8회) */
export async function saveConverterScheduleAction(input: { enabled: boolean; times: string[] }): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const v = validateConverterTimes(input.times ?? []);
  if (!v.ok) return v;
  const admin = createAdminClient();
  const { data: prev } = await admin.from('programs').select('converter_settings').eq('id', op.programId).maybeSingle();
  const next = { enabled: !!input.enabled, times: v.times };
  const { error } = await admin.from('programs').update({ converter_settings: next }).eq('id', op.programId);
  if (error) return { ok: false, error: error.message };
  await converterAudit(op.programId, 'converter.schedule', null, { before: prev?.converter_settings ?? null, after: next }, op.id);
  revalidatePath(PATH);
  return { ok: true, message: next.enabled ? `점검 시각을 저장했습니다: ${v.times.join(' · ')}` : '자동 변환을 껐습니다(지금 변환 요청은 가능).' };
}

/** 변환 PC 등록 — 연결 키를 한 번만 돌려준다(해시만 저장) */
export async function registerConverterAction(name: string): Promise<{ ok: true; token: string; id: string } | { ok: false; error: string }> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const label = (name ?? '').trim().slice(0, 40) || '운영사 PC';
  const token = newConverterToken();
  const admin = createAdminClient();
  const { data, error } = await admin.from('report_converters').insert({ program_id: op.programId, name: label, token_hash: hashConverterToken(token), created_by: op.id }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? '등록하지 못했습니다.' };
  await converterAudit(op.programId, 'converter.register', data.id, { name: label }, op.id);
  revalidatePath(PATH);
  return { ok: true, token, id: data.id };
}

export async function revokeConverterAction(id: string): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const admin = createAdminClient();
  const { data } = await admin.from('report_converters').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('program_id', op.programId).is('revoked_at', null).select('name');
  if (!data || data.length === 0) return { ok: false, error: '이미 해제됐거나 이 행사의 변환 PC 가 아닙니다.' };
  await converterAudit(op.programId, 'converter.revoke', id, { name: data[0]!.name }, op.id);
  revalidatePath(PATH);
  return { ok: true, message: `${data[0]!.name} 연결을 해제했습니다. 그 PC 의 프로그램은 더 이상 접속하지 못합니다.` };
}

/** [지금 변환 요청] — 변환 PC 가 다음에 일정을 물을 때(최대 1시간 안) 바로 실행 */
export async function requestConverterRunAction(): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const { error } = await createAdminClient().from('programs').update({ converter_run_requested_at: new Date().toISOString() }).eq('id', op.programId);
  if (error) return { ok: false, error: error.message };
  await converterAudit(op.programId, 'converter.run_requested', null, {}, op.id);
  revalidatePath(PATH);
  return { ok: true, message: '변환을 요청했습니다. 변환 PC 가 다음 확인(최대 1시간 안) 때 바로 실행합니다. 즉시 하려면 PC 에서 run-now.cmd 를 실행하세요.' };
}

/** 실패 3회로 멈춘 파일을 다시 변환 대상으로 */
export async function retryConversionAction(docId: string): Promise<Result> {
  const op = await operator();
  if ('error' in op) return { ok: false, error: op.error };
  const { data } = await createAdminClient().from('report_conversions').delete().eq('source_doc_id', docId).eq('program_id', op.programId).eq('status', 'failed').select('source_doc_id');
  if (!data || data.length === 0) return { ok: false, error: '다시 시도할 실패 기록이 없습니다.' };
  revalidatePath(PATH);
  return { ok: true, message: '다음 점검 때 다시 변환합니다.' };
}
