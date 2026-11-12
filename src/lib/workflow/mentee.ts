import 'server-only';

import { isGroupSurveyEnabled } from '@/lib/surveys/group-survey';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import { queueNotification } from '@/lib/workflow/notifications';
import { notifyProgramStaff } from '@/lib/workflow/closure';
import { reassignMentor } from '@/lib/workflow/cases';
import { TRANSITIONS } from '@/lib/workflow/transitions';
import { getCaseSurvey, scaleOptions, choiceOptions } from '@/lib/data/survey';
import type { WorkflowResult } from '@/lib/workflow/cases';
import type { Json } from '@/types/database';


/** 만족도 조사 노출 조건: 종결 요청 이후 (docs §7). T9 게이트 아님.
 *  P20: 목표 회차 보고서 완료·운영사 [만족도 생성] = cases.survey_opened_at 도 개시 조건. */
export const SURVEY_OPEN_STATUSES = ['closure_requested', 'revision_requested', 'settlement_pending', 'settlement_batched', 'closed'] as const;

/** 케이스에 만족도 조사가 열려 있는지 (상태 게이트 또는 survey_opened_at). (2026-11-03) 라운드에서 설문을 끈 경우(surveyEnabled=false)는 항상 닫힘 */
export function surveyOpenFor(c: { status: string; survey_opened_at?: string | null; surveyEnabled?: boolean }): boolean {
  if (c.surveyEnabled === false) return false;
  return (SURVEY_OPEN_STATUSES as readonly string[]).includes(c.status) || !!c.survey_opened_at;
}

export async function submitSurvey(caseId: string, menteeId: string, answers: Record<string, unknown>): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, mentee_id, status, survey_opened_at, support_type_id').eq('id', caseId).maybeSingle();
  if (!c || c.mentee_id !== menteeId) return { ok: false, error: '본인 케이스만 응답할 수 있습니다.' };
  if (!(await isGroupSurveyEnabled(c.support_type_id))) return { ok: false, error: '이 라운드는 만족도 조사를 진행하지 않습니다.' };
  if (!surveyOpenFor(c)) return { ok: false, error: '만족도 조사는 목표 회차 완료 또는 종결 요청 이후에 참여할 수 있습니다.' };
  const survey = await getCaseSurvey(caseId);
  if (!survey) return { ok: false, error: '이 행사에 활성화된 만족도 양식이 없습니다.' };
  if (survey.response) return { ok: false, error: '이미 응답하셨습니다.' };

  const clean: Record<string, Json> = {};
  const scaleValues: number[] = [];
  for (const q of survey.questions) {
    const v = answers[q.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) return { ok: false, error: `필수 문항에 답해 주세요: ${q.label}` };
      continue;
    }
    switch (q.qtype) {
      case 'scale': {
        const { min, max } = scaleOptions(q);
        const n = Number(v);
        if (!Number.isInteger(n) || n < min || n > max) return { ok: false, error: `척도 범위를 벗어났습니다: ${q.label}` };
        clean[q.id] = n;
        scaleValues.push(n);
        break;
      }
      case 'single': {
        const ids = new Set(choiceOptions(q).map((o) => o.id));
        if (typeof v !== 'string' || !ids.has(v)) return { ok: false, error: `보기에서 선택하세요: ${q.label}` };
        clean[q.id] = v;
        break;
      }
      case 'multi':
      case 'rank': {
        const ids = new Set(choiceOptions(q).map((o) => o.id));
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !ids.has(x))) return { ok: false, error: `보기에서 선택하세요: ${q.label}` };
        if (q.qtype === 'rank' && new Set(v).size !== v.length) return { ok: false, error: `순위가 중복되었습니다: ${q.label}` };
        clean[q.id] = v as string[];
        break;
      }
      case 'text': {
        if (typeof v !== 'string') return { ok: false, error: `텍스트로 답해 주세요: ${q.label}` };
        clean[q.id] = v.trim().slice(0, 2000);
        break;
      }
    }
  }
  const score = scaleValues.length ? Math.round((scaleValues.reduce((a, b) => a + b, 0) / scaleValues.length) * 100) / 100 : null;
  const { error } = await admin.from('survey_responses').insert({ case_id: caseId, template_id: survey.template.id, mentee_id: menteeId, answers: clean, score });
  if (error) return { ok: false, error: error.code === '23505' ? '이미 응답하셨습니다.' : error.message };
  // survey_responses 에 메타 컬럼이 없어 대행 여부는 감사로그에만 남는다 (logAudit 이 via:'view-as' 를 붙인다, P31)
  await logAudit(admin, { actorId: menteeId, programId: c.program_id, action: 'survey.submitted', entityType: 'cases', entityId: caseId, metadata: { case_id: caseId, template_id: survey.template.id, score } });
  return { ok: true, caseId };
}

