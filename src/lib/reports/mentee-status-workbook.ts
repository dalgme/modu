import 'server-only';

import ExcelJS from 'exceljs';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { fmt } from '@/lib/programs/branding';
import { getBranding } from '@/lib/programs/data';
import { loadInactiveMemberIds } from '@/lib/data/inactive-members';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { kstYmd } from '@/lib/utils/kst';
import { menteeOrg } from '@/lib/utils/labels';
import { kstToday, safeName } from '@/lib/excel/sheet';
import { BOX, C, CNT, HOURS, MONEY, col, font, fx, head, solid } from '@/lib/excel/styled';

/**
 * 멘티별 멘토링 현황 엑셀 (2026-10-27) — 멘티 1명(케이스) = 1줄.
 * 배정 멘토(소속기관·연락처·변경 이력) · 운영사 · 아이템 · 진행 상태 · 온라인/오프라인 회차와 시간 · 수당 · 회차별 칸.
 * 이행 = 보고서까지 등록된 회차(정산·리포트와 같은 기준), 수당 = 그 회차의 금액 스냅샷 합계.
 * group 이 없으면 행사 전체(라운드 컬럼으로 구분).
 */

type Mode = 'online' | 'offline';

export async function buildMenteeStatusWorkbook(programId: string, groupId: string | null): Promise<{ ok: true; buffer: Buffer; fileName: string; rows: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const [{ data: program }, groupsRes, branding, inactive] = await Promise.all([
    admin.from('programs').select('name, contract_title').eq('id', programId).maybeSingle(),
    admin.from('support_types').select('id, name, required_rounds, sort_order').eq('program_id', programId),
    getBranding(programId),
    loadInactiveMemberIds(programId, 'mentee'),
  ]);
  if (!program) return { ok: false, error: '행사를 찾을 수 없습니다.' };
  const groups = groupsRes.data ?? [];
  const group = groupId ? groups.find((g) => g.id === groupId) : null;
  if (groupId && !group) return { ok: false, error: '이 행사의 사업그룹이 아닙니다.' };
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupOrder = new Map(
    groups
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko'))
      .map((g, i) => [g.id, i]),
  );

  const cases = await fetchAll<{ id: string; owner_name: string; business_name: string; phone: string; email: string | null; item: string | null; status: CaseStatus; support_type_id: string; mentee_id: string | null; created_at: string }>((f, t) => {
    let q = admin.from('cases').select('id, owner_name, business_name, phone, email, item, status, support_type_id, mentee_id, created_at').eq('program_id', programId);
    if (groupId) q = q.eq('support_type_id', groupId);
    return q.range(f, t);
  });
  const caseIds = cases.map((c) => c.id);
  const [profiles, assigns, logs, exts, obs] = await Promise.all([
    fetchAllIn<{ case_id: string; external_no: string | null; region: string | null; mentee_type: string | null; item_description: string | null; needs: string[]; note: string | null }>(caseIds, (chunk, f, t) =>
      admin.from('mentee_profiles').select('case_id, external_no, region, mentee_type, item_description, needs, note').in('case_id', chunk).range(f, t),
    ),
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; assigned_at: string; ended_at: string | null; end_kind: string | null }>(caseIds, (chunk, f, t) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, assigned_at, ended_at, end_kind').in('case_id', chunk).range(f, t),
    ),
    fetchAllIn<{ case_id: string; round_no: number; mentor_id: string; mode: Mode; started_at: string; ended_at: string; report_registered_at: string | null; amount_snapshot: number }>(caseIds, (chunk, f, t) =>
      admin.from('mentoring_logs').select('case_id, round_no, mentor_id, mode, started_at, ended_at, report_registered_at, amount_snapshot').in('case_id', chunk).range(f, t),
    ),
    fetchAllIn<{ case_id: string; extra_rounds: number }>(caseIds, (chunk, f, t) =>
      admin.from('round_extension_requests').select('case_id, extra_rounds').eq('status', 'approved').in('case_id', chunk).range(f, t),
    ),
    fetchAllIn<{ case_id: string }>(caseIds, (chunk, f, t) => admin.from('documents').select('case_id').eq('doc_key', 'observation_report').in('case_id', chunk).range(f, t)),
  ]);
  const mentorIds = Array.from(new Set(assigns.map((a) => a.mentor_id).concat(logs.map((l) => l.mentor_id))));
  const [users, mentorProfiles] = await Promise.all([
    fetchAllIn<{ id: string; name: string; phone: string | null; email: string | null; organization: string | null; position: string | null }>(mentorIds, (chunk, f, t) =>
      admin.from('users').select('id, name, phone, email, organization, position').in('id', chunk).range(f, t),
    ),
    fetchAllIn<{ user_id: string; mentor_institution: string | null }>(mentorIds, (chunk, f, t) =>
      admin.from('mentor_profiles').select('user_id, mentor_institution').eq('program_id', programId).in('user_id', chunk).range(f, t),
    ),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const instOf = new Map(mentorProfiles.map((m) => [m.user_id, m.mentor_institution]));
  const profileOf = new Map(profiles.map((p) => [p.case_id, p]));
  const extraOf = new Map<string, number>();
  for (const e of exts) extraOf.set(e.case_id, (extraOf.get(e.case_id) ?? 0) + (e.extra_rounds ?? 0));
  const obsSet = new Set(obs.map((o) => o.case_id));
  const assignsOf = new Map<string, typeof assigns>();
  for (const a of assigns) (assignsOf.get(a.case_id) ?? assignsOf.set(a.case_id, []).get(a.case_id)!).push(a);
  const logsOf = new Map<string, typeof logs>();
  for (const l of logs) (logsOf.get(l.case_id) ?? logsOf.set(l.case_id, []).get(l.case_id)!).push(l);

  const plannedOf = (c: (typeof cases)[number]) => (groupById.get(c.support_type_id)?.required_rounds ?? 0) + (extraOf.get(c.id) ?? 0);
  const roundCount = Math.max(1, ...cases.map(plannedOf), ...logs.map((l) => l.round_no));
  const hoursOf = (l: { started_at: string; ended_at: string }) => Math.round(((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 3600000) * 100) / 100;

  const rows = cases
    .map((c) => {
      const p = profileOf.get(c.id);
      const as = (assignsOf.get(c.id) ?? []).slice().sort((a, b) => a.assigned_at.localeCompare(b.assigned_at));
      const active = as.find((a) => a.is_active);
      const final = active ?? as.filter((a) => a.end_kind === 'case_closed' || a.end_kind === 'case_withdrawn').pop();
      const mentor = final ? userById.get(final.mentor_id) : undefined;
      const ls = (logsOf.get(c.id) ?? []).slice().sort((a, b) => a.round_no - b.round_no);
      // 이전 멘토 = 지금(마지막) 담당이 아닌 멘토 중 회차를 진행했거나 교체·중도 종료로 빠진 멘토 (회차 없이 회수된 배정은 제외)
      const prevNames = Array.from(
        new Set(
          as
            .filter((a) => a.mentor_id !== final?.mentor_id && (ls.some((l) => l.mentor_id === a.mentor_id) || (a.end_kind !== null && a.end_kind !== 'recalled')))
            .map((a) => userById.get(a.mentor_id)?.name ?? '?'),
        ),
      );
      const done = ls.filter((l) => l.report_registered_at);
      const sum = (m: Mode) => {
        const xs = done.filter((l) => l.mode === m);
        return { n: xs.length, h: Math.round(xs.reduce((s, l) => s + hoursOf(l), 0) * 100) / 100 };
      };
      const slots = Array.from({ length: roundCount }, (_, i) => {
        const l = ls.find((x) => x.round_no === i + 1);
        if (!l) return '';
        const mode = l.mode === 'online' ? '온라인' : '오프라인';
        const h = hoursOf(l);
        const other = final && l.mentor_id !== final.mentor_id ? ` · ${userById.get(l.mentor_id)?.name ?? '다른'} 멘토` : '';
        return `${l.report_registered_at ? mode : `예정 ${mode}`} ${h}시간${other}\n${kstYmd(l.started_at)}`;
      });
      const status = fmt(CASE_STATUS_META[c.status]?.label ?? c.status, branding);
      return {
        groupName: groupById.get(c.support_type_id)?.name ?? '-',
        groupIdx: groupOrder.get(c.support_type_id) ?? 0,
        name: c.owner_name,
        org: menteeOrg(c.owner_name, c.business_name),
        externalNo: p?.external_no ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        region: p?.region ?? '',
        type: p?.mentee_type ?? '',
        item: c.item ?? '',
        itemDesc: p?.item_description ?? '',
        needs: (p?.needs ?? []).join(', '),
        status: inactive.has(c.mentee_id ?? '') ? `${status} (비활성 회원)` : status,
        mentor: mentor ? `${mentor.name}${final?.end_kind === 'case_withdrawn' ? ' (중도 종료)' : ''}` : '미배정',
        mentorInst: (final && instOf.get(final.mentor_id)) || mentor?.organization || '',
        mentorPos: mentor?.position ?? '',
        mentorPhone: mentor?.phone ?? '',
        mentorEmail: mentor?.email ?? '',
        assignedAt: final ? kstYmd(final.assigned_at) : '',
        prev: prevNames.join(', '),
        planned: plannedOf(c),
        registered: ls.length,
        on: sum('online'),
        off: sum('offline'),
        fee: done.reduce((s, l) => s + Number(l.amount_snapshot), 0),
        first: done[0] ? kstYmd(done[0].started_at) : '',
        last: done.length ? kstYmd(done[done.length - 1]!.started_at) : '',
        observation: obsSet.has(c.id) ? '제출' : '',
        slots,
        note: p?.note ?? '',
      };
    })
    .sort((a, b) => a.groupIdx - b.groupIdx || a.name.localeCompare(b.name, 'ko'));

  const wb = new ExcelJS.Workbook();
  wb.creator = '멘토링 운영관리 플랫폼';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet('멘티별 현황', { views: [{ state: 'frozen', xSplit: 3, ySplit: 7 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 2, fitToHeight: 0, printTitlesRow: '6:7' } });
  const today = kstToday();
  const scope = group?.name ?? '행사 전체';
  ws.getCell('A1').value = `${program.name} · ${scope} — 멘티별 멘토링 현황`;
  ws.getCell('A1').font = font({ bold: true, size: 14 });
  ws.getCell('A2').value = `운영사 ${branding.operatorName} · 생성일 ${today} · 이행 = 보고서까지 등록된 회차, 수당 = 그 회차 금액 합계(원천징수 전). 회차 칸 색: 파랑 = 온라인 · 주황 = 오프라인 · 연두 = 예정(보고서 전)`;
  ws.getCell('A2').font = font({ size: 9, color: { argb: 'FF595959' } });

  // 열 정의: [그룹 머리, 칸 이름, 폭, 키]
  type Def = { g: string; h: string; w: number; k: string };
  const defs: Def[] = [
    { g: '멘티', h: '순번', w: 5, k: 'no' },
    ...(group ? [] : [{ g: '멘티', h: '라운드', w: 12, k: 'groupName' }]),
    { g: '멘티', h: '멘티', w: 10, k: 'name' },
    { g: '멘티', h: '닉네임/소속', w: 12, k: 'org' },
    { g: '멘티', h: '고유번호', w: 10, k: 'externalNo' },
    { g: '멘티', h: '연락처', w: 14, k: 'phone' },
    { g: '멘티', h: '이메일', w: 20, k: 'email' },
    { g: '멘티', h: '권역', w: 8, k: 'region' },
    { g: '멘티', h: '유형', w: 8, k: 'type' },
    { g: '멘티', h: '아이템', w: 22, k: 'item' },
    { g: '멘티', h: '아이템 설명', w: 30, k: 'itemDesc' },
    { g: '멘티', h: '희망분야', w: 18, k: 'needs' },
    { g: '멘티', h: '진행 상태', w: 14, k: 'status' },
    { g: '배정 멘토', h: '배정 멘토', w: 11, k: 'mentor' },
    { g: '배정 멘토', h: '소속기관', w: 14, k: 'mentorInst' },
    { g: '배정 멘토', h: '직함', w: 10, k: 'mentorPos' },
    { g: '배정 멘토', h: '연락처', w: 14, k: 'mentorPhone' },
    { g: '배정 멘토', h: '이메일', w: 20, k: 'mentorEmail' },
    { g: '배정 멘토', h: '배정일', w: 11, k: 'assignedAt' },
    { g: '배정 멘토', h: '이전 멘토', w: 11, k: 'prev' },
    { g: '배정 멘토', h: '운영사', w: 14, k: 'operator' },
    { g: '멘토링 실적', h: '계획 회차', w: 8, k: 'planned' },
    { g: '멘토링 실적', h: '등록 회차', w: 8, k: 'registered' },
    { g: '멘토링 실적', h: '이행 회차', w: 8, k: 'done' },
    { g: '멘토링 실적', h: '온라인(회)', w: 8.5, k: 'onN' },
    { g: '멘토링 실적', h: '온라인(시간)', w: 9, k: 'onH' },
    { g: '멘토링 실적', h: '오프라인(회)', w: 9, k: 'offN' },
    { g: '멘토링 실적', h: '오프라인(시간)', w: 9.5, k: 'offH' },
    { g: '멘토링 실적', h: '총 시간', w: 9, k: 'hours' },
    { g: '멘토링 실적', h: '이행률', w: 8, k: 'rate' },
    { g: '멘토링 실적', h: '수당 합계', w: 11, k: 'fee' },
    { g: '멘토링 실적', h: '첫 회차', w: 11, k: 'first' },
    { g: '멘토링 실적', h: '최근 회차', w: 11, k: 'last' },
    { g: '멘토링 실적', h: '관찰의견서', w: 9, k: 'observation' },
    ...Array.from({ length: roundCount }, (_, i) => ({ g: '회차별 진행', h: `${i + 1}회차`, w: 15, k: `slot${i}` })),
    { g: '비고', h: '비고', w: 24, k: 'note' },
  ];
  const at = (k: string) => defs.findIndex((d) => d.k === k) + 1;
  const HEAD1 = 6;
  const HEAD2 = 7;
  const FIRST = 8;
  // 그룹 머리(병합)
  let start = 1;
  defs.forEach((d, i) => {
    const next = defs[i + 1];
    if (!next || next.g !== d.g) {
      head(ws.getCell(HEAD1, start), d.g);
      if (i + 1 > start) ws.mergeCells(HEAD1, start, HEAD1, i + 1);
      start = i + 2;
    }
    head(ws.getCell(HEAD2, i + 1), d.h, true);
    ws.getColumn(i + 1).width = d.w;
  });
  ws.getRow(HEAD2).height = 30;

  const LAST = FIRST + Math.max(rows.length, 1) - 1;
  rows.forEach((r, i) => {
    const rr = FIRST + i;
    const set = (k: string, v: ExcelJS.CellValue) => (ws.getCell(rr, at(k)).value = v === '' ? null : v);
    set('no', i + 1);
    if (!group) set('groupName', r.groupName);
    for (const k of ['name', 'org', 'externalNo', 'phone', 'email', 'region', 'type', 'item', 'itemDesc', 'needs', 'status', 'mentor', 'mentorInst', 'mentorPos', 'mentorPhone', 'mentorEmail', 'assignedAt', 'prev', 'first', 'last', 'observation', 'note'] as const) set(k, r[k]);
    set('operator', branding.operatorName);
    set('planned', r.planned);
    set('registered', r.registered);
    set('onN', r.on.n);
    set('onH', r.on.h);
    set('offN', r.off.n);
    set('offH', r.off.h);
    const c = (k: string) => `${col(at(k))}${rr}`;
    set('done', fx(`${c('onN')}+${c('offN')}`, r.on.n + r.off.n));
    set('hours', fx(`${c('onH')}+${c('offH')}`, r.on.h + r.off.h));
    set('rate', fx(`IF(${c('planned')}=0,0,${c('done')}/${c('planned')})`, r.planned ? (r.on.n + r.off.n) / r.planned : 0));
    set('fee', r.fee);
    r.slots.forEach((s, n) => set(`slot${n}`, s));
    for (let c2 = 1; c2 <= defs.length; c2++) {
      const cell = ws.getCell(rr, c2);
      cell.font = font(c2 === at('name') || c2 === at('mentor') ? { bold: true } : {});
      cell.border = BOX;
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: ['no', 'groupName', 'name', 'region', 'type', 'mentor', 'assignedAt', 'first', 'last', 'observation'].some((k) => at(k) === c2) || defs[c2 - 1]!.k.startsWith('slot') ? 'center' : undefined };
      if (i % 2 === 1 && !defs[c2 - 1]!.k.startsWith('slot')) cell.fill = solid(C.band);
    }
    for (const k of ['planned', 'registered', 'done', 'onN', 'offN']) ws.getCell(rr, at(k)).numFmt = CNT;
    for (const k of ['onH', 'offH', 'hours']) ws.getCell(rr, at(k)).numFmt = HOURS;
    ws.getCell(rr, at('rate')).numFmt = '0%;-0%;"-"';
    ws.getCell(rr, at('fee')).numFmt = MONEY;
    if (r.mentor === '미배정') ws.getCell(rr, at('mentor')).font = font({ bold: true, color: { argb: 'FFC00000' } });
  });
  const T = LAST + 1;
  ws.getCell(T, 1).value = '합계';
  ws.mergeCells(T, 1, T, at('name'));
  for (const k of ['planned', 'registered', 'done', 'onN', 'onH', 'offN', 'offH', 'hours', 'fee']) {
    const v = rows.reduce((s, r) => s + ({ planned: r.planned, registered: r.registered, done: r.on.n + r.off.n, onN: r.on.n, onH: r.on.h, offN: r.off.n, offH: r.off.h, hours: r.on.h + r.off.h, fee: r.fee } as Record<string, number>)[k]!, 0);
    ws.getCell(T, at(k)).value = fx(`SUM(${col(at(k))}${FIRST}:${col(at(k))}${LAST})`, v);
  }
  const totPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totDone = rows.reduce((s, r) => s + r.on.n + r.off.n, 0);
  ws.getCell(T, at('rate')).value = fx(`IF(${col(at('planned'))}${T}=0,0,${col(at('done'))}${T}/${col(at('planned'))}${T})`, totPlanned ? totDone / totPlanned : 0);
  for (let c2 = 1; c2 <= defs.length; c2++) {
    const cell = ws.getCell(T, c2);
    cell.font = font({ bold: true });
    cell.fill = solid(C.head2);
    cell.border = BOX;
    cell.alignment = { horizontal: c2 === 1 ? 'center' : 'right' };
  }
  for (const k of ['planned', 'registered', 'done', 'onN', 'offN']) ws.getCell(T, at(k)).numFmt = '#,##0';
  for (const k of ['onH', 'offH', 'hours']) ws.getCell(T, at(k)).numFmt = HOURS;
  ws.getCell(T, at('rate')).numFmt = '0%';
  ws.getCell(T, at('fee')).numFmt = MONEY;

  // 요약 KPI (3~4행) — 아래 표에서 수식으로 계산
  const nameRng = `${col(at('name'))}${FIRST}:${col(at('name'))}${LAST}`;
  const mentorRng = `${col(at('mentor'))}${FIRST}:${col(at('mentor'))}${LAST}`;
  const assigned = rows.filter((r) => r.mentor !== '미배정').length;
  const sumOf = (k: string) => `${col(at(k))}${T}`;
  const kpi: [string, string, number, string][] = [
    ['멘티', `COUNTA(${nameRng})`, rows.length, '#,##0"명"'],
    ['멘토 배정', `COUNTA(${nameRng})-COUNTIF(${mentorRng},"미배정")`, assigned, '#,##0"명"'],
    ['미배정', `COUNTIF(${mentorRng},"미배정")`, rows.length - assigned, '#,##0"명"'],
    ['이행 회차', sumOf('done'), rows.reduce((s, r) => s + r.on.n + r.off.n, 0), '#,##0"회"'],
    ['온라인', sumOf('onN'), rows.reduce((s, r) => s + r.on.n, 0), '#,##0"회"'],
    ['오프라인', sumOf('offN'), rows.reduce((s, r) => s + r.off.n, 0), '#,##0"회"'],
    ['총 시간', sumOf('hours'), rows.reduce((s, r) => s + r.on.h + r.off.h, 0), '#,##0.#"시간"'],
    ['수당 합계', sumOf('fee'), rows.reduce((s, r) => s + r.fee, 0), '#,##0"원"'],
  ];
  kpi.forEach(([k, f2, v, nf], i) => {
    const c1 = 2 + i * 2;
    head(ws.getCell(3, c1), k);
    ws.mergeCells(3, c1, 3, c1 + 1);
    const cell = ws.getCell(4, c1);
    cell.value = fx(f2, v);
    cell.numFmt = nf;
    cell.font = font({ bold: true, size: 12, color: { argb: C.head } });
    cell.fill = solid(C.head2);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BOX;
    ws.mergeCells(4, c1, 4, c1 + 1);
  });
  ws.getRow(4).height = 24;

  if (rows.length) {
    const s0 = at('slot0');
    const ref = `${col(s0)}${FIRST}:${col(s0 + roundCount - 1)}${LAST}`;
    const tl = `${col(s0)}${FIRST}`;
    const rule = (p: number, prefix: string, fill: string, color: string) => ({ type: 'expression' as const, priority: p, formulae: [`LEFT(${tl},${prefix.length})="${prefix}"`], style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: fill } }, font: { color: { argb: color } } } });
    ws.addConditionalFormatting({ ref, rules: [rule(1, '온라인', C.on, 'FF1F4E79'), rule(2, '오프라인', C.off, 'FF833C0B'), rule(3, '예정', C.plan, 'FF375623')] });
    ws.addConditionalFormatting({ ref: `${col(at('rate'))}${FIRST}:${col(at('rate'))}${LAST}`, rules: [{ type: 'dataBar', priority: 4, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF9BC2E6' } } as unknown as ExcelJS.ConditionalFormattingRule] });
  }
  ws.autoFilter = { from: { row: HEAD2, column: 1 }, to: { row: LAST, column: defs.length } };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const contract = (program.contract_title as string | null) || program.name;
  const fileName = `멘티별 멘토링 현황_${safeName(scope)}_${safeName(contract)}_${today.replace(/-/g, '').slice(2)}.xlsx`;
  return { ok: true, buffer, fileName, rows: rows.length };
}
