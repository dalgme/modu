import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { CaseStatus } from '@/types/case-status';
import { sendSms } from '@/lib/notifications/provider';
import { menteeLabel } from '@/lib/utils/labels';

/**
 * 멘토 리마인더(진행 독려) 문자 — P29: 행사·그룹별 설정.
 * 설정 행 = 행사 공통(support_type_id null) 또는 그룹 override. 그룹 판정은 "그룹 행 → 행사 공통 → 없음(미발송)".
 * 대상 = 그 범위의 활성 배정 중 회차가 아직 진행 중인 케이스를 가진 멘토. 멘토 1명에게 범위(설정)당 1통.
 * cron 은 매시 :30 에 돌며 KST 기준 오늘이 설정 요일이고 설정 시각이 지났으며 아직 오늘 안 보낸 행만 발송한다.
 */

/** 회차가 아직 진행 중인(등록 가능한) 케이스 상태 — 리마인더 대상 */
export const PENDING_APPLY_STATUSES: CaseStatus[] = ['mentor_assigned', 'in_progress', 'revision_requested'];

export const DEFAULT_MENTOR_REMINDER_TEMPLATE =
  '[{program}] {mentor}멘토님, 이번주에도 [{companies}] 멘티에 대한 컨설팅 회차 등록·보고서 작성 진행 잘 부탁드리겠습니다';

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface ReminderSetting {
  id: string;
  programId: string;
  /** null = 행사 공통 */
  supportTypeId: string | null;
  enabled: boolean;
  weekday: number;
  sendHour: number;
  sendMinute: number;
  template: string;
  lastSentOn: string | null;
  lastResult: { eligible: number; sent: number; failed: number; at: string } | null;
}

export interface EligibleMentor {
  mentorId: string;
  name: string;
  phone: string | null;
  /** 회차가 진행 중인 담당 멘티 표기(이름/닉네임) */
  companies: string[];
}

function toSetting(r: {
  id: string; program_id: string; support_type_id: string | null; enabled: boolean; weekday: number; send_hour: number; send_minute: number; template: string; last_sent_on: string | null; last_result: unknown;
}): ReminderSetting {
  return {
    id: r.id,
    programId: r.program_id,
    supportTypeId: r.support_type_id,
    enabled: r.enabled,
    weekday: r.weekday,
    sendHour: r.send_hour,
    sendMinute: r.send_minute,
    template: r.template,
    lastSentOn: r.last_sent_on,
    lastResult: (r.last_result as ReminderSetting['lastResult']) ?? null,
  };
}

/** 행사의 리마인더 설정 행 전부 (공통 + 그룹 override) */
export async function listReminderSettings(programId: string): Promise<ReminderSetting[]> {
  const { data } = await createAdminClient().from('mentor_reminder_settings').select('*').eq('program_id', programId);
  return (data ?? []).map(toSetting);
}

/** 그룹에 실제 적용되는 설정 — 그룹 행 → 행사 공통 → null */
export function effectiveSettingForGroup(settings: ReminderSetting[], supportTypeId: string): ReminderSetting | null {
  return settings.find((s) => s.supportTypeId === supportTypeId) ?? settings.find((s) => s.supportTypeId === null) ?? null;
}

/** 템플릿 치환: {program} {group} {mentor} {companies} */
export function renderMentorReminder(template: string, vars: { program: string; group: string; mentor: string; companies: string[] }): string {
  return template
    .split('{program}').join(vars.program)
    .split('{group}').join(vars.group)
    .split('{mentor}').join(vars.mentor)
    .split('{companies}').join(vars.companies.join(', '));
}

/**
 * 설정 한 행이 커버하는 그룹 목록.
 * 그룹 행이면 그 그룹만, 행사 공통 행이면 "그룹 override 행이 없는" 활성 그룹 전부.
 */
async function groupsCoveredBy(setting: ReminderSetting, settings: ReminderSetting[]): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  // 종료 그룹도 포함 — 회차가 남은 멘티가 있으면(PENDING_APPLY_STATUSES) 독려가 계속 가야 한다 (P30)
  const { data: groups } = await admin.from('support_types').select('id, name').eq('program_id', setting.programId);
  const all = groups ?? [];
  if (setting.supportTypeId) return all.filter((g) => g.id === setting.supportTypeId);
  const overridden = new Set(settings.filter((s) => s.supportTypeId).map((s) => s.supportTypeId));
  return all.filter((g) => !overridden.has(g.id));
}

/** 범위(그룹 id 집합) 안에서 리마인더 대상 멘토 목록 */
export async function listEligibleMentors(programId: string, groupIds: string[]): Promise<EligibleMentor[]> {
  if (groupIds.length === 0) return [];
  const admin = createAdminClient();
  const { data: cases } = await admin
    .from('cases')
    .select('id, owner_name, business_name, status, support_type_id')
    .eq('program_id', programId)
    .in('support_type_id', groupIds)
    .in('status', PENDING_APPLY_STATUSES);
  if (!cases || cases.length === 0) return [];
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const { data: assigns } = await admin.from('mentor_assignments').select('mentor_id, case_id').eq('is_active', true).in('case_id', cases.map((c) => c.id));
  const byMentor = new Map<string, string[]>();
  for (const a of assigns ?? []) {
    const c = caseById.get(a.case_id);
    if (!c) continue;
    (byMentor.get(a.mentor_id) ?? byMentor.set(a.mentor_id, []).get(a.mentor_id)!).push(menteeLabel(c.owner_name, c.business_name));
  }
  if (byMentor.size === 0) return [];
  const { data: mentors } = await admin.from('users').select('id, name, phone, is_active').in('id', Array.from(byMentor.keys())).order('name');
  return (mentors ?? [])
    .filter((m) => m.is_active)
    .map((m) => ({ mentorId: m.id, name: m.name, phone: m.phone, companies: byMentor.get(m.id) ?? [] }))
    .filter((m) => m.companies.length > 0);
}

