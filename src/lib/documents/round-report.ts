import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { htmlToPdf, renderTemplate } from '@/lib/documents/render';
import { dataUrlToBuffer, downloadDataUrl, sha256Hex, uploadFile } from '@/lib/storage/files';
import { getBranding } from '@/lib/programs/data';
import { reportDocKey } from '@/lib/data/rounds';

/**
 * 컨설팅(회차) 보고서 양식 — 행사/그룹 단위 등록 (2026-09-07 추가 요건).
 *  - 해석 순서: 그룹 양식(support_type_id) → 행사 양식(program_id, 그룹 null) → 내장 기본 양식.
 *  - 서명 정책(멘티 확인 서명 · 멘토 자동 서명)은 **양식에 멘토 서명 컬럼 `{{{sign_mentor}}}` 이 있을 때만** 유효하다.
 *  - 웹 작성 회차는 저장/수정/멘티 서명 시 이 양식으로 PDF 를 재생성해 `mentoring_report:{logId}` 단일본으로 둔다.
 */
export const ROUND_REPORT_TEMPLATE_KEY = 'mentoring_report';

export const ROUND_REPORT_PLACEHOLDERS: { key: string; label: string; raw?: boolean }[] = [
  { key: 'program', label: '행사명' },
  { key: 'group', label: '사업그룹명' },
  { key: 'client', label: '발주처 기관명' },
  { key: 'operator', label: '운영사 기관명' },
  { key: 'business_name', label: '멘티 기업(팀)명' },
  { key: 'owner_name', label: '멘티 이름' },
  { key: 'mentor_name', label: '멘토 이름' },
  { key: 'round_no', label: '회차 번호' },
  { key: 'round_total', label: '그룹 회차 수' },
  { key: 'mode', label: '유형(온라인/오프라인)' },
  { key: 'date', label: '컨설팅 일자' },
  { key: 'time_range', label: '시작~종료 시각' },
  { key: 'place', label: '장소' },
  { key: 'participants', label: '참가자 (대표·팀원)' },
  { key: 'topic', label: '주제' },
  { key: 'content', label: '컨설팅 내용(줄바꿈 유지)', raw: true },
  { key: 'result', label: '결과·다음 과제(줄바꿈 유지)', raw: true },
  { key: 'created_date', label: '작성일' },
  { key: 'sign_mentor', label: '멘토 서명 이미지 (서명 컬럼 — 정책 사용 조건)', raw: true },
  { key: 'sign_mentee', label: '멘티 서명 이미지 (확인 서명)', raw: true },
  { key: 'mentee_signed_date', label: '멘티 서명 일자' },
];

export const DEFAULT_ROUND_REPORT_TEMPLATE = `
<style>
  body { font-family: '맑은 고딕', Pretendard, sans-serif; font-size: 12px; color: #111; padding: 32px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
  th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
  th { background: #f2f2f2; width: 18%; text-align: left; }
  .section { min-height: 120px; line-height: 1.6; }
  .sign td { text-align: center; height: 64px; }
  .sign th { text-align: center; width: 25%; }
  .note { color: #555; font-size: 11px; }
</style>
<h1>{{program}} 컨설팅 보고서 ({{round_no}}회차)</h1>
<table>
  <tr><th>사업그룹</th><td>{{group}}</td><th>회차</th><td>{{round_no}} / {{round_total}}</td></tr>
  <tr><th>멘티(기업·팀)</th><td>{{business_name}} ({{owner_name}})</td><th>담당 멘토</th><td>{{mentor_name}}</td></tr>
  <tr><th>일시</th><td>{{date}} {{time_range}}</td><th>유형 / 장소</th><td>{{mode}} / {{place}}</td></tr>
  <tr><th>참가자</th><td colspan="3">{{participants}}</td></tr>
  <tr><th>주제</th><td colspan="3">{{topic}}</td></tr>
</table>
<table>
  <tr><th>컨설팅 내용</th><td class="section">{{{content}}}</td></tr>
  <tr><th>결과 · 다음 과제</th><td class="section">{{{result}}}</td></tr>
</table>
<table class="sign">
  <tr><th>작성일</th><th>멘토 서명</th><th>멘티 확인 서명</th><th>멘티 서명일</th></tr>
  <tr><td>{{created_date}}</td><td>{{{sign_mentor}}}</td><td>{{{sign_mentee}}}</td><td>{{mentee_signed_date}}</td></tr>
</table>
<p class="note">{{operator}} · {{client}}</p>
`;

export interface ResolvedReportTemplate {
  html: string;
  source: 'group' | 'program' | 'default';
  templateId: string | null;
  hasMentorSign: boolean;
  hasMenteeSign: boolean;
}

export function templateHasSign(html: string, who: 'mentor' | 'mentee'): boolean {
  return new RegExp(`\\{\\{\\{?\\s*sign_${who}\\s*\\}?\\}\\}`).test(html);
}

