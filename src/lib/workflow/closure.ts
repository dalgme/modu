import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { htmlToPdf, renderTemplate } from '@/lib/documents/render';
import { uploadFile, moveFile, sha256Hex } from '@/lib/storage/files';
import { queueNotification } from '@/lib/workflow/notifications';
import { assertTransition, TRANSITIONS } from '@/lib/workflow/transitions';
import { getRoundAllowance } from '@/lib/data/rounds';
import { missingRequiredMenteeDocs } from '@/lib/workflow/case-documents';
import { getBranding } from '@/lib/programs/data';
import { fmt } from '@/lib/programs/branding';
import type { WorkflowResult } from '@/lib/workflow/cases';

export interface ObservationContent {
  summary: string; // 멘토링 총평
  strengths: string; // 강점
  weaknesses: string; // 보완점
  recommendations: string; // 권고 사항
  next_steps: string; // 향후 계획·연계 제안
  overall_rating: number | null; // 1~5
}

const EMPTY: ObservationContent = { summary: '', strengths: '', weaknesses: '', recommendations: '', next_steps: '', overall_rating: null };

export function normalizeObservation(raw: unknown): ObservationContent {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ObservationContent, unknown>>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const rating = typeof o.overall_rating === 'number' && o.overall_rating >= 1 && o.overall_rating <= 5 ? o.overall_rating : null;
  return {
    summary: str(o.summary),
    strengths: str(o.strengths),
    weaknesses: str(o.weaknesses),
    recommendations: str(o.recommendations),
    next_steps: str(o.next_steps),
    overall_rating: rating,
  };
}

