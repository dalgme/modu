import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { computeProgramMetrics, type ProgramMetrics } from '@/lib/reports/metrics';
import { CASE_STATUSES, CASE_STATUS_META } from '@/types/case-status';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import type { Json } from '@/types/database';

/**
 * 종합결과리포트 (2026-09-08 요건) — 행사/그룹 단위, **생성일 기준 고정 스냅샷**.
 * 수치는 reports/metrics.ts 의 단일 계산을 그대로 저장하고, 화면·HTML·PDF·DOCX·PPTX·XLSX 는 전부 같은 `sections()` 에서 만든다.
 */
export interface SummarySnapshot {
  id: string;
  title: string;
  generatedAt: string;
  generatedByName: string | null;
  programId: string;
  programName: string;
  clientName: string;
  operatorName: string;
  groupName: string | null;
  period: string;
  metrics: ProgramMetrics;
  narrative: string[];
}

export interface SummaryTable {
  title: string;
  header: string[];
  rows: (string | number)[][];
}
export interface SummarySection {
  title: string;
  /** 지표 [라벨, 값] */
  kv?: [string, string][];
  /** 문장 */
  lines?: string[];
  tables?: SummaryTable[];
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDate = (iso: string) => iso.slice(0, 10);
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });

/** 자동 서술 (지표를 문장으로) */
export function buildNarrative(m: ProgramMetrics, scope: { programName: string; groupName: string | null }): string[] {
  const p = m.performance;
  const b = m.backlog;
  const e = m.evaluation;
  const s = m.settlement;
  const where = scope.groupName ? `${scope.programName} ${scope.groupName}` : `${scope.programName} 전체`;
  const out: string[] = [];
  out.push(`${where}에서 총 ${p.cases}건의 멘티(케이스)가 등록되었고, 이 중 ${p.closed}건이 종결되어 종결률은 ${pct(p.closureRate)}입니다.`);
  out.push(`컨설팅은 계획 ${p.roundsPlanned}회 중 ${p.roundsDone}회가 이행되었으며(온라인 ${p.onlineRounds}회 · 오프라인 ${p.offlineRounds}회), 정산이 확정된 완료 회차는 ${p.roundsCompleted}회입니다.`);
  const waits = [b.unassigned && `미배정 ${b.unassigned}건`, b.reviewPending && `검수 대기 ${b.reviewPending}건`, b.revisionRequested && `보완 요청 중 ${b.revisionRequested}건`, b.reassignmentPending && `재배정 대기 ${b.reassignmentPending}건`, b.stalled && `${b.stalledDays}일 이상 정체 ${b.stalled}건`].filter(Boolean) as string[];
  out.push(waits.length ? `비수행·잔여 과업으로 ${waits.join(', ')}이 남아 있고, 잔여 회차는 ${b.remainingRounds}회입니다.` : `현재 처리 대기 중인 잔여 과업은 없으며, 잔여 회차는 ${b.remainingRounds}회입니다.`);
  out.push(`정산은 지급 대기 ${won(s.pendingNet)}, 품의 편성 ${won(s.batchedNet)}, 정산 확인 ${won(s.confirmedNet)}, 지급 완료 ${won(s.paidNet)}이며, 미정산 회차의 예상 금액(세전)은 ${won(s.estimatedGross)}입니다. 원천징수 합계는 ${won(s.withholdingTotal)}입니다.`);
  out.push(e.surveyAvg !== null ? `멘티 만족도 평균은 ${e.surveyAvg.toFixed(2)}점(응답 ${e.surveyResponses}건)이고, 관찰의견서 제출률은 ${pct(e.observationRate)}입니다.` : `만족도 조사 응답은 아직 없으며, 관찰의견서 제출률은 ${pct(e.observationRate)}입니다.`);
  const top = [...m.mentors].sort((a, b2) => b2.roundsDone - a.roundsDone).slice(0, 3);
  if (top.length) out.push(`회차 이행이 많은 멘토는 ${top.map((t) => `${t.name}(${t.roundsDone}회)`).join(', ')}입니다.`);
  if (b.mentorsMissingDocs) out.push(`지급서류(이력서·통장사본·신분증)가 미비한 멘토가 ${b.mentorsMissingDocs}명 있어 품의 전 수령이 필요합니다.`);
  return out;
}

