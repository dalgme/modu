import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { htmlToPdf, renderTemplate } from '@/lib/documents/render';
import { uploadFile } from '@/lib/storage/files';
import { queueNotification } from '@/lib/workflow/notifications';
import { getBranding } from '@/lib/programs/data';
import { fmt } from '@/lib/programs/branding';
import { computeSettlement, WITHHOLDING_LABELS, type SettlementResult, type SettlementRoundInput } from '@/lib/settlement/compute';
import { resolveWithholding, type ResolvedWithholding } from '@/lib/settlement/policy';
import type { Json, Tables } from '@/types/database';

export type SettlementRow = Tables<'settlements'>;
export type SettlementKind = 'closure' | 'partial';

export interface SettlementEstimate {
  mentorId: string;
  mentorName: string;
  rounds: SettlementRoundInput[];
  result: SettlementResult;
  withholding: ResolvedWithholding;
}

/** 케이스의 아직 정산되지 않은 회차 (멘토 지정 시 그 멘토분만) */
export async function loadUnsettledRounds(caseId: string, mentorId?: string): Promise<SettlementRoundInput[]> {
  const admin = createAdminClient();
  let q = admin
    .from('mentoring_logs')
    .select('id, round_no, mode, started_at, unit_price_snapshot, amount_snapshot, is_extra, mentor_id')
    .eq('case_id', caseId)
    .is('settlement_id', null)
    .order('round_no');
  if (mentorId) q = q.eq('mentor_id', mentorId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    log_id: r.id,
    round_no: r.round_no,
    mode: r.mode,
    started_at: r.started_at,
    unit_price_snapshot: Number(r.unit_price_snapshot),
    amount_snapshot: Number(r.amount_snapshot),
    is_extra: r.is_extra,
    mentor_id: r.mentor_id,
  }));
}

/**
 * 예상 정산 (미확정) — 화면 표시용. 확정 스냅샷과 **같은 computeSettlement** 를 호출한다.
 * 멘토별 1건씩 돌려준다(교체 이력이 있으면 여러 건).
 */
export async function estimateSettlements(caseId: string, mentorId?: string): Promise<SettlementEstimate[]> {
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('program_id, support_type_id').eq('id', caseId).maybeSingle();
  if (!c) return [];
  const rounds = await loadUnsettledRounds(caseId, mentorId);
  const byMentor = new Map<string, SettlementRoundInput[]>();
  for (const r of rounds) byMentor.set(r.mentor_id, [...(byMentor.get(r.mentor_id) ?? []), r]);
  if (byMentor.size === 0) return [];
  const ids = Array.from(byMentor.keys());
  const { data: users } = await admin.from('users').select('id, name').in('id', ids);
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));
  const out: SettlementEstimate[] = [];
  for (const [mid, list] of Array.from(byMentor.entries())) {
    const withholding = await resolveWithholding(c.program_id, c.support_type_id, mid);
    out.push({ mentorId: mid, mentorName: names.get(mid) ?? '-', rounds: list, result: computeSettlement({ rounds: list, withholding: withholding.policy }), withholding });
  }
  return out;
}

export type SnapshotResult = { ok: true; settlementId: string | null; result: SettlementResult | null } | { ok: false; error: string };

/**
 * 정산 확정 스냅샷 (T7 closure / T10·T11 partial) — 케이스 × 멘토 1건.
 * 회차가 0건이면 행을 만들지 않는다(§6-6). 같은 회차는 두 번 정산되지 않는다(mentoring_logs.settlement_id).
 */
