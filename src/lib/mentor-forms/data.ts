import 'server-only';

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_FORMS, FORM_KEYS, type MentorFormAnswers, type MentorFormKey, type MentorFormMethod } from '@/lib/mentor-forms/defs';
import type { Json } from '@/types/database';

/* ── 주민등록번호 봉투암호화 — SMS_KEK 에서 용도 분리 키 파생 (원문은 DB 에 남지 않는다) ── */

function formsKey(): Buffer | null {
  const raw = process.env.SMS_KEK;
  if (!raw) return null;
  const kek = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (kek.length !== 32) return null;
  return createHmac('sha256', kek).update('mentor-forms-v1').digest();
}

export function formsCryptoConfigured(): boolean {
  return formsKey() !== null;
}

export function sealRrn(plain: string, programId: string, userId: string): string | null {
  const key = formsKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${programId}:${userId}`));
  const ct = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

export function openRrn(sealed: string, programId: string, userId: string): string | null {
  const key = formsKey();
  if (!key) return null;
  try {
    const [ivB, tagB, ctB] = sealed.split('.');
    if (!ivB || !tagB || !ctB) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
    decipher.setAAD(Buffer.from(`${programId}:${userId}`));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/* ── 설정 조회 (기본값 병합) ───────────────────────────────────────────── */

export interface MentorFormSetting {
  formKey: MentorFormKey;
  enabled: boolean;
  method: MentorFormMethod;
  title: string;
  content: string;
  /** 저장된 행이 없어 표준 양식 기본값 그대로인 상태 */
  isDefault: boolean;
}

/** 행사별 위촉 서식 설정 4종 — 저장된 행이 없으면 표준 양식 기본값(미사용) */
export async function getMentorFormSettings(programId: string): Promise<MentorFormSetting[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('mentor_form_settings').select('*').eq('program_id', programId);
  const byKey = new Map((data ?? []).map((r) => [r.form_key, r]));
  return FORM_KEYS.map((key) => {
    const row = byKey.get(key);
    if (!row) return { formKey: key, enabled: false, method: 'web' as const, title: DEFAULT_FORMS[key].title, content: DEFAULT_FORMS[key].content, isDefault: true };
    return { formKey: key, enabled: row.enabled, method: (row.method === 'file' ? 'file' : 'web') as MentorFormMethod, title: row.title, content: row.content, isDefault: false };
  });
}

/* ── 멘토 본인 제출 현황 ───────────────────────────────────────────────── */

export interface MentorFormForMentor extends MentorFormSetting {
  submittedAt: string | null;
  submittedMethod: MentorFormMethod | null;
  fileName: string | null;
}

/** 멘토 화면용 — 사용 중인 서식 + 본인 제출 여부 */
export async function getMentorFormsForMentor(programId: string, userId: string): Promise<MentorFormForMentor[]> {
  const settings = (await getMentorFormSettings(programId)).filter((s) => s.enabled);
  if (settings.length === 0) return [];
  const { data: subs } = await createAdminClient()
    .from('mentor_form_submissions')
    .select('form_key, method, submitted_at, file_name')
    .eq('program_id', programId)
    .eq('user_id', userId);
  const byKey = new Map((subs ?? []).map((s) => [s.form_key, s]));
  return settings.map((s) => {
    const sub = byKey.get(s.formKey);
    return {
      ...s,
      submittedAt: sub?.submitted_at ?? null,
      submittedMethod: sub ? ((sub.method === 'file' ? 'file' : 'web') as MentorFormMethod) : null,
      fileName: sub?.file_name ?? null,
    };
  });
}

/* ── 운영사 집계현황 ───────────────────────────────────────────────────── */

export interface FormSubmissionRow {
  id: string;
  userId: string;
  mentorName: string;
  method: MentorFormMethod;
  submittedAt: string;
  signedName: string | null;
  answers: MentorFormAnswers;
  contentSnapshot: string | null;
  fileName: string | null;
  fileUrl: string | null;
  /** 위촉 동의서 주민등록번호 — 민감정보 권한이 있을 때만 원문, 아니면 마스킹/미보관 표기 */
  rrn: string | null;
}

export interface FormStatus {
  formKey: MentorFormKey;
  method: MentorFormMethod;
  title: string;
  submitted: FormSubmissionRow[];
  missing: { userId: string; name: string }[];
}

/**
 * 위촉 서식 집계현황 (운영사) — 사용 중 서식별 제출/미제출 명단.
 * 대상 = 이 행사의 활성 멘토 전원. revealSensitive 는 members.sensitive 권한자만 true 로 호출할 것.
 */
export async function getMentorFormStatus(programId: string, revealSensitive: boolean): Promise<FormStatus[]> {
  const admin = createAdminClient();
  const settings = (await getMentorFormSettings(programId)).filter((s) => s.enabled);
  if (settings.length === 0) return [];
  const [{ data: members }, { data: subs }] = await Promise.all([
    admin.from('program_members').select('user_id').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true),
    admin.from('mentor_form_submissions').select('*').eq('program_id', programId).order('submitted_at', { ascending: true }),
  ]);
  const mentorIds = (members ?? []).map((m) => m.user_id);
  const { data: users } = mentorIds.length
    ? await admin.from('users').select('id, name, is_active').in('id', mentorIds).eq('is_active', true).order('name')
    : { data: [] as { id: string; name: string; is_active: boolean }[] };
  const mentors = users ?? [];
  const nameOf = new Map(mentors.map((u) => [u.id, u.name]));

  const out: FormStatus[] = [];
  for (const s of settings) {
    const rows = (subs ?? []).filter((r) => r.form_key === s.formKey && nameOf.has(r.user_id));
    const submitted: FormSubmissionRow[] = [];
    for (const r of rows) {
      let fileUrl: string | null = null;
      if (r.file_path) {
        const { data: signed } = await admin.storage.from('documents').createSignedUrl(r.file_path, 600, { download: r.file_name ?? undefined });
        fileUrl = signed?.signedUrl ?? null;
      }
      let rrn: string | null = null;
      if (r.rrn_sealed) {
        rrn = revealSensitive ? openRrn(r.rrn_sealed, programId, r.user_id) ?? '(복호화 실패 — SMS_KEK 확인)' : '●●●●●●-●●●●●●●';
      }
      submitted.push({
        id: r.id,
        userId: r.user_id,
        mentorName: nameOf.get(r.user_id) ?? '-',
        method: (r.method === 'file' ? 'file' : 'web') as MentorFormMethod,
        submittedAt: r.submitted_at,
        signedName: r.signed_name,
        answers: (r.answers ?? {}) as MentorFormAnswers,
        contentSnapshot: r.content_snapshot,
        fileName: r.file_name,
        fileUrl,
        rrn,
      });
    }
    const submittedIds = new Set(submitted.map((x) => x.userId));
    out.push({
      formKey: s.formKey,
      method: s.method,
      title: s.title,
      submitted,
      missing: mentors.filter((m) => !submittedIds.has(m.id)).map((m) => ({ userId: m.id, name: m.name })),
    });
  }
  return out;
}

export function answersToJson(a: MentorFormAnswers): Json {
  return a as unknown as Json;
}
