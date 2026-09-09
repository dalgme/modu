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

/* ── 설정 조회 (스코프: 행사 공통 = support_type_id null, 그룹 = 값) ────── */

export interface MentorFormSetting {
  formKey: MentorFormKey;
  enabled: boolean;
  method: MentorFormMethod;
  title: string;
  content: string;
  /** 파일 첨부 방식일 때 운영사가 올린 표준양식 파일 */
  templatePath: string | null;
  templateName: string | null;
  /** 이 스코프(공통 또는 그룹)에 직접 저장된 행이 있는지 — 그룹에서 false 면 행사 공통을 따른다 */
  defined: boolean;
}

type SettingRow = {
  form_key: string;
  support_type_id: string | null;
  enabled: boolean;
  method: string;
  title: string;
  content: string;
  template_path: string | null;
  template_name: string | null;
};

function rowToSetting(key: MentorFormKey, row: SettingRow | undefined, fallback?: MentorFormSetting): MentorFormSetting {
  if (!row) {
    if (fallback) return { ...fallback, defined: false };
    return { formKey: key, enabled: false, method: 'web', title: DEFAULT_FORMS[key].title, content: DEFAULT_FORMS[key].content, templatePath: null, templateName: null, defined: false };
  }
  return {
    formKey: key,
    enabled: row.enabled,
    method: (row.method === 'file' ? 'file' : 'web') as MentorFormMethod,
    title: row.title,
    content: row.content,
    templatePath: row.template_path,
    templateName: row.template_name,
    defined: true,
  };
}

/**
 * 한 스코프의 위촉 서식 설정 4종.
 * supportTypeId = null 이면 행사 공통, 값이면 그 사업그룹의 override (없으면 공통 값을 폴백으로 보여준다).
 */
export async function getMentorFormSettings(programId: string, supportTypeId: string | null = null): Promise<MentorFormSetting[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('mentor_form_settings').select('*').eq('program_id', programId);
  const rows = (data ?? []) as SettingRow[];
  const commonByKey = new Map(rows.filter((r) => !r.support_type_id).map((r) => [r.form_key, r]));
  if (!supportTypeId) {
    return FORM_KEYS.map((key) => rowToSetting(key, commonByKey.get(key)));
  }
  const groupByKey = new Map(rows.filter((r) => r.support_type_id === supportTypeId).map((r) => [r.form_key, r]));
  return FORM_KEYS.map((key) => rowToSetting(key, groupByKey.get(key), rowToSetting(key, commonByKey.get(key))));
}

/**
 * 멘토 개인에게 적용되는 유효 설정 — 소속 그룹의 override(그룹명 순 첫 번째) → 행사 공통 → 미사용.
 * 그룹 행이 존재하면 enabled=false 도 명시적 off 로 공통을 덮는다.
 */
async function resolveEffectiveSettings(programId: string): Promise<{
  effectiveFor: (groupIds: string[]) => MentorFormSetting[];
}> {
  const admin = createAdminClient();
  const [{ data: rowsData }, { data: groups }] = await Promise.all([
    admin.from('mentor_form_settings').select('*').eq('program_id', programId),
    admin.from('support_types').select('id, name').eq('program_id', programId),
  ]);
  const rows = (rowsData ?? []) as SettingRow[];
  const groupOrder = new Map((groups ?? []).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((g, i) => [g.id, i]));
  const commonByKey = new Map(rows.filter((r) => !r.support_type_id).map((r) => [r.form_key, r]));
  const groupRows = rows.filter((r) => r.support_type_id);

  const effectiveFor = (groupIds: string[]): MentorFormSetting[] => {
    const mine = new Set(groupIds);
    return FORM_KEYS.map((key) => {
      const candidates = groupRows
        .filter((r) => r.form_key === key && mine.has(r.support_type_id!))
        .sort((a, b) => (groupOrder.get(a.support_type_id!) ?? 99) - (groupOrder.get(b.support_type_id!) ?? 99));
      return rowToSetting(key, candidates[0] ?? commonByKey.get(key));
    });
  };
  return { effectiveFor };
}

/** 멘토들의 소속 그룹 매핑 (이 행사 그룹만) */
async function mentorGroupMap(programId: string, mentorIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (mentorIds.length === 0) return map;
  const admin = createAdminClient();
  const [{ data: groups }, { data: roster }] = await Promise.all([
    admin.from('support_types').select('id').eq('program_id', programId),
    admin.from('support_type_members').select('support_type_id, user_id, is_active').in('user_id', mentorIds),
  ]);
  const groupIds = new Set((groups ?? []).map((g) => g.id));
  for (const r of roster ?? []) {
    if (!r.is_active || !groupIds.has(r.support_type_id)) continue;
    map.set(r.user_id, [...(map.get(r.user_id) ?? []), r.support_type_id]);
  }
  return map;
}

/** 표준양식 파일 다운로드용 서명 URL (10분) */
export async function templateSignedUrl(templatePath: string, templateName: string | null): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage.from('documents').createSignedUrl(templatePath, 600, { download: templateName ?? undefined });
  return data?.signedUrl ?? null;
}

/* ── 멘토 본인 제출 현황 ───────────────────────────────────────────────── */