/** 멘티 → 멘토 변경 요청 (진행 중 상태, 대기 중 요청 1건) */
export async function requestMentorChange(caseId: string, menteeId: string, reason: string): Promise<WorkflowResult> {
  if (!reason.trim()) return { ok: false, error: '변경 요청 사유를 입력하세요.' };
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, program_id, mentee_id, status').eq('id', caseId).maybeSingle();
  if (!c || c.mentee_id !== menteeId) return { ok: false, error: '본인 케이스만 요청할 수 있습니다.' };
  if (!TRANSITIONS.reassign_mentor.from.includes(c.status)) return { ok: false, error: '멘토가 배정된 진행 중 케이스에서만 변경을 요청할 수 있습니다.' };
  const { count } = await admin.from('mentor_change_requests').select('id', { count: 'exact', head: true }).eq('case_id', caseId).eq('status', 'pending');
  if ((count ?? 0) > 0) return { ok: false, error: '처리 대기 중인 변경 요청이 있습니다.' };
  const { error } = await admin.from('mentor_change_requests').insert({ case_id: caseId, requested_by: menteeId, reason: reason.trim() });
  if (error) return { ok: false, error: error.message };
  await notifyProgramStaff(c.program_id, caseId, 'mentor_change_requested');
  await logAudit(admin, { actorId: menteeId, programId: c.program_id, action: 'mentor.change_requested', entityType: 'cases', entityId: caseId, metadata: null });
  return { ok: true, caseId };
}

/** 운영사: 멘토 변경 요청 처리 — 수락 시 T3 reassignMentor 호출 */
export async function decideMentorChange(requestId: string, actorId: string, decision: 'accepted' | 'rejected', note: string, newMentorId?: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: req } = await admin.from('mentor_change_requests').select('id, case_id, requested_by, status').eq('id', requestId).maybeSingle();
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  if (req.status !== 'pending') return { ok: false, error: '이미 처리된 요청입니다.' };
  if (decision === 'rejected' && !note.trim()) return { ok: false, error: '반려 사유를 입력하세요.' };
  const { data: c } = await admin.from('cases').select('id, program_id').eq('id', req.case_id).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };

  if (decision === 'accepted') {
    if (!newMentorId) return { ok: false, error: '새 멘토를 선택하세요.' };
    const r = await reassignMentor(req.case_id, newMentorId, actorId, `멘티 변경 요청 수락${note.trim() ? `: ${note.trim()}` : ''}`);
    if (!r.ok) return r;
  }
  const now = new Date().toISOString();
  await admin.from('mentor_change_requests').update({ status: decision, handled_by: actorId, handled_at: now, handling_note: note.trim() || null }).eq('id', requestId).eq('status', 'pending');
  await queueNotification(admin, { caseId: req.case_id, programId: c.program_id, recipientId: req.requested_by, triggerEvent: 'mentor_change_decided', payload: { decision, message: decision === 'accepted' ? '요청이 수락되어 새 멘토가 배정되었습니다.' : `요청이 반려되었습니다. ${note.trim().slice(0, 60)}` } });
  await logAudit(admin, { actorId, programId: c.program_id, action: `mentor.change_${decision}`, entityType: 'cases', entityId: req.case_id, metadata: { request_id: requestId, new_mentor_id: newMentorId ?? null, note: note.trim() } });
  return { ok: true, caseId: req.case_id };
}