export async function resolveRoundReportTemplate(programId: string, supportTypeId: string | null): Promise<ResolvedReportTemplate> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('document_templates')
    .select('id, html_content, support_type_id, is_active')
    .eq('template_key', ROUND_REPORT_TEMPLATE_KEY)
    .eq('program_id', programId)
    .eq('is_active', true);
  const list = rows ?? [];
  const group = supportTypeId ? list.find((t) => t.support_type_id === supportTypeId) : undefined;
  const program = list.find((t) => t.support_type_id === null);
  const pick = group ?? program;
  const html = pick?.html_content ?? DEFAULT_ROUND_REPORT_TEMPLATE;
  return {
    html,
    source: group ? 'group' : program ? 'program' : 'default',
    templateId: pick?.id ?? null,
    hasMentorSign: templateHasSign(html, 'mentor'),
    hasMenteeSign: templateHasSign(html, 'mentee'),
  };
}

export interface RoundReportPolicy {
  /** 설정값(원본) */
  menteeConfirmSignatureSetting: boolean;
  mentorAutoSignSetting: boolean;
  /** 양식에 멘토 서명 컬럼이 있어야 정책이 유효하다 — 실제 적용값 */
  menteeConfirmSignature: boolean;
  mentorAutoSign: boolean;
  template: ResolvedReportTemplate;
  source: 'group' | 'program';
}

function parsePolicy(v: unknown): { mentee_confirm_signature?: boolean; mentor_auto_sign?: boolean } | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as { mentee_confirm_signature?: boolean; mentor_auto_sign?: boolean }) : null;
}

/** 서명 정책 해석: 그룹 override → 행사 기본. 양식에 `sign_mentor` 컬럼이 없으면 두 기능 모두 꺼진 것으로 본다. */
export async function resolveRoundReportPolicy(programId: string, supportTypeId: string | null): Promise<RoundReportPolicy> {
  const admin = createAdminClient();
  const [{ data: program }, { data: group }, template] = await Promise.all([
    admin.from('programs').select('round_report_policy').eq('id', programId).maybeSingle(),
    supportTypeId ? admin.from('support_types').select('round_report_policy').eq('id', supportTypeId).maybeSingle() : Promise.resolve({ data: null }),
    resolveRoundReportTemplate(programId, supportTypeId),
  ]);
  const g = parsePolicy(group?.round_report_policy);
  const p = parsePolicy(program?.round_report_policy) ?? {};
  const eff = g ?? p;
  const menteeSetting = eff.mentee_confirm_signature ?? p.mentee_confirm_signature ?? true;
  const mentorSetting = eff.mentor_auto_sign ?? p.mentor_auto_sign ?? false;
  return {
    menteeConfirmSignatureSetting: menteeSetting,
    mentorAutoSignSetting: mentorSetting,
    menteeConfirmSignature: template.hasMentorSign && menteeSetting,
    mentorAutoSign: template.hasMentorSign && mentorSetting,
    template,
    source: g ? 'group' : 'program',
  };
}

/** 멘토 서명 등록본 (data:URI) */
export async function getMentorSignatureDataUrl(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('mentor_signatures').select('storage_path').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  return downloadDataUrl('signatures', data.storage_path);
}

export async function saveMentorSignature(userId: string, dataUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = dataUrlToBuffer(dataUrl);
  if (!parsed || !parsed.mimeType.startsWith('image/')) return { ok: false, error: '서명 이미지가 올바르지 않습니다.' };
  if (parsed.buffer.byteLength > 2 * 1024 * 1024) return { ok: false, error: '서명 이미지가 너무 큽니다(2MB 이하).' };
  const admin = createAdminClient();
  const ext = parsed.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const storagePath = `mentors/${userId}/signature.${ext}`;
  const { error: upErr } = await admin.storage.from('signatures').upload(storagePath, parsed.buffer, { contentType: parsed.mimeType, upsert: true });
  if (upErr) return { ok: false, error: `서명 저장 실패: ${upErr.message}` };
  const { error } = await admin.from('mentor_signatures').upsert({ user_id: userId, storage_path: storagePath, sha256: sha256Hex(parsed.buffer) }, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: userId, action: 'mentor.signature_saved', entity_type: 'users', entity_id: userId, metadata: null });
  return { ok: true };
}

/**
 * 웹 작성 회차의 보고서 PDF 를 양식으로 (재)생성해 단일본으로 교체한다.
 * 정책상 멘토 자동 서명이 켜져 있고 멘토 서명 등록본이 있으면 멘토 서명을, 멘티가 서명했으면 멘티 서명을 붙인다.
 * 파일 업로드 회차(report_kind=file)는 건드리지 않는다.
 */