/** 관찰의견서 웹 작성본 임시 저장 (담당 멘토) */
export async function saveObservationDraft(caseId: string, mentorId: string, content: ObservationContent): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (!TRANSITIONS.request_closure.from.includes(c.status) && c.status !== 'mentor_assigned') {
    return { ok: false, error: '컨설팅 진행 중에만 관찰의견서를 작성할 수 있습니다.' };
  }
  const { error } = await admin
    .from('observation_reports')
    .upsert({ case_id: caseId, mentor_id: mentorId, content: content as never }, { onConflict: 'case_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, caseId };
}

/** 관찰의견서 완성본 파일 업로드 (단일본 — delete-then-insert, DB 유니크 인덱스가 최종 방어선) */
export async function uploadObservationFile(
  caseId: string,
  mentorId: string,
  staging: { stagingPath: string; fileName: string; mimeType: string },
): Promise<WorkflowResult> {
  if (!staging.stagingPath.startsWith('_staging/') || staging.stagingPath.includes('..')) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const admin = createAdminClient();
  const basename = staging.stagingPath.split('/').pop();
  if (!basename) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const { data: blob } = await admin.storage.from('documents').download(staging.stagingPath);
  if (!blob) return { ok: false, error: '업로드된 파일을 확인할 수 없습니다.' };
  const buffer = Buffer.from(await blob.arrayBuffer());
  const dest = `${caseId}/${basename}`;
  try {
    await moveFile('documents', staging.stagingPath, dest);
  } catch {
    return { ok: false, error: '파일 이동에 실패했습니다.' };
  }
  await replaceObservationDocument(caseId, {
    doc_name: staging.fileName || '관찰의견서',
    storage_path: dest,
    sha256: sha256Hex(buffer),
    file_size: buffer.byteLength,
    mime_type: staging.mimeType || 'application/octet-stream',
    uploaded_by: mentorId,
  });
  return { ok: true, caseId };
}

async function replaceObservationDocument(
  caseId: string,
  doc: { doc_name: string; storage_path: string; sha256: string; file_size: number; mime_type: string; uploaded_by: string },
): Promise<void> {
  const admin = createAdminClient();
  const { data: old } = await admin.from('documents').select('id, storage_path').eq('case_id', caseId).eq('doc_key', 'observation_report');
  for (const d of old ?? []) {
    if (d.storage_path !== doc.storage_path) await admin.storage.from('documents').remove([d.storage_path]);
  }
  if ((old ?? []).length > 0) await admin.from('documents').delete().in('id', (old ?? []).map((d) => d.id));
  await admin.from('documents').insert({ case_id: caseId, doc_key: 'observation_report', uploaded_role: 'mentor', ...doc });
}

/**
 * T5 종결 요청 — 필수 회차 충족 + 관찰의견서(웹 작성본 또는 업로드본) + (설정) 멘티 서명 전부.
 * 웹 작성본이면 PDF 를 생성해 단일본으로 저장한다.
 */
export async function requestClosure(caseId: string, mentorId: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, status, program_id, support_type_id, business_name, owner_name, mentee_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('request_closure', c.status);
  if (denied) return { ok: false, error: denied };

  const [{ data: group }, { data: program }, { data: logs }, { data: obs }, { data: obsFile }, allowance] = await Promise.all([
    admin.from('support_types').select('required_rounds, name').eq('id', c.support_type_id).maybeSingle(),
    admin.from('programs').select('closure_policy').eq('id', c.program_id).maybeSingle(),
    admin.from('mentoring_logs').select('id, round_no, mode, started_at, ended_at, place, mentee_signed_at').eq('case_id', caseId).order('round_no'),
    admin.from('observation_reports').select('*').eq('case_id', caseId).maybeSingle(),
    admin.from('documents').select('id').eq('case_id', caseId).eq('doc_key', 'observation_report').maybeSingle(),
    getRoundAllowance(caseId),
  ]);
  if (!group) return { ok: false, error: '사업그룹을 찾을 수 없습니다.' };
  const rounds = logs ?? [];
  const required = group.required_rounds;
  if (rounds.length < required) {
    return { ok: false, error: `필수 회차 ${required}회를 모두 등록한 뒤 종결을 요청할 수 있습니다. (현재 ${rounds.length}회, 승인된 추가 ${allowance.approvedExtra}회)` };
  }
  const policy = (program?.closure_policy ?? {}) as { require_mentee_signature?: boolean; require_group_docs?: boolean };
  if (policy.require_mentee_signature && rounds.some((r) => !r.mentee_signed_at)) {
    return { ok: false, error: '모든 회차에 멘티 서명이 있어야 종결을 요청할 수 있습니다.' };
  }
  if (policy.require_group_docs) {
    const missing = await missingRequiredMenteeDocs(caseId);
    if (missing.length > 0) return { ok: false, error: `멘티 필수서류가 누락되어 종결을 요청할 수 없습니다: ${missing.join(', ')}` };
  }

  const content = obs ? normalizeObservation(obs.content) : EMPTY;
  const hasWeb = content.summary.trim().length > 0;
  if (!hasWeb && !obsFile) return { ok: false, error: '관찰의견서를 작성(총평 필수)하거나 완성본 파일을 올린 뒤 종결을 요청하세요.' };

  // 웹 작성본 → PDF 단일본
  if (hasWeb) {
    try {
      const branding = await getBranding(c.program_id);
      const mentor = await admin.from('users').select('name').eq('id', mentorId).maybeSingle();
      const html = renderTemplate(OBSERVATION_TEMPLATE, {
        title: fmt('{program} 관찰의견서', branding),
        program: branding.programName,
        group: group.name,
        business_name: c.business_name,
        owner_name: c.owner_name,
        mentor_name: mentor.data?.name ?? '',
        rounds_table: rounds
          .map((r) => `<tr><td>${r.round_no}</td><td>${r.mode === 'online' ? '온라인' : '오프라인'}</td><td>${fmtDate(r.started_at)}</td><td>${esc(r.place ?? '')}</td><td>${r.mentee_signed_at ? '서명' : '-'}</td></tr>`)
          .join(''),
        summary: nl(content.summary),
        strengths: nl(content.strengths),
        weaknesses: nl(content.weaknesses),
        recommendations: nl(content.recommendations),
        next_steps: nl(content.next_steps),
        rating: content.overall_rating ? `${content.overall_rating} / 5` : '-',
        seal: branding.clientSealName,
        operator: branding.operatorName,
        date: fmtDate(new Date().toISOString()),
      });
      const pdf = await htmlToPdf(html);
      const meta = await uploadFile('documents', caseId, pdf, 'application/pdf', 'pdf');
      await replaceObservationDocument(caseId, {
        doc_name: `관찰의견서_${c.business_name}.pdf`,
        storage_path: meta.storagePath,
        sha256: meta.sha256,
        file_size: meta.size,
        mime_type: 'application/pdf',
        uploaded_by: mentorId,
      });
    } catch (err) {
      return { ok: false, error: `관찰의견서 PDF 생성에 실패했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}` };
    }
    await admin.from('observation_reports').update({ submitted_at: new Date().toISOString() }).eq('case_id', caseId);
  }

  const { data: updated } = await admin
    .from('cases')
    .update({ status: 'closure_requested' })
    .eq('id', caseId)
    .in('status', [...TRANSITIONS.request_closure.from])
    .select('id');
  if (!updated || updated.length === 0) return { ok: false, error: '이미 처리된 케이스입니다. 새로고침 후 다시 시도하세요.' };

  await admin.from('case_status_history').insert({
    case_id: caseId,
    from_status: c.status,
    to_status: 'closure_requested',
    changed_by: mentorId,
    note: '관찰의견서 제출 · 종결 요청',
  });
  await notifyProgramStaff(c.program_id, caseId, 'closure_requested');
  if (c.mentee_id) await queueNotification(admin, { caseId, programId: c.program_id, recipientId: c.mentee_id, triggerEvent: 'survey_reminder' });
  await admin.from('audit_logs').insert({
    actor_id: mentorId,
    program_id: c.program_id,
    action: 'case.closure_requested',
    entity_type: 'cases',
    entity_id: caseId,
    metadata: { rounds: rounds.length, required, observation: hasWeb ? 'web' : 'file' },
  });
  return { ok: true, caseId };
}

/** 추가 회차 요청 (멘토 → 운영사 승인) */
export async function requestRoundExtension(caseId: string, mentorId: string, reason: string, extraRounds: number): Promise<WorkflowResult> {
  if (!reason.trim()) return { ok: false, error: '사유를 입력하세요.' };
  const extra = Math.min(Math.max(Math.floor(extraRounds), 1), 10);
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  if (!TRANSITIONS.submit_round.from.includes(c.status)) return { ok: false, error: '컨설팅 진행 중에만 추가 회차를 요청할 수 있습니다.' };
  const { count } = await admin.from('round_extension_requests').select('id', { count: 'exact', head: true }).eq('case_id', caseId).eq('status', 'pending');
  if ((count ?? 0) > 0) return { ok: false, error: '처리 대기 중인 추가 회차 요청이 있습니다.' };
  const { error } = await admin.from('round_extension_requests').insert({ case_id: caseId, requested_by: mentorId, reason: reason.trim(), extra_rounds: extra });
  if (error) return { ok: false, error: error.message };
  await notifyProgramStaff(c.program_id, caseId, 'extension_requested');
  await admin.from('audit_logs').insert({ actor_id: mentorId, program_id: c.program_id, action: 'round.extension_requested', entity_type: 'cases', entity_id: caseId, metadata: { extra_rounds: extra } });
  return { ok: true, caseId };
}

/** 운영사: 추가 회차 요청 승인/반려 */
export async function decideRoundExtension(requestId: string, actorId: string, decision: 'approved' | 'rejected', note: string): Promise<WorkflowResult> {
  const admin = createAdminClient();
  const { data: req } = await admin.from('round_extension_requests').select('id, case_id, requested_by, status, extra_rounds').eq('id', requestId).maybeSingle();
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  if (req.status !== 'pending') return { ok: false, error: '이미 처리된 요청입니다.' };
  if (decision === 'rejected' && !note.trim()) return { ok: false, error: '반려 사유를 입력하세요.' };
  const { data: c } = await admin.from('cases').select('id, program_id').eq('id', req.case_id).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const { data: upd } = await admin
    .from('round_extension_requests')
    .update({ status: decision, decided_by: actorId, decided_at: new Date().toISOString(), decision_note: note.trim() || null })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 요청입니다.' };
  await queueNotification(admin, { caseId: c.id, programId: c.program_id, recipientId: req.requested_by, triggerEvent: 'extension_decided', payload: { decision, message: decision === 'approved' ? `추가 ${req.extra_rounds}회가 승인되었습니다.` : `추가 회차 요청이 반려되었습니다. ${note.trim().slice(0, 60)}` } });
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: c.program_id, action: `round.extension_${decision}`, entity_type: 'cases', entity_id: c.id, metadata: { request_id: requestId, extra_rounds: req.extra_rounds, note: note.trim() } });
  return { ok: true, caseId: c.id };
}