export async function createSettlementSnapshot(input: { caseId: string; mentorId: string; kind: SettlementKind; actorId: string; note?: string }): Promise<SnapshotResult> {
  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, program_id, support_type_id, business_name, owner_name, mentee_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!c) return { ok: false, error: '케이스를 찾을 수 없습니다.' };

  const { data: existing } = await admin
    .from('settlements')
    .select('id')
    .eq('case_id', input.caseId)
    .eq('mentor_id', input.mentorId)
    .neq('status', 'canceled')
    .maybeSingle();
  if (existing) return { ok: false, error: '이 멘토의 정산이 이미 확정되어 있습니다.' };

  const rounds = await loadUnsettledRounds(input.caseId, input.mentorId);
  if (rounds.length === 0) return { ok: true, settlementId: null, result: null };

  let withholding: ResolvedWithholding;
  try {
    withholding = await resolveWithholding(c.program_id, c.support_type_id, input.mentorId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '원천징수 정책을 읽을 수 없습니다.' };
  }
  const result = computeSettlement({ rounds, withholding: withholding.policy });
  const now = new Date().toISOString();

  const { data: inserted, error } = await admin
    .from('settlements')
    .insert({
      program_id: c.program_id,
      case_id: c.id,
      mentor_id: input.mentorId,
      kind: input.kind,
      status: 'pending',
      lines: result.lines as unknown as Json,
      gross: result.gross,
      taxable: result.taxable,
      income_tax: result.income_tax,
      local_tax: result.local_tax,
      withholding: result.withholding,
      net: result.net,
      withholding_method: withholding.policy.method,
      withholding_policy: { ...withholding.policy, source: withholding.source, exempted: result.exempted } as unknown as Json,
      rounds_snapshot: rounds.map((r) => ({ log_id: r.log_id, round_no: r.round_no, started_at: r.started_at, mode: r.mode, unit_price: r.unit_price_snapshot, amount: r.amount_snapshot, is_extra: r.is_extra })) as unknown as Json,
      confirmed_by: input.actorId,
      confirmed_at: now,
    })
    .select('id')
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? '정산 저장에 실패했습니다.' };

  await admin
    .from('mentoring_logs')
    .update({ settlement_id: inserted.id })
    .in('id', rounds.map((r) => r.log_id))
    .is('settlement_id', null);

  // 정산서 PDF (실패해도 확정은 유지 — 감사 메타데이터에 남김)
  let statement: 'ok' | 'failed' = 'ok';
  try {
    await renderStatementPdf({ settlementId: inserted.id, caseId: c.id, programId: c.program_id, supportTypeId: c.support_type_id, businessName: c.business_name, ownerName: c.owner_name, mentorId: input.mentorId, kind: input.kind, rounds, result, actorId: input.actorId });
  } catch {
    statement = 'failed';
  }

  // 멘토 통보 (인앱 + 문자 — 큐·Cron 재사용, 실패는 dispatch 가 격리)
  const summary = summarizeForMessage(result);
  await queueNotification(admin, {
    caseId: c.id,
    programId: c.program_id,
    recipientId: input.mentorId,
    triggerEvent: 'settlement_confirmed',
    payload: { settlement_id: inserted.id, kind: input.kind, message: `${c.business_name} — ${summary}` },
  });

  await admin.from('audit_logs').insert({
    actor_id: input.actorId,
    program_id: c.program_id,
    action: input.kind === 'closure' ? 'settlement.confirmed' : 'settlement.partial_confirmed',
    entity_type: 'settlements',
    entity_id: inserted.id,
    metadata: { case_id: c.id, mentor_id: input.mentorId, rounds: rounds.length, gross: result.gross, withholding: result.withholding, net: result.net, method: withholding.policy.method, source: withholding.source, statement, note: input.note ?? null },
  });
  return { ok: true, settlementId: inserted.id, result };
}