/** 화면용: 설정 행별 발송 대상 미리보기 (행사 공통은 override 없는 그룹 전부 합산) */
export async function previewEligibleForSetting(setting: ReminderSetting, settings: ReminderSetting[]): Promise<{ groups: { id: string; name: string }[]; mentors: EligibleMentor[] }> {
  const groups = await groupsCoveredBy(setting, settings);
  const mentors = await listEligibleMentors(setting.programId, groups.map((g) => g.id));
  return { groups, mentors };
}

export interface ReminderSendResult {
  eligible: number;
  sent: number;
  failed: number;
  /** 문구 off·대상 없음 등으로 건너뜀 */
  skipped: boolean;
  reason?: 'disabled' | 'no_targets' | 'not_found';
}

/** 설정 행 하나를 실제 발송한다 (cron·[지금 발송] 공용). force = 꺼져 있어도 보냄(수동 트리거는 켜진 것만 허용하므로 cron 만 false). */
export async function sendReminderForSetting(setting: ReminderSetting, settings: ReminderSetting[], actorId: string | null): Promise<ReminderSendResult> {
  if (!setting.enabled) return { eligible: 0, sent: 0, failed: 0, skipped: true, reason: 'disabled' };
  const admin = createAdminClient();
  const [{ data: program }, groups] = await Promise.all([
    admin.from('programs').select('name').eq('id', setting.programId).maybeSingle(),
    groupsCoveredBy(setting, settings),
  ]);
  const programName = program?.name ?? '';
  // 문구에 {group} 이 있으면 그룹마다 한 통, 없으면 멘토별로 멘티를 합쳐 한 통 (A·B 두 그룹을 맡은 멘토가 같은 날 두 통 받지 않게, P30)
  const perGroup = setting.template.includes('{group}');
  let eligible = 0;
  let sent = 0;
  let failed = 0;
  const sendOne = async (m: EligibleMentor, groupName: string) => {
    eligible += 1;
    const digits = (m.phone ?? '').replace(/\D/g, '');
    if (digits.length < 10) {
      failed += 1;
      return;
    }
    const text = renderMentorReminder(setting.template, { program: programName, group: groupName, mentor: m.name, companies: m.companies });
    try {
      const r = await sendSms(m.phone as string, text, setting.programId);
      if (r.ok) sent += 1;
      else failed += 1;
    } catch (err) {
      console.error('mentor reminder send failed:', err);
      failed += 1;
    }
  };
  if (perGroup) {
    for (const g of groups) {
      const mentors = await listEligibleMentors(setting.programId, [g.id]);
      for (const m of mentors) await sendOne(m, g.name);
    }
  } else {
    const mentors = await listEligibleMentors(setting.programId, groups.map((g) => g.id));
    for (const m of mentors) await sendOne(m, groups.map((g) => g.name).join('·'));
  }
  if (eligible === 0) return { eligible: 0, sent: 0, failed: 0, skipped: true, reason: 'no_targets' };

  const now = new Date();
  const kstToday = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const result = { eligible, sent, failed, at: now.toISOString() };
  // 전원 실패(잔액 부족·키 만료 등)면 오늘 발송한 것으로 치지 않아 다음 시간대 점검에서 재시도된다
  const { error: upErr } = await admin.from('mentor_reminder_settings').update({ last_sent_on: sent > 0 ? kstToday : setting.lastSentOn, last_result: result, updated_at: now.toISOString() }).eq('id', setting.id);
  if (upErr) console.error('mentor reminder last_result update failed:', upErr.message);
  const { error: auditErr } = await admin.from('audit_logs').insert({
    actor_id: actorId,
    action: 'sms.mentor_weekly_reminder',
    entity_type: 'mentor_reminder_settings',
    entity_id: setting.id,
    program_id: setting.programId,
    metadata: { eligible, sent, failed, support_type_id: setting.supportTypeId, groups: groups.map((g) => g.name), manual: !!actorId },
  });
  if (auditErr) console.error('mentor reminder audit insert failed:', auditErr.message);
  return { eligible, sent, failed, skipped: false };
}

/**
 * Cron: 지금(KST) 기준 발송 시각이 된 설정 행을 모두 발송한다.
 * 조건: enabled · 오늘 요일 = weekday · 현재 시각 ≥ 설정 시각 · last_sent_on ≠ 오늘. (매시 :30 실행이므로 최대 1시간 지연)
 */
export async function runDueMentorReminders(now = new Date()): Promise<{ checked: number; fired: { settingId: string; result: ReminderSendResult }[] }> {
  const admin = createAdminClient();
  const kst = new Date(now.getTime() + 9 * 3600000);
  const today = kst.toISOString().slice(0, 10);
  const weekday = kst.getUTCDay();
  const minutesNow = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const { data } = await admin.from('mentor_reminder_settings').select('*').eq('enabled', true).eq('weekday', weekday);
  const rows = (data ?? []).map(toSetting);
  const due = rows.filter((s) => s.lastSentOn !== today && s.sendHour * 60 + s.sendMinute <= minutesNow);
  const fired: { settingId: string; result: ReminderSendResult }[] = [];
  const byProgram = new Map<string, ReminderSetting[]>();
  for (const s of due) {
    if (!byProgram.has(s.programId)) byProgram.set(s.programId, await listReminderSettings(s.programId));
    const result = await sendReminderForSetting(s, byProgram.get(s.programId)!, null);
    fired.push({ settingId: s.id, result });
  }
  return { checked: rows.length, fired };
}