export async function renderRoundReport(logId: string): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: log } = await admin.from('mentoring_logs').select('*').eq('id', logId).maybeSingle();
  if (!log) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (log.report_kind !== 'web') return { ok: true, skipped: true };
  const { data: c } = await admin.from('cases').select('id, program_id, support_type_id, business_name, owner_name').eq('id', log.case_id).maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };

  const [policy, branding, { data: group }, { data: mentor }, { data: menteeSig }] = await Promise.all([
    resolveRoundReportPolicy(c.program_id, c.support_type_id),
    getBranding(c.program_id),
    admin.from('support_types').select('name, required_rounds').eq('id', c.support_type_id).maybeSingle(),
    admin.from('users').select('name').eq('id', log.mentor_id).maybeSingle(),
    log.mentee_signed_at ? admin.from('signatures').select('storage_path').eq('log_id', logId).eq('signer_type', 'mentee').maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const mentorSig = policy.mentorAutoSign ? await getMentorSignatureDataUrl(log.mentor_id) : null;
  const menteeSigUrl = menteeSig?.storage_path ? await downloadDataUrl('signatures', menteeSig.storage_path) : null;

  try {
    const html = renderTemplate(policy.template.html, {
      program: branding.programName,
      group: group?.name ?? '-',
      client: branding.clientName,
      operator: branding.operatorName,
      business_name: c.business_name,
      owner_name: c.owner_name,
      mentor_name: mentor?.name ?? '-',
      round_no: log.round_no,
      round_total: group?.required_rounds ?? '-',
      mode: log.mode === 'online' ? '온라인' : '오프라인',
      date: kstDate(log.started_at),
      time_range: `${kstTime(log.started_at)} ~ ${kstTime(log.ended_at)}`,
      place: log.place ?? '',
      participants: (Array.isArray(log.participants) ? (log.participants as { name?: string; role?: string }[]) : []).map((p) => `${p.name ?? ''}${p.role === 'member' ? '(팀원)' : '(대표)'}`).join(', '),
      topic: log.topic ?? '',
      content: nl(log.content ?? ''),
      result: nl(log.result ?? ''),
      created_date: kstDate(log.created_at),
      sign_mentor: sigHtml(mentorSig),
      sign_mentee: sigHtml(menteeSigUrl),
      mentee_signed_date: log.mentee_signed_at ? kstDate(log.mentee_signed_at) : '',
    });
    const pdf = await htmlToPdf(html);
    const meta = await uploadFile('documents', c.id, pdf, 'application/pdf', 'pdf');
    const key = reportDocKey(logId);
    const { data: old } = await admin.from('documents').select('id, storage_path').eq('case_id', c.id).eq('doc_key', key);
    for (const d of old ?? []) if (d.storage_path !== meta.storagePath) await admin.storage.from('documents').remove([d.storage_path]);
    if ((old ?? []).length > 0) await admin.from('documents').delete().in('id', (old ?? []).map((d) => d.id));
    await admin.from('documents').insert({
      case_id: c.id,
      doc_key: key,
      doc_name: `${log.round_no}회차_컨설팅보고서_${c.business_name}.pdf`,
      storage_path: meta.storagePath,
      sha256: meta.sha256,
      file_size: meta.size,
      mime_type: 'application/pdf',
      uploaded_by: log.mentor_id,
      uploaded_role: 'mentor',
    });
    return { ok: true };
  } catch (err) {
    await admin.from('audit_logs').insert({ actor_id: null, program_id: c.program_id, action: 'round.report_render_failed', entity_type: 'mentoring_logs', entity_id: logId, metadata: { error: err instanceof Error ? err.message : String(err) } });
    return { ok: false, error: err instanceof Error ? err.message : '보고서 생성 실패' };
  }
}

/** 미리보기용 HTML (설정 화면) — 예시 데이터로 치환 */
export function previewRoundReportHtml(html: string, branding: { programName: string; clientName: string; operatorName: string }): string {
  return renderTemplate(html, {
    program: branding.programName,
    group: '예시 그룹',
    client: branding.clientName,
    operator: branding.operatorName,
    business_name: '예시 기업',
    owner_name: '홍길동',
    mentor_name: '김멘토',
    round_no: 1,
    round_total: 4,
    mode: '오프라인',
    date: '2026-10-01',
    time_range: '14:00 ~ 16:00',
    place: '센터 회의실',
    topic: '사업계획서 점검',
    content: nl('컨설팅 내용 예시\n둘째 줄'),
    result: nl('다음 과제 예시'),
    created_date: '2026-10-01',
    sign_mentor: '<span style="color:#888">(멘토 서명)</span>',
    sign_mentee: '<span style="color:#888">(멘티 서명)</span>',
    mentee_signed_date: '2026-10-02',
  });
}

function sigHtml(dataUrl: string | null): string {
  return dataUrl ? `<img src="${dataUrl}" style="height:36px;vertical-align:middle" />` : '';
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function nl(s: string): string {
  return esc(s).replace(/\n/g, '<br/>');
}
function kst(iso: string): Date {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
}
function kstDate(iso: string): string {
  const d = kst(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function kstTime(iso: string): string {
  const d = kst(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