/** 확정 취소 — pending 이고 품의 미편성일 때만. 회차 잠금 해제, closure 정산이면 케이스를 종결 요청 단계로 되돌린다. */
export async function cancelSettlement(settlementId: string, actorId: string, reason: string): Promise<{ ok: true; caseId: string } | { ok: false; error: string }> {
  if (!reason.trim()) return { ok: false, error: '취소 사유를 입력하세요.' };
  const admin = createAdminClient();
  const { data: s } = await admin.from('settlements').select('id, case_id, program_id, kind, status, batch_id, mentor_id').eq('id', settlementId).maybeSingle();
  if (!s) return { ok: false, error: '정산 건을 찾을 수 없습니다.' };
  if (s.status !== 'pending' || s.batch_id) return { ok: false, error: '지급 대기 상태이고 품의에 편성되지 않은 정산만 취소할 수 있습니다.' };
  const now = new Date().toISOString();
  const { data: upd } = await admin
    .from('settlements')
    .update({ status: 'canceled', canceled_by: actorId, canceled_at: now, cancel_reason: reason.trim() })
    .eq('id', settlementId)
    .eq('status', 'pending')
    .is('batch_id', null)
    .select('id');
  if (!upd || upd.length === 0) return { ok: false, error: '이미 처리된 정산입니다.' };
  await admin.from('mentoring_logs').update({ settlement_id: null }).eq('settlement_id', settlementId);

  if (s.kind === 'closure') {
    const { data: c } = await admin.from('cases').select('status').eq('id', s.case_id).maybeSingle();
    if (c?.status === 'settlement_pending') {
      await admin.from('cases').update({ status: 'closure_requested' }).eq('id', s.case_id).eq('status', 'settlement_pending');
      await admin.from('case_status_history').insert({ case_id: s.case_id, from_status: 'settlement_pending', to_status: 'closure_requested', changed_by: actorId, note: `정산 확정 취소: ${reason.trim()}` });
    }
  }
  await admin.from('audit_logs').insert({
    actor_id: actorId,
    program_id: s.program_id,
    action: 'settlement.canceled',
    entity_type: 'settlements',
    entity_id: settlementId,
    metadata: { case_id: s.case_id, mentor_id: s.mentor_id, kind: s.kind, reason: reason.trim() },
  });
  return { ok: true, caseId: s.case_id };
}

export function summarizeForMessage(r: SettlementResult): string {
  const online = r.lines.filter((l) => l.mode === 'online').reduce((s, l) => s + l.count, 0);
  const offline = r.lines.filter((l) => l.mode === 'offline').reduce((s, l) => s + l.count, 0);
  return `온라인 ${online}회·오프라인 ${offline}회, 합계 ${won(r.gross)}, 원천징수 ${won(r.withholding)}, 실지급 ${won(r.net)}`;
}

function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