/** 모든 출력 형식이 공유하는 섹션 구조 */
export function sections(s: SummarySnapshot): SummarySection[] {
  const m = s.metrics;
  const p = m.performance;
  const b = m.backlog;
  const e = m.evaluation;
  const t = m.settlement;
  return [
    {
      title: '개요',
      kv: [
        ['행사', s.programName],
        ['범위', s.groupName ?? '행사 전체'],
        ['발주처', s.clientName],
        ['용역사(운영)', s.operatorName],
        ['행사 기간', s.period],
        ['리포트 생성일', fmtDateTime(s.generatedAt)],
        ['생성자', s.generatedByName ?? '-'],
      ],
    },
    { title: '종합 요약', lines: s.narrative },
    {
      title: '수행 성과',
      kv: [
        ['케이스', `${p.cases}건`],
        ['종결 / 종결률', `${p.closed}건 / ${pct(p.closureRate)}`],
        ['이행 회차 / 계획', `${p.roundsDone} / ${p.roundsPlanned}회`],
        ['완료 회차(정산 확정)', `${p.roundsCompleted}회`],
        ['온라인 / 오프라인', `${p.onlineRounds} / ${p.offlineRounds}회`],
      ],
      tables: [
        {
          title: '진행 상태 분포',
          header: ['상태', '건수'],
          rows: CASE_STATUSES.filter((st) => p.byStatus[st]).map((st) => [CASE_STATUS_META[st].short, p.byStatus[st]]),
        },
        {
          title: '그룹별 현황',
          header: ['그룹', '케이스', '종결', '이행/계획 회차', '만족도', '확정 실지급'],
          rows: m.groups.map((g) => [g.name, g.cases, g.closed, `${g.roundsDone}/${g.roundsPlanned}`, g.surveyAvg?.toFixed(2) ?? '-', won(g.settledNet)]),
        },
      ],
    },
    {
      title: '비수행 · 잔여 과업',
      kv: [
        ['미배정', `${b.unassigned}건`],
        ['잔여 회차', `${b.remainingRounds}회`],
        [`정체(${b.stalledDays}일 무회차)`, `${b.stalled}건`],
        ['검수 대기 / 보완 중', `${b.reviewPending} / ${b.revisionRequested}건`],
        ['재배정 대기', `${b.reassignmentPending}건`],
        ['미서명 회차 / 미응답 설문', `${b.unsignedRounds} / ${b.unansweredSurveys}`],
        ['지급서류 미비 멘토', `${b.mentorsMissingDocs}명`],
        ['미처리 요청', `${b.pendingRequests}건`],
      ],
    },
    {
      title: '성과평가',
      kv: [
        ['만족도 평균 / 응답', `${e.surveyAvg?.toFixed(2) ?? '-'} / ${e.surveyResponses}건`],
        ['운영사 멘토 평가 평균', e.mentorReviewAvg?.toFixed(2) ?? '-'],
        ['관찰의견서 제출률', pct(e.observationRate)],
      ],
      tables: [
        { title: '그룹별 만족도', header: ['그룹', '평균', '응답'], rows: e.surveyByGroup.map((g) => [g.name, g.avg?.toFixed(2) ?? '-', g.n]) },
        { title: '멘토별 만족도', header: ['멘토', '평균', '응답'], rows: e.surveyByMentor.map((g) => [g.name, g.avg?.toFixed(2) ?? '-', g.n]) },
      ],
    },
    {
      title: '정산',
      kv: [
        ['예상(미확정, 세전)', won(t.estimatedGross)],
        ['지급 대기', won(t.pendingNet)],
        ['품의 편성', won(t.batchedNet)],
        ['정산 확인', won(t.confirmedNet)],
        ['지급 완료', won(t.paidNet)],
        ['원천징수 합계', won(t.withholdingTotal)],
      ],
      tables: [{ title: '원천징수 방식별', header: ['방식', '건수', '실지급'], rows: t.byMethod.map((x) => [WITHHOLDING_LABELS[x.method as keyof typeof WITHHOLDING_LABELS] ?? x.method, x.count, won(x.net)]) }],
    },
    {
      title: '멘토 현황',
      tables: [
        {
          title: '멘토별 실적',
          header: ['멘토', '담당', '진행 중', '이행 회차', '완료 회차', '온/오프', '종결', '확정 실지급', '만족도', '운영사 평가'],
          rows: m.mentors.map((x) => [x.name, x.cases, x.activeCases, x.roundsDone, x.roundsCompleted, `${x.online}/${x.offline}`, x.closed, won(x.settledNet), x.surveyAvg?.toFixed(2) ?? '-', x.reviewAvg?.toFixed(2) ?? '-']),
        },
      ],
    },
  ];
}

