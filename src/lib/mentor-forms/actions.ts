'use server';

import { revalidatePath } from 'next/cache';

import { requireNextlab, mentorOrNull, MENTOR_ONLY_ERROR } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { moveFile } from '@/lib/storage/files';
import { fmt } from '@/lib/programs/branding';
import {
  APPOINTMENT_FIELDS,
  DEFAULT_FORMS,
  FORM_KEYS,
  FORM_LABELS,
  PRECHECK_QUESTIONS,
  PRIVACY_QUESTIONS,
  type MentorFormAnswers,
  type MentorFormKey,
} from '@/lib/mentor-forms/defs';
import { answersToJson, formsCryptoConfigured, getMentorFormSettings, sealRrn } from '@/lib/mentor-forms/data';

export type MentorFormActionState = { ok: true; message: string } | { ok: false; error: string } | undefined;

function isFormKey(v: string): v is MentorFormKey {
  return (FORM_KEYS as readonly string[]).includes(v);
}

function revalidate() {
  revalidatePath('/nextlab/settings');
  revalidatePath('/nextlab/mentors');
  revalidatePath('/mentor/forms');
  revalidatePath('/mentor/dashboard');
}

/* ── 운영사: 서식 설정 (사용 여부 · 방식 · 제목 · 본문) ─────────────────── */

export async function saveMentorFormSettingAction(
  _prev: MentorFormActionState,
  formData: FormData,
): Promise<MentorFormActionState> {
  const actor = await requireNextlab();
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  {
    const denied = denyUnless(ctx, 'settings');
    if (denied) return { ok: false, error: denied };
  }
  const formKey = String(formData.get('formKey') ?? '');
  if (!isFormKey(formKey)) return { ok: false, error: '서식을 확인할 수 없습니다.' };
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  const method = String(formData.get('method') ?? 'web') === 'file' ? 'file' : 'web';
  const title = String(formData.get('title') ?? '').trim().slice(0, 120) || DEFAULT_FORMS[formKey].title;
  const content = String(formData.get('content') ?? '').trim().slice(0, 20000) || DEFAULT_FORMS[formKey].content;

  const admin = createAdminClient();
  const { error } = await admin
    .from('mentor_form_settings')
    .upsert(
      { program_id: ctx.programId, form_key: formKey, enabled, method, title, content, updated_by: actor.id, updated_at: new Date().toISOString() },
      { onConflict: 'program_id,form_key' },
    );
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: ctx.programId,
    action: 'mentor_form.setting',
    entity_type: 'programs',
    entity_id: ctx.programId,
    metadata: { form_key: formKey, enabled, method },
  });
  revalidate();
  return { ok: true, message: `'${FORM_LABELS[formKey]}' 설정을 저장했습니다.` };
}

/* ── 멘토: 제출 공통 가드 ──────────────────────────────────────────────── */

async function mentorFormGuard(formKey: string): Promise<
  | { ok: true; mentorId: string; programId: string; key: MentorFormKey; setting: { method: string; title: string; content: string }; branded: (t: string) => string }
  | { ok: false; error: string }
> {
  const profile = await mentorOrNull();
  if (!profile) return { ok: false, error: MENTOR_ONLY_ERROR };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  if (!isFormKey(formKey)) return { ok: false, error: '서식을 확인할 수 없습니다.' };
  const setting = (await getMentorFormSettings(ctx.programId)).find((s) => s.formKey === formKey);
  if (!setting?.enabled) return { ok: false, error: '이 행사에서 사용하지 않는 서식입니다.' };
  return {
    ok: true,
    mentorId: profile.id,
    programId: ctx.programId,
    key: formKey,
    setting,
    branded: (t: string) => fmt(t, ctx.branding),
  };
}

async function insertSubmission(row: {
  programId: string;
  formKey: MentorFormKey;
  mentorId: string;
  method: 'web' | 'file';
  contentSnapshot?: string | null;
  answers?: MentorFormAnswers;
  rrnSealed?: string | null;
  signedName?: string | null;
  filePath?: string | null;
  fileName?: string | null;
}): Promise<MentorFormActionState> {
  const admin = createAdminClient();
  const { error } = await admin.from('mentor_form_submissions').insert({
    program_id: row.programId,
    form_key: row.formKey,
    user_id: row.mentorId,
    method: row.method,
    content_snapshot: row.contentSnapshot ?? null,
    answers: answersToJson(row.answers ?? {}),
    rrn_sealed: row.rrnSealed ?? null,
    signed_name: row.signedName ?? null,
    file_path: row.filePath ?? null,
    file_name: row.fileName ?? null,
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: '이미 제출한 서식입니다. 재제출이 필요하면 운영사에 문의하세요.' };
    return { ok: false, error: error.message };
  }
  await admin.from('audit_logs').insert({
    actor_id: row.mentorId,
    program_id: row.programId,
    action: 'mentor_form.submit',
    entity_type: 'users',
    entity_id: row.mentorId,
    metadata: { form_key: row.formKey, method: row.method },
  });
  revalidate();
  return { ok: true, message: `'${FORM_LABELS[row.formKey]}'을(를) 제출했습니다.` };
}

/* ── 멘토: 웹 작성 제출 ────────────────────────────────────────────────── */