async function renderStatementPdf(input: {
  settlementId: string;
  caseId: string;
  programId: string;
  supportTypeId: string | null;
  businessName: string;
  ownerName: string;
  mentorId: string;
  kind: SettlementKind;
  rounds: SettlementRoundInput[];
  result: SettlementResult;
  actorId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const [branding, { data: mentor }, { data: group }] = await Promise.all([
    getBranding(input.programId),
    admin.from('users').select('name').eq('id', input.mentorId).maybeSingle(),
    input.supportTypeId ? admin.from('support_types').select('name').eq('id', input.supportTypeId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const r = input.result;
  const p = r.policy;
  const policyText =
    p.method === 'other_income'
      ? `기타소득 — 필요경비 ${pct(p.expense_rate)} · 소득세 ${pct(p.tax_rate)} · 지방소득세 ${pct(p.local_rate)}${r.exempted ? ' · 과세최저한 적용(원천징수 없음)' : ''}`
      : p.method === 'business_income'
        ? `사업소득 — 소득세 ${pct(p.tax_rate)} · 지방소득세 ${pct(p.local_rate)}`
        : '원천징수 없음';
  const html = renderTemplate(STATEMENT_TEMPLATE, {
    title: fmt(input.kind === 'closure' ? '{program} 멘토링 정산서' : '{program} 멘토링 부분 정산서', branding),
    program: branding.programName,
    group: group?.name ?? '-',
    business_name: input.businessName,
    owner_name: input.ownerName,
    mentor_name: mentor?.name ?? '-',
    kind: input.kind === 'closure' ? '종결 정산' : '부분 정산(중도 종료)',
    rounds_table: input.rounds
      .map((x) => `<tr><td>${x.round_no}${x.is_extra ? ' (추가)' : ''}</td><td>${x.mode === 'online' ? '온라인' : '오프라인'}</td><td>${kst(x.started_at)}</td><td class="num">${won(x.unit_price_snapshot)}</td><td class="num">${won(x.amount_snapshot)}</td></tr>`)
      .join(''),
    lines_table: r.lines
      .map((l) => `<tr><td>${l.mode === 'online' ? '온라인' : '오프라인'}${l.is_extra ? ' (추가 회차)' : ''}</td><td class="num">${l.count}회</td><td class="num">${won(l.unit_price)}</td><td class="num">${won(l.amount)}</td></tr>`)
      .join(''),
    gross: won(r.gross),
    taxable: won(r.taxable),
    income_tax: won(r.income_tax),
    local_tax: won(r.local_tax),
    withholding: won(r.withholding),
    net: won(r.net),
    method: WITHHOLDING_LABELS[p.method],
    policy_text: policyText,
    date: kst(new Date().toISOString()),
    operator: branding.operatorName,
    client: branding.clientName,
  });
  const pdf = await htmlToPdf(html);
  const meta = await uploadFile('documents', input.caseId, pdf, 'application/pdf', 'pdf');
  await admin.from('documents').insert({
    case_id: input.caseId,
    doc_key: 'settlement_statement',
    doc_name: `정산서_${input.businessName}_${mentor?.name ?? ''}.pdf`,
    storage_path: meta.storagePath,
    sha256: meta.sha256,
    file_size: meta.size,
    mime_type: 'application/pdf',
    uploaded_by: input.actorId,
    uploaded_role: 'nextlab',
  });
}

function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}
function kst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const STATEMENT_TEMPLATE = `
<style>
  body { font-family: '맑은 고딕', Pretendard, sans-serif; font-size: 12px; color: #111; padding: 32px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 20px; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
  th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
  th { background: #f2f2f2; text-align: left; }
  .info th { width: 22%; }
  .grid th { text-align: center; }
  .num { text-align: right; white-space: nowrap; }
  .total td { font-weight: 700; background: #fafafa; }
  .sign { margin-top: 28px; text-align: right; font-size: 13px; }
  .note { color: #555; font-size: 11px; }
</style>
<h1>{{title}}</h1>
<table class="info">
  <tr><th>행사 / 그룹</th><td>{{program}} / {{group}}</td></tr>
  <tr><th>멘티(기업·팀)</th><td>{{business_name}} ({{owner_name}})</td></tr>
  <tr><th>담당 멘토</th><td>{{mentor_name}}</td></tr>
  <tr><th>정산 구분</th><td>{{kind}}</td></tr>
</table>
<h2>회차 내역</h2>
<table class="grid">
  <tr><th>회차</th><th>유형</th><th>일자</th><th>단가</th><th>금액</th></tr>
  {{{rounds_table}}}
</table>
<h2>정산 집계</h2>
<table class="grid">
  <tr><th>유형</th><th>회차</th><th>단가</th><th>금액</th></tr>
  {{{lines_table}}}
  <tr class="total"><td colspan="3">지급총액</td><td class="num">{{gross}}</td></tr>
</table>
<h2>원천징수 ({{method}})</h2>
<table class="info">
  <tr><th>적용 기준</th><td>{{policy_text}}</td></tr>
  <tr><th>소득금액</th><td class="num">{{taxable}}</td></tr>
  <tr><th>소득세</th><td class="num">{{income_tax}}</td></tr>
  <tr><th>지방소득세</th><td class="num">{{local_tax}}</td></tr>
  <tr><th>원천징수 합계</th><td class="num">{{withholding}}</td></tr>
  <tr class="total"><th>실지급 요청액</th><td class="num">{{net}}</td></tr>
</table>
<p class="note">본 정산서는 시스템이 확정 시점의 단가·세율 스냅샷으로 자동 생성한 것으로, 이후 단가·세율 변경에 영향을 받지 않습니다.</p>
<p class="sign">{{date}}<br/>운영사: {{operator}} · 발주처: {{client}}</p>
`;