export interface MentorFormForMentor extends MentorFormSetting {
  submittedAt: string | null;
  submittedMethod: MentorFormMethod | null;
  fileName: string | null;
  /** 파일 첨부 방식: 표준양식 다운로드 URL (운영사가 올린 경우) */
  templateUrl: string | null;
}

/** 멘토 화면용 — 이 멘토에게 유효한(그룹 우선) 사용 중 서식 + 본인 제출 여부 */
export async function getMentorFormsForMentor(programId: string, userId: string): Promise<MentorFormForMentor[]> {
  const [{ effectiveFor }, groupMap] = await Promise.all([
    resolveEffectiveSettings(programId),
    mentorGroupMap(programId, [userId]),
  ]);
  const settings = effectiveFor(groupMap.get(userId) ?? []).filter((s) => s.enabled);
  if (settings.length === 0) return [];
  const { data: subs } = await createAdminClient()
    .from('mentor_form_submissions')
    .select('form_key, method, submitted_at, file_name')
    .eq('program_id', programId)
    .eq('user_id', userId);
  const byKey = new Map((subs ?? []).map((s) => [s.form_key, s]));
  const out: MentorFormForMentor[] = [];
  for (const s of settings) {
    const sub = byKey.get(s.formKey);
    out.push({
      ...s,
      submittedAt: sub?.submitted_at ?? null,
      submittedMethod: sub ? ((sub.method === 'file' ? 'file' : 'web') as MentorFormMethod) : null,
      fileName: sub?.file_name ?? null,
      templateUrl: s.method === 'file' && s.templatePath ? await templateSignedUrl(s.templatePath, s.templateName) : null,
    });
  }
  return out;
}

/** 제출 액션 가드용 — 이 멘토에게 유효한 설정 1건 */
export async function effectiveSettingForMentor(programId: string, userId: string, formKey: MentorFormKey): Promise<MentorFormSetting | null> {
  const [{ effectiveFor }, groupMap] = await Promise.all([
    resolveEffectiveSettings(programId),
    mentorGroupMap(programId, [userId]),
  ]);
  return effectiveFor(groupMap.get(userId) ?? []).find((s) => s.formKey === formKey) ?? null;
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
  /** 그룹별 override 로 방식이 갈리면 'mixed' */
  method: MentorFormMethod | 'mixed';
  title: string;
  submitted: FormSubmissionRow[];
  missing: { userId: string; name: string }[];
}

/**
 * 위촉 서식 집계현황 (운영사) — 서식별 제출/미제출 명단.
 * 대상 = 이 행사의 활성 멘토 중 **유효 설정(소속 그룹 override → 행사 공통)이 사용인 멘토**.
 * revealSensitive 는 members.sensitive 권한자만 true 로 호출할 것.
 */
export async function getMentorFormStatus(programId: string, revealSensitive: boolean): Promise<FormStatus[]> {
  const admin = createAdminClient();
  const [{ effectiveFor }, { data: members }, { data: subs }] = await Promise.all([
    resolveEffectiveSettings(programId),
    admin.from('program_members').select('user_id').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true),
    admin.from('mentor_form_submissions').select('*').eq('program_id', programId).order('submitted_at', { ascending: true }),
  ]);
  const mentorIds = (members ?? []).map((m) => m.user_id);
  const { data: users } = mentorIds.length
    ? await admin.from('users').select('id, name, is_active').in('id', mentorIds).eq('is_active', true).order('name')
    : { data: [] as { id: string; name: string; is_active: boolean }[] };
  const mentors = users ?? [];
  const nameOf = new Map(mentors.map((u) => [u.id, u.name]));
  const groupMap = await mentorGroupMap(programId, mentors.map((m) => m.id));

  // 멘토별 유효 설정 → 서식별 대상 멘토·방식 수집
  const targetsByKey = new Map<MentorFormKey, { userId: string; name: string }[]>();
  const methodsByKey = new Map<MentorFormKey, Set<MentorFormMethod>>();
  const titleByKey = new Map<MentorFormKey, string>();
  for (const m of mentors) {
    for (const s of effectiveFor(groupMap.get(m.id) ?? [])) {
      if (!s.enabled) continue;
      targetsByKey.set(s.formKey, [...(targetsByKey.get(s.formKey) ?? []), { userId: m.id, name: m.name }]);
      (methodsByKey.get(s.formKey) ?? methodsByKey.set(s.formKey, new Set()).get(s.formKey)!).add(s.method);
      if (!titleByKey.has(s.formKey)) titleByKey.set(s.formKey, s.title);
    }
  }
  const activeKeys = FORM_KEYS.filter((k) => targetsByKey.has(k));
  if (activeKeys.length === 0) return [];

  const out: FormStatus[] = [];
  for (const key of activeKeys) {
    const targets = targetsByKey.get(key)!;
    const targetIds = new Set(targets.map((t) => t.userId));
    const methods = methodsByKey.get(key)!;
    const rows = (subs ?? []).filter((r) => r.form_key === key && nameOf.has(r.user_id) && targetIds.has(r.user_id));
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
      formKey: key,
      method: methods.size === 1 ? Array.from(methods)[0]! : 'mixed',
      title: titleByKey.get(key) ?? DEFAULT_FORMS[key].title,
      submitted,
      missing: targets.filter((t) => !submittedIds.has(t.userId)),
    });
  }
  return out;
}

export function answersToJson(a: MentorFormAnswers): Json {
  return a as unknown as Json;
}