// ───────────────────────────────────────────── 저장·조회
async function scopeNames(programId: string, supportTypeId: string | null) {
  const admin = createAdminClient();
  const [{ data: p }, { data: g }] = await Promise.all([
    admin.from('programs').select('name, client_name, operator_name, starts_on, ends_on').eq('id', programId).maybeSingle(),
    supportTypeId ? admin.from('support_types').select('name, starts_on, ends_on').eq('id', supportTypeId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const period = g?.starts_on || g?.ends_on ? `${g?.starts_on ? fmtDate(g.starts_on) : '-'} ~ ${g?.ends_on ? fmtDate(g.ends_on) : '-'}` : `${p?.starts_on ? fmtDate(p.starts_on) : '-'} ~ ${p?.ends_on ? fmtDate(p.ends_on) : '-'}`;
  return { programName: p?.name ?? '', clientName: p?.client_name ?? '', operatorName: p?.operator_name ?? '', groupName: g?.name ?? null, period };
}

/** 스냅샷 생성 — 이 시점의 지표를 고정 저장 */
export async function createSummarySnapshot(programId: string, supportTypeId: string | null, actorId: string, title?: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const [m, names] = await Promise.all([computeProgramMetrics(programId, supportTypeId), scopeNames(programId, supportTypeId)]);
  const narrative = buildNarrative(m, names);
  const finalTitle = title?.trim() || `${names.programName}${names.groupName ? ` ${names.groupName}` : ''} 종합결과리포트 (${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })})`;
  const { data, error } = await admin
    .from('report_snapshots')
    .insert({ program_id: programId, support_type_id: supportTypeId, title: finalTitle, generated_by: actorId, metrics: m as unknown as Json, narrative: narrative as unknown as Json })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? '생성 실패' };
  await admin.from('audit_logs').insert({ actor_id: actorId, program_id: programId, action: 'report.snapshot', entity_type: 'report_snapshots', entity_id: data.id, metadata: { title: finalTitle, support_type_id: supportTypeId } });
  return { ok: true, id: data.id };
}

export type { SnapshotListItem } from '@/lib/reports/summary-types';
import type { SnapshotListItem } from '@/lib/reports/summary-types';

export async function listSummarySnapshots(programId: string, supportTypeId?: string | null): Promise<SnapshotListItem[]> {
  const admin = createAdminClient();
  let q = admin.from('report_snapshots').select('id, title, generated_at, generated_by, support_type_id, metrics').eq('program_id', programId).order('generated_at', { ascending: false }).limit(100);
  if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
  const [{ data: rows }, { data: groups }] = await Promise.all([q, admin.from('support_types').select('id, name').eq('program_id', programId)]);
  const byIds = Array.from(new Set((rows ?? []).map((r) => r.generated_by).filter((x): x is string => !!x)));
  const { data: users } = byIds.length ? await admin.from('users').select('id, name').in('id', byIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.name]));
  const gName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  return (rows ?? []).map((r) => {
    const m = r.metrics as unknown as ProgramMetrics;
    return { id: r.id, title: r.title, generatedAt: r.generated_at, generatedByName: r.generated_by ? (nameOf.get(r.generated_by) ?? null) : null, groupName: r.support_type_id ? (gName.get(r.support_type_id) ?? null) : null, cases: m.performance?.cases ?? 0, closed: m.performance?.closed ?? 0 };
  });
}

