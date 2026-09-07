import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { sendSolapiSms, solapiConfigured } from '@/lib/notifications/solapi';
import {
  getMentorReminderConfig,
  renderMentorReminder,
} from '@/lib/data/app-settings';

/**
 * '지원신청서 작성·접수(application_drafted)'을 아직 완료하지 못한 케이스 상태.
 * = 배정 이후(step ≥ mentor_assigned) 이면서 지원신청서 접수(step 5) 이전.
 *   → mentor_assigned, contacted, log_completed, contractor_registered(레거시)
 * (종결/반려/승인 이후 단계는 제외)
 * contractor_registered 는 표시 단계가 지원신청서와 같은 5단계로 접혔지만, 아직 멘토가
 * 지원신청서를 작성/접수하지 않은 상태이므로 리마인더 대상에 명시적으로 포함한다.
 */
const APPLIED_STEP = CASE_STATUS_META.application_drafted.step; // 5
const ASSIGNED_STEP = CASE_STATUS_META.mentor_assigned.step; // 2

export const PENDING_APPLY_STATUSES: CaseStatus[] = (
  Object.keys(CASE_STATUS_META) as CaseStatus[]
).filter((s) => {
  if (s === 'contractor_registered') return true; // 레거시 사전지원 제출 — 지원신청서 접수 전
  const step = CASE_STATUS_META[s].step;
  return step >= ASSIGNED_STEP && step < APPLIED_STEP;
});

export interface EligibleMentor {
  mentorId: string;
  name: string;
  phone: string | null;
  /** 아직 지원신청서 작성을 완료하지 못한 담당 멘티기업명 */
  companies: string[];
}

/**
 * 주간 안내문 발송 대상 멘토 목록.
 * 조건: (1) 활성 배정된 멘티기업이 있고, (2) 그 중 '지원신청서 작성'을 완료하지 못한 기업이 있을 것.
 */
export async function listMentorsNeedingWeeklyReminder(): Promise<EligibleMentor[]> {
  const admin = createAdminClient();

  const { data: assigns } = await admin
    .from('mentor_assignments')
    .select('mentor_id, case_id')
    .eq('is_active', true);
  if (!assigns || assigns.length === 0) return [];

  const caseIds = Array.from(new Set(assigns.map((a) => a.case_id)));
  const { data: cases } = await admin
    .from('cases')
    .select('id, business_name, status')
    .in('id', caseIds)
    .in('status', PENDING_APPLY_STATUSES);
  const pendingCaseById = new Map((cases ?? []).map((c) => [c.id, c]));

  const byMentor = new Map<string, string[]>();
  for (const a of assigns) {
    const c = pendingCaseById.get(a.case_id);
    if (!c) continue;
    const list = byMentor.get(a.mentor_id) ?? [];
    list.push(c.business_name);
    byMentor.set(a.mentor_id, list);
  }
  if (byMentor.size === 0) return [];

  const mentorIds = Array.from(byMentor.keys());
  const { data: mentors } = await admin
    .from('users')
    .select('id, name, phone, is_active, role')
    .in('id', mentorIds);

  const result: EligibleMentor[] = [];
  for (const m of mentors ?? []) {
    if (m.role !== 'mentor' || !m.is_active) continue;
    const companies = byMentor.get(m.id) ?? [];
    if (companies.length === 0) continue;
    result.push({ mentorId: m.id, name: m.name, phone: m.phone, companies });
  }
  return result;
}

export interface WeeklyReminderResult {
  eligible: number;
  sent: number;
  failed: number;
  /** 비활성(문구 off)·미연동 등으로 건너뜀 */
  skipped: boolean;
  reason?: string;
}

/**
 * 대상 멘토들에게 주간 안내문을 발송한다. (cron 및 관리자 '지금 발송' 공용)
 */
export async function sendMentorWeeklyReminders(): Promise<WeeklyReminderResult> {
  const cfg = await getMentorReminderConfig();
  if (!cfg.enabled) return { eligible: 0, sent: 0, failed: 0, skipped: true, reason: 'disabled' };
  if (!solapiConfigured()) {
    return { eligible: 0, sent: 0, failed: 0, skipped: true, reason: 'sms_not_configured' };
  }

  const mentors = await listMentorsNeedingWeeklyReminder();
  let sent = 0;
  let failed = 0;
  for (const m of mentors) {
    const digits = (m.phone ?? '').replace(/\D/g, '');
    if (digits.length < 10) {
      failed += 1;
      continue;
    }
    const text = renderMentorReminder(cfg.template, m.name, m.companies);
    const r = await sendSolapiSms(m.phone as string, text, { senderIndex: 1 });
    if (r.ok) sent += 1;
    else failed += 1;
  }

  const admin = createAdminClient();
  await admin.from('audit_logs').insert({
    actor_id: null,
    action: 'sms.mentor_weekly_reminder',
    entity_type: 'users',
    entity_id: null,
    metadata: { eligible: mentors.length, sent, failed },
  });

  return { eligible: mentors.length, sent, failed, skipped: false };
}
