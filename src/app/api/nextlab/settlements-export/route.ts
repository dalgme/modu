import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { listSettlements } from '@/lib/data/settlements';
import { SETTLEMENT_STATUS_LABELS, BATCH_STATUS_LABELS } from '@/lib/settlement/labels';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { SETTLEMENT_KIND_LABELS } from '@/lib/reports/export';
import { excelFileName, kstDate, sheetName, sheetWithMeta, workbookBuffer, xlsxResponse } from '@/lib/excel/sheet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODE_LABELS: Record<string, string> = { online: '온라인', offline: '오프라인' };

/**
 * 정산 건 엑셀 — GET /api/nextlab/settlements-export?status=pending,batched&mentor=&batch= (P31)
 * 현재 범위(행사/그룹)의 정산 건을 한국어 라벨로. 취소 건은 별도 시트.
 */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const sp = new URL(request.url).searchParams;
  const statusRaw = (sp.get('status') ?? '').split(',').map((s) => s.trim()).filter((s) => s in SETTLEMENT_STATUS_LABELS);
  const mentorId = sp.get('mentor') || undefined;
  const batchId = sp.get('batch') || undefined;
  const items = await listSettlements({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined, status: statusRaw.length ? statusRaw : undefined, mentorId, batchId });
  const live = items.filter((s) => s.status !== 'canceled');
  const canceled = items.filter((s) => s.status === 'canceled');

  const header = ['멘토', '멘티', '기업(팀)', '그룹', '구분', '원천징수 방식', '회차', '온라인 회차', '오프라인 회차', '지급총액', '소득금액', '소득세', '지방소득세', '원천징수', '실지급', '상태', '품의', '품의 상태', '확정일', '지급일', '지급서류 미비'];
  const row = (s: (typeof items)[number]) => {
    const count = (mode: string) => s.linesParsed.filter((l) => l.mode === mode).reduce((n, l) => n + l.count, 0);
    return [
      s.mentorName,
      s.ownerName,
      s.businessName,
      s.supportTypeName ?? '',
      SETTLEMENT_KIND_LABELS[s.kind] ?? s.kind,
      WITHHOLDING_LABELS[s.withholding_method as keyof typeof WITHHOLDING_LABELS] ?? s.withholding_method,
      s.roundCount,
      count('online'),
      count('offline'),
      Number(s.gross),
      Number(s.taxable),
      Number(s.income_tax),
      Number(s.local_tax),
      Number(s.withholding),
      Number(s.net),
      SETTLEMENT_STATUS_LABELS[s.status] ?? s.status,
      s.batchTitle ?? '',
      s.batchStatus ? (BATCH_STATUS_LABELS[s.batchStatus] ?? s.batchStatus) : '',
      kstDate(s.confirmed_at),
      kstDate(s.paid_at),
      s.mentorDocsMissing ? 'O' : '',
    ];
  };
  const filter = [statusRaw.length ? `상태 ${statusRaw.map((s) => SETTLEMENT_STATUS_LABELS[s]).join('/')}` : null, mentorId ? `멘토 ${live[0]?.mentorName ?? canceled[0]?.mentorName ?? mentorId}` : null, batchId ? `품의 ${live[0]?.batchTitle ?? batchId}` : null].filter(Boolean).join(' · ') || undefined;
  const totals = live.reduce((acc, s) => ({ gross: acc.gross + Number(s.gross), withholding: acc.withholding + Number(s.withholding), net: acc.net + Number(s.net) }), { gross: 0, withholding: 0, net: 0 });
  const meta = { 범위: `${ctx.program.name} · ${ctx.group?.name ?? '행사 전체'}`, 필터: filter, extra: [['건수', live.length], ['지급총액 합계', totals.gross], ['원천징수 합계', totals.withholding], ['실지급 합계', totals.net]] as [string, string | number][] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetWithMeta(header, live.map(row), meta), sheetName('정산 건'));
  if (canceled.length) XLSX.utils.book_append_sheet(wb, sheetWithMeta([...header, '취소일', '취소 사유'], canceled.map((s) => [...row(s), kstDate(s.canceled_at), s.cancel_reason ?? '']), meta), sheetName('취소된 정산'));
  // 유형별 소계 시트 — 라인 단위 (온/오프 × 추가 회차)
  const lineTotals = new Map<string, { count: number; amount: number }>();
  for (const s of live) for (const l of s.linesParsed) {
    const key = `${MODE_LABELS[l.mode] ?? l.mode}${l.is_extra ? ' (추가 회차)' : ''}`;
    const cur = lineTotals.get(key) ?? { count: 0, amount: 0 };
    lineTotals.set(key, { count: cur.count + l.count, amount: cur.amount + l.amount });
  }
  XLSX.utils.book_append_sheet(wb, sheetWithMeta(['유형', '회차', '금액'], Array.from(lineTotals.entries()).map(([k, v]) => [k, v.count, v.amount]), meta), sheetName('유형별 소계'));
  return xlsxResponse(workbookBuffer(wb), excelFileName(ctx.program.name, ctx.group?.name ?? null, '정산'));
}