export async function getSummarySnapshot(id: string): Promise<SummarySnapshot | null> {
  const admin = createAdminClient();
  const { data: r } = await admin.from('report_snapshots').select('*').eq('id', id).maybeSingle();
  if (!r) return null;
  const names = await scopeNames(r.program_id, r.support_type_id);
  const { data: u } = r.generated_by ? await admin.from('users').select('name').eq('id', r.generated_by).maybeSingle() : { data: null };
  return {
    id: r.id,
    title: r.title,
    generatedAt: r.generated_at,
    generatedByName: u?.name ?? null,
    programId: r.program_id,
    ...names,
    metrics: r.metrics as unknown as ProgramMetrics,
    narrative: Array.isArray(r.narrative) ? (r.narrative as string[]) : [],
  };
}

// ───────────────────────────────────────────── HTML (화면·PDF·HTML 파일 공용)
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSummaryHtml(s: SummarySnapshot): string {
  const secs = sections(s);
  const body = secs
    .map((sec) => {
      const kv = sec.kv ? `<table class="kv">${sec.kv.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : '';
      const lines = sec.lines ? `<ol class="lines">${sec.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : '';
      const tables = (sec.tables ?? [])
        .map((t) => `<h3>${esc(t.title)}</h3>${t.rows.length ? `<table class="grid"><thead><tr>${t.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${typeof c === 'number' || (i > 0 && /^[\\d,.%원/-]+$/.test(String(c))) ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">해당 없음</p>'}`)
        .join('');
      return `<section><h2>${esc(sec.title)}</h2>${kv}${lines}${tables}</section>`;
    })
    .join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(s.title)}</title>
<style>
body{font-family:-apple-system,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#1f2430;margin:0;padding:32px;font-size:12.5px;line-height:1.55}
h1{font-size:22px;margin:0 0 4px}.sub{color:#5b6472;font-size:12px;margin-bottom:20px}
h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #103355}h3{font-size:12.5px;margin:12px 0 4px;color:#103355}
table{border-collapse:collapse;width:100%;margin:4px 0 8px}th,td{border:1px solid #d9dde3;padding:4px 6px;text-align:left;vertical-align:top}
table.kv th{width:160px;background:#f3f5f8;font-weight:600}table.grid th{background:#f3f5f8;font-size:11.5px}td.num{text-align:right;font-variant-numeric:tabular-nums}
ol.lines{padding-left:18px}ol.lines li{margin:3px 0}.muted{color:#8a93a0}
.brand{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.brand .tag{font-size:11px;color:#2ad1bf;font-weight:700;letter-spacing:.2em}
footer{margin-top:28px;color:#8a93a0;font-size:10.5px;border-top:1px solid #e3e6ec;padding-top:8px}
@media print{body{padding:16px}section{break-inside:avoid}}
</style></head><body>
<div class="brand"><span class="tag">MENTORING OPERATIONS</span><span class="sub">${esc(s.clientName)} · ${esc(s.operatorName)}</span></div>
<h1>${esc(s.title)}</h1>
<p class="sub">${esc(s.programName)}${s.groupName ? ` · ${esc(s.groupName)}` : ' · 행사 전체'} · 생성 ${esc(fmtDateTime(s.generatedAt))}${s.generatedByName ? ` · ${esc(s.generatedByName)}` : ''}</p>
${body}
<footer>이 리포트는 생성 시점의 데이터를 고정한 스냅샷입니다. 수치는 플랫폼 리포트 계산 기준(회차 이행/완료 이원화, 정산 확정 스냅샷)과 같습니다.</footer>
</body></html>`;
}