export async function submitMentorFormWebAction(
  _prev: MentorFormActionState,
  formData: FormData,
): Promise<MentorFormActionState> {
  const g = await mentorFormGuard(String(formData.get('formKey') ?? ''));
  if (!g.ok) return g;
  if (g.setting.method !== 'web') return { ok: false, error: '이 서식은 파일 첨부 방식입니다. 파일로 제출하세요.' };
  const signedName = String(formData.get('signedName') ?? '').trim().slice(0, 40);
  if (!signedName) return { ok: false, error: '서명(성명)을 입력하세요.' };

  const answers: MentorFormAnswers = {};
  let rrnSealed: string | null = null;

  if (g.key === 'appointment') {
    const fields: Record<string, string> = {};
    for (const f of APPOINTMENT_FIELDS) {
      const v = String(formData.get(`field_${f.key}`) ?? '').trim().slice(0, 120);
      if (!v) return { ok: false, error: `'${f.label}'을(를) 입력하세요.` };
      fields[f.key] = v;
    }
    answers.fields = fields;
    if (String(formData.get('agreed') ?? '') !== 'true') return { ok: false, error: '동의 확인에 체크하세요.' };
    answers.agreed = true;
    const rrn = String(formData.get('rrn') ?? '').replace(/\D/g, '');
    if (rrn.length !== 13) return { ok: false, error: '주민등록번호 13자리를 입력하세요.' };
    if (!formsCryptoConfigured()) return { ok: false, error: '암호화 키가 설정되지 않아 주민등록번호를 안전하게 저장할 수 없습니다. 운영사에 문의하세요.' };
    rrnSealed = sealRrn(rrn, g.programId, g.mentorId);
  } else if (g.key === 'privacy') {
    const consents: Record<string, 'yes' | 'no'> = {};
    for (const q of PRIVACY_QUESTIONS) {
      const v = String(formData.get(`consent_${q.key}`) ?? '');
      if (v !== 'yes' && v !== 'no') return { ok: false, error: `'${q.label}' 항목의 동의 여부를 선택하세요.` };
      consents[q.key] = v;
    }
    answers.consents = consents;
  } else if (g.key === 'pledge') {
    if (String(formData.get('agreed') ?? '') !== 'true') return { ok: false, error: '서약 확인에 체크하세요.' };
    answers.agreed = true;
  } else {
    const checks: Record<string, { answer: 'none' | 'exists'; detail?: string }> = {};
    for (const q of PRECHECK_QUESTIONS) {
      const v = String(formData.get(`check_${q.key}`) ?? '');
      if (v !== 'none' && v !== 'exists') return { ok: false, error: `'${q.label}' 문항에 답하세요.` };
      const detail = String(formData.get(`detail_${q.key}`) ?? '').trim().slice(0, 500);
      if (v === 'exists' && !detail) return { ok: false, error: `'해당 있음' 문항의 세부 내용을 기재하세요.` };
      checks[q.key] = { answer: v, ...(detail ? { detail } : {}) };
    }
    answers.checks = checks;
  }

  return insertSubmission({
    programId: g.programId,
    formKey: g.key,
    mentorId: g.mentorId,
    method: 'web',
    contentSnapshot: g.branded(g.setting.content),
    answers,
    rrnSealed,
    signedName,
  });
}

/* ── 멘토: 파일 첨부 제출 ──────────────────────────────────────────────── */

export async function submitMentorFormFileAction(input: {
  formKey: string;
  stagingPath: string;
  fileName: string;
}): Promise<MentorFormActionState> {
  const g = await mentorFormGuard(input.formKey);
  if (!g.ok) return g;
  if (g.setting.method !== 'file') return { ok: false, error: '이 서식은 웹 작성 방식입니다. 웹에서 작성하세요.' };
  if (!input.stagingPath.startsWith('_staging/') || input.stagingPath.includes('..')) {
    return { ok: false, error: '잘못된 업로드 경로입니다.' };
  }
  const basename = input.stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const dest = `mentor-forms/${g.programId}/${g.mentorId}/${basename}`;
  try {
    await moveFile('documents', input.stagingPath, dest);
  } catch {
    return { ok: false, error: '파일 이동에 실패했습니다. 다시 업로드해 주세요.' };
  }
  return insertSubmission({
    programId: g.programId,
    formKey: g.key,
    mentorId: g.mentorId,
    method: 'file',
    filePath: dest,
    fileName: input.fileName.slice(0, 200) || basename,
  });
}

/* ── 운영사: 제출물 반려(삭제 → 재제출 가능) ───────────────────────────── */

export async function rejectMentorFormSubmissionAction(
  _prev: MentorFormActionState,
  formData: FormData,
): Promise<MentorFormActionState> {
  const actor = await requireNextlab();
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  {
    const denied = denyUnless(ctx, 'mentors.docs');
    if (denied) return { ok: false, error: denied };
  }
  const submissionId = String(formData.get('submissionId') ?? '');
  if (!submissionId) return { ok: false, error: '대상을 확인할 수 없습니다.' };
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from('mentor_form_submissions')
    .select('id, program_id, form_key, user_id, file_path')
    .eq('id', submissionId)
    .maybeSingle();
  if (!sub || sub.program_id !== ctx.programId) return { ok: false, error: '이 행사의 제출물이 아닙니다.' };
  if (sub.file_path) await admin.storage.from('documents').remove([sub.file_path]);
  const { error } = await admin.from('mentor_form_submissions').delete().eq('id', submissionId);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: ctx.programId,
    action: 'mentor_form.reject',
    entity_type: 'users',
    entity_id: sub.user_id,
    metadata: { form_key: sub.form_key },
  });
  revalidate();
  return { ok: true, message: '제출물을 반려(삭제)했습니다. 멘토가 다시 제출할 수 있습니다.' };
}