/** T11a 멘토 자진 중도 종료 요청 (사유 작성 → 운영사 승인) */
export async function requestMentorWithdrawal(caseId: string, mentorId: string, reason: string): Promise<WorkflowResult> {
  if (!reason.trim()) return { ok: false, error: '중도 종료 사유를 입력하세요.' };
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('id, status, program_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
  const denied = assertTransition('request_mentor_withdrawal', c.status);
  if (denied) return { ok: false, error: denied };
  const { data: assign } = await admin.from('mentor_assignments').select('id').eq('case_id', caseId).eq('mentor_id', mentorId).eq('is_active', true).maybeSingle();
  if (!assign) return { ok: false, error: '담당 멘토가 아닙니다.' };
  const { count } = await admin.from('mentor_withdrawal_requests').select('id', { count: 'exact', head: true }).eq('case_id', caseId).eq('status', 'pending');
  if ((count ?? 0) > 0) return { ok: false, error: '처리 대기 중인 중도 종료 요청이 있습니다.' };
  const { error } = await admin.from('mentor_withdrawal_requests').insert({ case_id: caseId, assignment_id: assign.id, mentor_id: mentorId, reason: reason.trim() });
  if (error) return { ok: false, error: error.message };
  await notifyProgramStaff(c.program_id, caseId, 'mentor_withdrawal_requested');
  await admin.from('audit_logs').insert({ actor_id: mentorId, program_id: c.program_id, action: 'mentor.withdrawal_requested', entity_type: 'cases', entity_id: caseId, metadata: null });
  return { ok: true, caseId };
}

/** 행사의 운영사 담당자 전원에게 알림 큐 */
export async function notifyProgramStaff(programId: string, caseId: string | null, triggerEvent: string, roles: ('nextlab' | 'institution')[] = ['nextlab']): Promise<void> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from('program_members')
    .select('user_id, users!inner(role, is_active)')
    .eq('program_id', programId)
    .eq('is_active', true);
  for (const m of members ?? []) {
    const u = m.users as unknown as { role: string; is_active: boolean } | null;
    if (!u || !u.is_active || !(roles as string[]).includes(u.role)) continue;
    await queueNotification(admin, { caseId, programId, recipientId: m.user_id, triggerEvent });
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function nl(s: string): string {
  return esc(s).replace(/\n/g, '<br/>');
}
function fmtDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 관찰의견서 기본 서식 (행사별 override 는 document_templates 'observation_report' — P6) */
const OBSERVATION_TEMPLATE = `
<style>
  body { font-family: Pretendard, sans-serif; font-size: 12px; color: #111; padding: 32px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
  th { background: #f2f2f2; width: 22%; text-align: left; }
  .rounds th { width: auto; text-align: center; }
  .rounds td { text-align: center; }
  .section { min-height: 64px; line-height: 1.6; }
  .sign { margin-top: 32px; text-align: right; font-size: 13px; }
</style>
<h1>{{title}}</h1>
<table>
  <tr><th>행사 / 그룹</th><td>{{program}} / {{group}}</td></tr>
  <tr><th>멘티(기업·팀)</th><td>{{business_name}} ({{owner_name}})</td></tr>
  <tr><th>담당 멘토</th><td>{{mentor_name}}</td></tr>
</table>
<table class="rounds">
  <tr><th>회차</th><th>유형</th><th>일자</th><th>장소</th><th>멘티 서명</th></tr>
  {{rounds_table}}
</table>
<table>
  <tr><th>멘토링 총평</th><td class="section">{{summary}}</td></tr>
  <tr><th>강점</th><td class="section">{{strengths}}</td></tr>
  <tr><th>보완점</th><td class="section">{{weaknesses}}</td></tr>
  <tr><th>권고 사항</th><td class="section">{{recommendations}}</td></tr>
  <tr><th>향후 계획 · 연계 제안</th><td class="section">{{next_steps}}</td></tr>
  <tr><th>종합 평가</th><td>{{rating}}</td></tr>
</table>
<p class="sign">{{date}}<br/>담당 멘토: {{mentor_name}} (인)<br/>운영사: {{operator}}</p>
`;
