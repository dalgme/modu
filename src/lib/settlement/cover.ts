import 'server-only';

import type { BatchItem, SettlementItem } from '@/lib/data/settlements';
import { renderTemplate } from '@/lib/documents/render';
import type { Branding } from '@/lib/programs/branding';
import { fmt } from '@/lib/programs/branding';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { BATCH_STATUS_LABELS } from '@/lib/settlement/labels';
import { SETTLEMENT_KIND_LABELS } from '@/lib/settlement/export';

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const kst = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : '-');
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 품의 번호 — 스키마 변경 없이 생성일(KST)·id 앞 6자리로 만든다 (P31) */
export function batchNumber(batch: { id: string; created_at: string }): string {
  return `B${kst(batch.created_at).replace(/-/g, '')}-${batch.id.slice(0, 6).toUpperCase()}`;
}

/** (P31) 지급 품의 표지 HTML — PDF 라우트가 htmlToPdf 로 렌더. 기관명은 브랜딩에서만 읽는다. */
export function renderBatchCoverHtml(batch: BatchItem, items: SettlementItem[], branding: Branding): string {
  const rows = items
    .map((s, i) => {
      const rounds = s.linesParsed.reduce((a, l) => a + l.count, 0);
      return `<tr><td class="num">${i + 1}</td><td>${esc(s.mentorName)}</td><td>${esc(s.businessName)}${s.ownerName && s.ownerName !== s.businessName ? ` (${esc(s.ownerName)})` : ''}</td><td>${esc(s.supportTypeName ?? '-')}</td><td>${SETTLEMENT_KIND_LABELS[s.kind] ?? s.kind}</td><td>${WITHHOLDING_LABELS[s.withholding_method as keyof typeof WITHHOLDING_LABELS] ?? s.withholding_method}</td><td class="num">${rounds}</td><td class="num">${won(Number(s.gross))}</td><td class="num">${won(Number(s.withholding))}</td><td class="num">${won(Number(s.net))}</td></tr>`;
    })
    .join('');
  return renderTemplate(COVER_TEMPLATE, {
    title: fmt('{program} 멘토링 지급 품의서', branding),
    number: batchNumber(batch),
    batch_title: batch.title,
    status: BATCH_STATUS_LABELS[batch.status] ?? batch.status,
    created: kst(batch.created_at),
    submitted: kst(batch.submitted_at),
    confirmed: kst(batch.confirmed_at),
    paid: kst(batch.paid_at),
    count: items.length,
    gross: won(Number(batch.total_gross)),
    withholding: won(Number(batch.total_withholding)),
    net: won(Number(batch.total_net)),
    note: batch.note ?? '',
    rows,
    operator: branding.operatorName,
    client: branding.clientName,
    created_by: batch.createdByName ?? '-',
    confirmed_by: batch.confirmedByName ?? '',
  });
}

const COVER_TEMPLATE = `
<style>
  body { font-family: '맑은 고딕', Pretendard, sans-serif; font-size: 12px; color: #111; padding: 28px 32px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 6px; letter-spacing: .04em; }
  .no { text-align: right; font-size: 11px; color: #555; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
  th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
  th { background: #f2f2f2; text-align: left; font-weight: 700; }
  .info th { width: 18%; }
  .grid th { text-align: center; font-size: 11px; }
  .grid td { font-size: 11px; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals td { font-size: 14px; font-weight: 700; text-align: center; }
  .totals .cap { font-size: 11px; font-weight: 400; color: #555; display: block; margin-bottom: 4px; }
  .approve { margin-top: 18px; }
  .approve th { width: 25%; text-align: center; height: 20px; }
  .approve td { height: 64px; text-align: center; vertical-align: bottom; font-size: 11px; color: #555; }
  .note { color: #555; font-size: 11px; white-space: pre-wrap; }
</style>
<h1>{{title}}</h1>
<p class="no">품의 번호 {{number}}</p>
<table class="info">
  <tr><th>품의 제목</th><td colspan="3">{{batch_title}}</td></tr>
  <tr><th>상태</th><td>{{status}}</td><th>작성</th><td>{{created}} ({{created_by}})</td></tr>
  <tr><th>제출일</th><td>{{submitted}}</td><th>정산 확인</th><td>{{confirmed}} {{confirmed_by}}</td></tr>
  <tr><th>지급일</th><td>{{paid}}</td><th>정산 건수</th><td>{{count}}건</td></tr>
</table>
<table class="totals">
  <tr>
    <td><span class="cap">지급총액 (세전)</span>{{gross}}</td>
    <td><span class="cap">원천징수 합계</span>{{withholding}}</td>
    <td><span class="cap">실지급 요청액</span>{{net}}</td>
  </tr>
</table>
<table class="grid">
  <tr><th>No</th><th>멘토</th><th>멘티(기업·팀)</th><th>그룹</th><th>구분</th><th>원천징수</th><th>회차</th><th>지급총액</th><th>원천징수</th><th>실지급</th></tr>
  {{{rows}}}
</table>
<p class="note">{{note}}</p>
<table class="approve">
  <tr><th>담당</th><th>검토</th><th>{{operator}} 승인</th><th>{{client}} 확인</th></tr>
  <tr><td>(서명)</td><td>(서명)</td><td>(서명)</td><td>(서명)</td></tr>
</table>
<p class="note">본 품의서는 확정 시점의 정산 스냅샷(단가·세율)으로 시스템이 생성한 것입니다. 운영사: {{operator}} · 발주처: {{client}}</p>
`;
