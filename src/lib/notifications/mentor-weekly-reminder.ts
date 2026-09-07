import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { CaseStatus } from '@/types/case-status';
import { sendSolapiSms, solapiConfigured } from '@/lib/notifications/solapi';
import {
  getMentorReminderConfig,
  renderMentorReminder,
} from '@/lib/data/app-settings';

/** 회차가 아직 진행 중인(등록 가능한) 케이스 상태 — 주간 안내문 대상 */
export const PENDING_APPLY_STATUSES: CaseStatus[] = ['mentor_assigned', 'in_progress', 'revision_requested'];

export interface EligibleMentor {
  mentorId: string;
  name: string;
  phone: string | null;
  /** 회차가 진행 중인 담당 멘티(기업·팀)명 */
  companies: string[];
}

/**
 * 주간 안내문 발송 대상 멘토 목록.
 * 조건: (1) 활성 배정된 멘티가 있고, (2) 그 중 회차가 아직 진행 중인 케이스가 있을 것.
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
