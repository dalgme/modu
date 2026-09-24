import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { SETTLEMENT_STATUS_LABELS } from '@/lib/settlement/labels';
import { menteeLabel } from '@/lib/utils/labels';
import { excelFileName, kstDate, kstDateTime, kstTime, sheetName, sheetWithMeta, workbookBuffer, xlsxResponse } from '@/lib/excel/sheet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODE_LABELS: Record<string, string> = { online: '온라인', offline: '오프라인' };

interface LogRow {
  id: string;
  case_id: string;
  mentor_id: string;
  round_no: number;
  is_extra: boolean;
  started_at: string;
  ended_at: string;
  mode: string;
  place: string | null;
  participants: unknown;
  report_registered_at: string | null;
  report_kind: string;
  unit_price_snapshot: number;
  amount_snapshot: number;
  settlement_id: string | null;
  mentee_signed_at: string | null;
  corrected_at: string | null;
}

/**
 * 회차(멘토링 로그) 엑셀 — GET /api/nextlab/rounds-export?mentor=&from=&to= (P31)
 * 현재 범위(행사/그룹)의 회차를 멘토별로: 일자·시작/종료·운영시간·방법·장소·참가자·보고서 등록일·단가 스냅샷·정산 상태.
 * from/to = KST 일자(YYYY-MM-DD, 양끝 포함, 회차 시작일 기준).
 */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const sp = new URL(request.url).searchParams;
  const mentorId = sp.get('mentor') || null;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const from = DATE_RE.test(sp.get('from') ?? '') ? sp.get('from')! : null;
  const to = DATE_RE.test(sp.get('to') ?? '') ? sp.get('to')! : null;

  const admin = createAdminClient();
  const cases = await fetchAll<{ id: string; owner_name: string; business_name: string; support_type_id: string; status: string }>((f, t) => {
    let q = admin.from('cases').select('id, owner_name, business_name, support_type_id, status').eq('program_id', ctx.programId);
    if (ctx.supportTypeId) q = q.eq('support_type_id', ctx.supportTypeId);
    return q.range(f, t);
  });
  const caseById = new Map(cases.map((c) => [c.id, c]));
  let logs = await fetchAllIn<LogRow>(cases.map((c) => c.id), (chunk, f, t) => {
    let q = admin.from('mentoring_logs').select('id, case_id, mentor_id, round_no, is_extra, started_at, ended_at, mode, place, participants, report_registered_at, report_kind, unit_price_snapshot, amount_snapshot, settlement_id, mentee_signed_at, corrected_at').in('case_id', chunk);
    if (mentorId) q = q.eq('mentor_id', mentorId);
    return q.order('started_at', { ascending: true }).range(f, t);
  });
  if (from) logs = logs.filter((l) => kstDate(l.started_at) >= from);
  if (to) logs = logs.filter((l) => kstDate(l.started_at) <= to);

  const [groups, mentors, settlements] = await Promise.all([
    fetchAll<{ id: string; name: string }>((f, t) => admin.from('support_types').select('id, name').eq('program_id', ctx.programId).range(f, t)),
    fetchAllIn<{ id: string; name: string; phone: string | null }>(logs.map((l) => l.mentor_id), (chunk, f, t) => admin.from('users').select('id, name, phone').in('id', chunk).range(f, t)),
    fetchAllIn<{ id: string; status: string; kind: string; confirmed_at: string | null }>(logs.map((l) => l.settlement_id).filter((x): x is string => !!x), (chunk, f, t) => admin.from('settlements').select('id, status, kind, confirmed_at').in('id', chunk).range(f, t)),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const mentorById = new Map(mentors.map((u) => [u.id, u]));
  const settlementById = new Map(settlements.map((s) => [s.id, s]));
  const participantsText = (v: unknown): string => {
    if (!Array.isArray(v)) return '';
    return v.map((p) => (p && typeof p === 'object' ? `${(p as { name?: string }).name ?? ''}${(p as { role?: string }).role === 'member' ? '(팀원)' : ''}` : String(p))).filter(Boolean).join(', ');
  };
  const minutes = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

  // 멘토명 → 시작일시 정렬
  const sorted = [...logs].sort((a, b) => (mentorById.get(a.mentor_id)?.name ?? '').localeCompare(mentorById.get(b.mentor_id)?.name ?? '', 'ko') || a.started_at.localeCompare(b.started_at));
  const header = ['멘토', '멘토 휴대폰', '멘티', '그룹', '케이스 상태', '회차', '추가 회차', '일자', '시작', '종료', '운영시간(분)', '방법', '장소', '참가자', '보고서 등록일', '보고서 형식', '멘티 서명', '단가 스냅샷', '금액 스냅샷', '정산 상태', '정산 확정일', '정정'];
  const rows = sorted.map((l) => {
    const c = caseById.get(l.case_id);
    const u = mentorById.get(l.mentor_id);
    const s = l.settlement_id ? settlementById.get(l.settlement_id) : undefined;
    return [
      u?.name ?? '-',
      u?.phone ?? '',
      c ? menteeLabel(c.owner_name, c.business_name) : '-',
      c ? (groupName.get(c.support_type_id) ?? '') : '',
      c?.status ?? '',
      l.round_no,
      l.is_extra ? 'O' : '',
      kstDate(l.started_at),
      kstTime(l.started_at),
      kstTime(l.ended_at),
      minutes(l.started_at, l.ended_at),
      MODE_LABELS[l.mode] ?? l.mode,
      l.place ?? '',
      participantsText(l.participants),
      kstDateTime(l.report_registered_at),
      l.report_registered_at ? (l.report_kind === 'file' ? '파일' : '웹 작성') : '(계획)',
      l.mentee_signed_at ? 'O' : '',
      Number(l.unit_price_snapshot),
      Number(l.amount_snapshot),
      s ? (SETTLEMENT_STATUS_LABELS[s.status] ?? s.status) : l.report_registered_at ? '미정산(이행)' : '',
      kstDate(s?.confirmed_at),
      l.corrected_at ? '운영사 정정' : '',
    ];
  });
  const mentorName = mentorId ? (mentorById.get(mentorId)?.name ?? null) : null;
  const filter = [mentorName ? `멘토 ${mentorName}` : null, from || to ? `기간 ${from ?? '…'} ~ ${to ?? '…'}` : null].filter(Boolean).join(' · ') || undefined;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetWithMeta(header, rows, { 범위: `${ctx.program.name} · ${ctx.group?.name ?? '행사 전체'}`, 필터: filter, extra: [['회차 수', rows.length]] }), sheetName('회차'));
  return xlsxResponse(workbookBuffer(wb), excelFileName(ctx.program.name, ctx.group?.name ?? null, `회차${mentorName ? `_${mentorName}` : ''}`));
}
