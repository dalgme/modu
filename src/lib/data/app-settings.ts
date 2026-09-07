import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/** 운영 설정 키 */
const MENTOR_REMINDER_TEMPLATE_KEY = 'mentor_weekly_reminder_template';
const MENTOR_REMINDER_ENABLED_KEY = 'mentor_weekly_reminder_enabled';
const MENTEE_GUIDE_SMS_TEMPLATE_KEY = 'mentee_guide_sms_template';

/**
 * 멘티 안내 문자 기본 템플릿.
 * 치환: {name}=대표자, {company}=업체명, {login_id}=로그인 아이디, {password}=비밀번호 안내, {url}=플랫폼 주소
 */
export const DEFAULT_MENTEE_GUIDE_SMS_TEMPLATE = `[재기지원사업] {name}님, {company} 재기지원사업 안내드립니다.

▶ 지원신청 서류를 플랫폼에 올려주세요
- 공사업체 사업자등록증
- 견적서
- 비교견적서

▶ 플랫폼 사용 안내
- 접속: {url}
- 로그인 아이디: {login_id}
- 비밀번호: {password}

로그인 후 안내에 따라 서류를 올려주세요. 문의는 담당 멘토·넥스트랩으로 연락 주세요.`;

/** 멘티 안내 문자 템플릿 조회(없으면 기본값) */
export async function getMenteeGuideSmsTemplate(): Promise<string> {
  const v = await getSetting(MENTEE_GUIDE_SMS_TEMPLATE_KEY);
  return v && v.trim() ? v : DEFAULT_MENTEE_GUIDE_SMS_TEMPLATE;
}

/** 멘티 안내 문자 템플릿 저장 */
export async function saveMenteeGuideSmsTemplate(
  template: string,
  updatedBy?: string | null,
): Promise<void> {
  await setSetting(MENTEE_GUIDE_SMS_TEMPLATE_KEY, template, updatedBy);
}

/** 멘티 안내 문자 치환 */
export function renderMenteeGuideSms(
  template: string,
  vars: { name: string; company: string; loginId: string; password: string; url: string },
): string {
  return template
    .split('{name}')
    .join(vars.name)
    .split('{company}')
    .join(vars.company)
    .split('{login_id}')
    .join(vars.loginId)
    .split('{password}')
    .join(vars.password)
    .split('{url}')
    .join(vars.url);
}

/** 주간 멘토 안내문 기본 템플릿 ({mentor}=멘토명, {companies}=미완료 기업명 목록) */
export const DEFAULT_MENTOR_REMINDER_TEMPLATE =
  '[재기지원사업] {mentor}멘토님, 이번주에도 [{companies}] 기업에 대한 재기지원 컨설팅/지원신청서 작성 진행 잘 부탁드리겠습니다';

export interface MentorReminderConfig {
  template: string;
  enabled: boolean;
}

/** 단일 설정값 조회 (없으면 null) */
export async function getSetting(key: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

/** 설정값 저장 (upsert) */
export async function setSetting(
  key: string,
  value: string,
  updatedBy?: string | null,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from('app_settings').upsert({
    key,
    value,
    updated_by: updatedBy ?? null,
    updated_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// 기능 노출 플래그 (넥스트랩 관리자 → 기능 노출 설정)
// 본 컨설팅·지원 단계에서는 기본 비노출(false). 선정/변경·지급 단계에서 사용할 때만 켠다.
// ---------------------------------------------------------------------------
const FEATURE_KEYS = {
  formsSelection: 'feature_forms_selection', // 붙임1~6 (선정단계 서식)
  formsChangePayment: 'feature_forms_change_payment', // 붙임8~12 (변경·포기·지급 서식)
  supplementRequest: 'feature_supplement_request', // 멘티 보완요청
} as const;

export interface FeatureFlags {
  /** 선정단계 붙임서식(붙임1~6) 노출 */
  formsSelection: boolean;
  /** 변경·포기·지급 붙임서식(붙임8~12) 노출 */
  formsChangePayment: boolean;
  /** 멘티 보완요청 노출 */
  supplementRequest: boolean;
}

/** 기능 노출 플래그 조회 (기본 전부 false = 비노출) */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', Object.values(FEATURE_KEYS));
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const on = (k: string) => map.get(k) === 'true';
  return {
    formsSelection: on(FEATURE_KEYS.formsSelection),
    formsChangePayment: on(FEATURE_KEYS.formsChangePayment),
    supplementRequest: on(FEATURE_KEYS.supplementRequest),
  };
}

/** 기능 노출 플래그 저장 */
export async function saveFeatureFlags(
  flags: FeatureFlags,
  updatedBy?: string | null,
): Promise<void> {
  await Promise.all([
    setSetting(FEATURE_KEYS.formsSelection, flags.formsSelection ? 'true' : 'false', updatedBy),
    setSetting(
      FEATURE_KEYS.formsChangePayment,
      flags.formsChangePayment ? 'true' : 'false',
      updatedBy,
    ),
    setSetting(
      FEATURE_KEYS.supplementRequest,
      flags.supplementRequest ? 'true' : 'false',
      updatedBy,
    ),
  ]);
}

/** 주간 멘토 안내문 설정(문구·활성 여부) 조회 */
export async function getMentorReminderConfig(): Promise<MentorReminderConfig> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', [MENTOR_REMINDER_TEMPLATE_KEY, MENTOR_REMINDER_ENABLED_KEY]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const template = map.get(MENTOR_REMINDER_TEMPLATE_KEY);
  return {
    template: template && template.trim() ? template : DEFAULT_MENTOR_REMINDER_TEMPLATE,
    enabled: (map.get(MENTOR_REMINDER_ENABLED_KEY) ?? 'true') !== 'false',
  };
}

/** 주간 멘토 안내문 설정 저장 */
export async function saveMentorReminderConfig(
  cfg: MentorReminderConfig,
  updatedBy?: string | null,
): Promise<void> {
  await Promise.all([
    setSetting(MENTOR_REMINDER_TEMPLATE_KEY, cfg.template, updatedBy),
    setSetting(MENTOR_REMINDER_ENABLED_KEY, cfg.enabled ? 'true' : 'false', updatedBy),
  ]);
}

/** 템플릿 치환: {mentor}=멘토명, {companies}=기업명 목록(쉼표 구분) */
export function renderMentorReminder(
  template: string,
  mentorName: string,
  companies: string[],
): string {
  return template
    .split('{mentor}')
    .join(mentorName)
    .split('{companies}')
    .join(companies.join(', '));
}
