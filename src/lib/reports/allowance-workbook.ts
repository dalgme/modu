import 'server-only';

import ExcelJS from 'exceljs';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { policyFromParams, type WithholdingPolicy } from '@/lib/settlement/compute';
import { resolveRate } from '@/lib/settlement/rates';
import { loadRoundBreakdown } from '@/lib/reports/round-breakdown';
import { kstToday, safeName } from '@/lib/excel/sheet';
import {
  SLOT_MODES,
  TAX_METHOD_LABEL,
  mentorTax,
  mostCommon,
  slotFee,
  slotFeeFormula,
  taxFormula,
  type AllowanceRates,
  type AllowanceSlot,
  type TaxCells,
  type TaxRule,
} from '@/lib/reports/allowance-model';
import { BOX, C, CNT, HOURS, MONEY, col, font, fx, head, medium, solid, thin } from '@/lib/excel/styled';

/**
 * 멘토링 수당 산출내역 엑셀 (2026-10-27) — 창경이 1기 1R 에 손으로 만든 "멘토별 수당산출내역" 을
 * 라운드(사업그룹) 단위로 플랫폼 데이터에서 만든다. 시트 4개: 총괄 · 멘토별 요약 · 회차별 상세 · 단가표.
 *  - 회차 칸 = 방식(온라인/오프라인/예정/미시행/타멘토) · 시간 · 수당(수식). 수당은 보고서까지 등록된(이행) 회차만.
 *  - 단가·세율은 [단가표] 시트 노란 칸 — 고치면 전 시트가 다시 계산된다.
 *  - 세금은 멘토별 수당 합계 기준(창경 방식). 플랫폼 정산(멘티×멘토 단위 확정)과의 차이는 총괄 [검증]에 참고로 보인다.
 */

interface MentorBlock {
  no: number;
  mentorId: string;
  name: string;
  rule: TaxRule;
  rows: { mentee: string; slots: AllowanceSlot[]; notes: string[] }[];
}

function toRule(p: WithholdingPolicy): TaxRule {
  if (p.method === 'other_income') return { method: 'other_income', expenseRate: p.expense_rate, taxRate: p.tax_rate, localRate: p.local_rate, rounding: p.rounding, minTaxable: p.min_taxable_exempt };
  if (p.method === 'business_income') return { method: 'business_income', taxRate: p.tax_rate, localRate: p.local_rate, rounding: p.rounding };
  return { method: 'none' };
}

export async function buildAllowanceWorkbook(programId: string, groupId: string): Promise<{ ok: true; buffer: Buffer; fileName: string; rows: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const [{ data: program }, { data: group }] = await Promise.all([
    admin.from('programs').select('name, contract_title, operator_name, withholding_params, default_withholding_method').eq('id', programId).maybeSingle(),
    admin.from('support_types').select('id, name, code, program_id, required_rounds, withholding_method').eq('id', groupId).maybeSingle(),
  ]);
  if (!program || !group || group.program_id !== programId) return { ok: false, error: '이 행사의 사업그룹이 아닙니다.' };

  const cases = await fetchAll<{ id: string; owner_name: string; support_type_id: string }>((f, t) =>
    admin.from('cases').select('id, owner_name, support_type_id').eq('support_type_id', groupId).range(f, t),
  );
  const caseIds = cases.map((c) => c.id);
  const [assigns, logs, memberRows] = await Promise.all([
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; end_kind: string | null }>(caseIds, (chunk, f, t) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, end_kind').in('case_id', chunk).range(f, t),
    ),
    fetchAllIn<{ case_id: string; round_no: number; mentor_id: string; mode: string; started_at: string; ended_at: string; report_registered_at: string | null; unit_price_snapshot: number; amount_snapshot: number }>(caseIds, (chunk, f, t) =>
      admin.from('mentoring_logs').select('case_id, round_no, mentor_id, mode, started_at, ended_at, report_registered_at, unit_price_snapshot, amount_snapshot').in('case_id', chunk).range(f, t),
    ),
    fetchAll<{ user_id: string; withholding_method: string | null }>((f, t) =>
      admin.from('support_type_members').select('user_id, withholding_method').eq('support_type_id', groupId).eq('member_role', 'mentor').range(f, t),
    ),
  ]);

  // (멘토, 케이스) 쌍 — 회차를 진행했거나, 지금 담당이거나, 끝까지 담당(종결·중도 종료)한 경우. 회차 없이 회수된 배정은 뺀다.
  const pairs = new Map<string, Set<string>>();
  const add = (m: string, c: string) => (pairs.get(m) ?? pairs.set(m, new Set()).get(m)!).add(c);
  for (const l of logs) add(l.mentor_id, l.case_id);
  for (const a of assigns) if (a.is_active || a.end_kind === 'case_closed' || a.end_kind === 'case_withdrawn') add(a.mentor_id, a.case_id);
  const mentorIds = Array.from(pairs.keys());
  const users = await fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, f, t) => admin.from('users').select('id, name').in('id', chunk).range(f, t));
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const logByCaseRound = new Map(logs.map((l) => [`${l.case_id}:${l.round_no}`, l]));
  const maxLogRound = logs.reduce((m, l) => Math.max(m, l.round_no), 0);
  const roundCount = Math.max(group.required_rounds ?? 0, maxLogRound, 1);

  // 원천징수 방식: 그룹 안 멘토별 → 그룹 → 행사 기본 (settlement/policy.ts 와 같은 순서)
  const memberMethod = new Map(memberRows.map((m) => [m.user_id, m.withholding_method]));
  const ruleCache = new Map<string, TaxRule>();
  const ruleFor = (mentorId: string): TaxRule => {
    const method = (memberMethod.get(mentorId) ?? group.withholding_method ?? program.default_withholding_method) as WithholdingPolicy['method'];
    if (!ruleCache.has(method)) {
      try {
        ruleCache.set(method, toRule(policyFromParams(method, program.withholding_params)));
      } catch {
        ruleCache.set(method, { method: 'none' });
      }
    }
    return ruleCache.get(method)!;
  };

  const blocks: MentorBlock[] = mentorIds
    .map((mentorId) => ({ mentorId, name: nameOf.get(mentorId) ?? '(알 수 없음)' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map((m, i) => ({
      no: i + 1,
      mentorId: m.mentorId,
      name: m.name,
      rule: ruleFor(m.mentorId),
      rows: Array.from(pairs.get(m.mentorId) ?? [])
        .map((caseId) => {
          const notes: string[] = [];
          const slots: AllowanceSlot[] = [];
          for (let n = 1; n <= roundCount; n++) {
            const l = logByCaseRound.get(`${caseId}:${n}`);
            if (!l) {
              slots.push({ mode: '미시행', hours: null });
              continue;
            }
            if (l.mentor_id !== m.mentorId) {
              slots.push({ mode: '타멘토', hours: null });
              notes.push(`${n}회차 ${nameOf.get(l.mentor_id) ?? '다른'} 멘토 진행`);
              continue;
            }
            const hours = Math.round(((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 3600000) * 100) / 100;
            if (!l.report_registered_at) {
              slots.push({ mode: '예정', hours });
              notes.push(`${n}회차 보고서 미등록`);
              continue;
            }
            slots.push({ mode: l.mode === 'online' ? '온라인' : '오프라인', hours });
          }
          return { mentee: caseById.get(caseId)?.owner_name ?? '-', slots, notes };
        })
        .sort((a, b) => a.mentee.localeCompare(b.mentee, 'ko')),
    }));

  // 단가 — 이행 회차 스냅샷에서 가장 많이 쓰인 시간당 단가, 없으면 오늘 기준 단가표
  const reported = logs.filter((l) => l.report_registered_at);
  const today = kstToday();
  const [rOn, rOff] = await Promise.all([resolveRate(programId, groupId, 'online', today), resolveRate(programId, groupId, 'offline', today)]);
  const rates: AllowanceRates = {
    online: mostCommon(reported.filter((l) => l.mode === 'online').map((l) => Number(l.unit_price_snapshot)), rOn?.unitPrice ?? 0),
    offline: mostCommon(reported.filter((l) => l.mode === 'offline').map((l) => Number(l.unit_price_snapshot)), rOff?.unitPrice ?? 0),
  };
  const platformGross = reported.reduce((s, l) => s + Number(l.amount_snapshot), 0);
  const breakdown = await loadRoundBreakdown(programId, cases.map((c) => ({ id: c.id, support_type_id: c.support_type_id })));
  let platformTax = 0;
  breakdown.byCase.forEach((cells) => cells.forEach((c) => { if (c.reported && typeof c.tax === 'number') platformTax += c.tax; }));

  // 단가표의 세율 칸 기본값 — 행사 설정(other_income / business_income)
  const params = (program.withholding_params ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  const oi = params.other_income ?? {};
  const bi = params.business_income ?? {};

  const wb = new ExcelJS.Workbook();
  wb.creator = '멘토링 운영관리 플랫폼';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  /* ───────── 단가표 ───────── */
  const rate = wb.addWorksheet('단가표', { pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  rate.getColumn(1).width = 2; rate.getColumn(2).width = 26; rate.getColumn(3).width = 14; rate.getColumn(4).width = 66;
  rate.getCell('B2').value = '수당 단가 · 원천징수 기준 (노란 칸만 고치면 전체가 다시 계산됩니다)';
  rate.getCell('B2').font = font({ bold: true, size: 13 });
  ['항목', '값', '설명'].forEach((t, i) => head(rate.getCell(4, 2 + i), t));
  const rateRows: [string, number, string, string][] = [
    ['온라인 시간당 수당', rates.online, MONEY, '이 라운드 이행 회차에 가장 많이 쓰인 단가(회차 등록 시점 스냅샷)'],
    ['오프라인 시간당 수당', rates.offline, MONEY, '〃'],
    ['기타소득 필요경비율', num(oi.expense_rate, 0.6), '0%', '기타소득금액 = 수당 × (1 − 필요경비율), 원 단위 버림'],
    ['기타소득 소득세율', num(oi.tax_rate, 0.2), '0.0%', '소득세 = 기타소득금액 × 세율 (10원 미만 버림)'],
    ['기타소득 지방소득세율', num(oi.local_rate, 0.1), '0.0%', '지방소득세 = 소득세 × 세율 (10원 미만 버림)'],
    ['과세최저한(기타소득금액)', num(oi.min_taxable_exempt, 50000), MONEY, '기타소득금액이 이 금액 이하면 세금 0원 (예: 수당 80,000원 → 소득금액 32,000원 → 면제)'],
    ['사업소득 소득세율', num(bi.tax_rate, 0.03), '0.0%', '사업소득으로 원천징수하는 멘토에게만 적용'],
    ['사업소득 지방소득세율', num(bi.local_rate, 0.1), '0.0%', '〃'],
  ];
  rateRows.forEach(([k, v, fmt, d], i) => {
    const r = 5 + i;
    rate.getCell(r, 2).value = k; rate.getCell(r, 3).value = v; rate.getCell(r, 4).value = d;
    rate.getCell(r, 3).numFmt = fmt; rate.getCell(r, 3).fill = solid(C.input); rate.getCell(r, 3).font = font({ bold: true, color: { argb: 'FF0000FF' } });
    rate.getCell(r, 2).font = font(); rate.getCell(r, 4).font = font({ color: { argb: 'FF595959' } });
    for (let c2 = 2; c2 <= 4; c2++) { rate.getCell(r, c2).border = BOX; rate.getCell(r, c2).alignment = { vertical: 'middle', wrapText: true }; }
  });
  const R = { on: '단가표!$C$5', off: '단가표!$C$6' };
  const TAXC: TaxCells = { expenseRate: '단가표!$C$7', otherTaxRate: '단가표!$C$8', otherLocalRate: '단가표!$C$9', minTaxable: '단가표!$C$10', bizTaxRate: '단가표!$C$11', bizLocalRate: '단가표!$C$12' };
  // 화면 계산값도 단가표 기본값으로 — 수식 결과와 같게
  const effectiveRule = (r0: TaxRule): TaxRule =>
    r0.method === 'other_income'
      ? { ...r0, expenseRate: rateRows[2]![1], taxRate: rateRows[3]![1], localRate: rateRows[4]![1], minTaxable: rateRows[5]![1] }
      : r0.method === 'business_income' ? { ...r0, taxRate: rateRows[6]![1], localRate: rateRows[7]![1] } : r0;

  rate.getCell('B15').value = '방식 칸 규칙 ([회차별 상세] 시트)'; rate.getCell('B15').font = font({ bold: true, size: 11 });
  const legend: [string, string, string][] = [
    ['온라인', C.on, '보고서까지 등록된 온라인 회차 → 시간 × 온라인 단가'],
    ['오프라인', C.off, '보고서까지 등록된 오프라인 회차 → 시간 × 오프라인 단가'],
    ['예정', C.plan, '일정만 등록되고 보고서가 아직 없음 → 0원 (보고서를 등록하면 수당 대상)'],
    ['미시행', C.none, '회차 기록 없음 → 0원'],
    ['타멘토', C.other, '다른 멘토가 진행(그 멘토 줄에 계상) → 0원'],
  ];
  legend.forEach(([k, fill, d], i) => {
    const r = 16 + i;
    const a = rate.getCell(r, 2); a.value = k; a.fill = solid(fill); a.font = font({ bold: true }); a.alignment = { horizontal: 'center' }; a.border = BOX;
    rate.mergeCells(r, 3, r, 4);
    const b = rate.getCell(r, 3); b.value = d; b.font = font(); b.border = BOX;
  });
  rate.getCell('B22').value = '※ 세금은 창경 산출 방식대로 멘토별 수당 합계에 적용합니다. 플랫폼 정산은 멘티별로 확정하고 품의 단위로 과세최저한을 다시 판정하므로 원천징수액이 조금 다를 수 있습니다. 실제 지급액은 플랫폼 [정산·품의] 화면의 확정 금액을 따릅니다.';
  rate.mergeCells('B22:D23');
  rate.getCell('B22').font = font({ size: 9, color: { argb: 'FF595959' } });
  rate.getCell('B22').alignment = { wrapText: true, vertical: 'top' };

  /* ───────── 회차별 상세 ───────── */
  const d = wb.addWorksheet('회차별 상세', { views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:5' } });
  const FIRST = 6;
  const RC = (n: number) => ({ mode: 4 + n * 3, hours: 5 + n * 3, fee: 6 + n * 3 }); // n = 0-based 회차
  const after = 4 + roundCount * 3; // 집계 시작 열
  const K = {
    done: after, on: after + 1, off: after + 2, onH: after + 3, offH: after + 4, fee: after + 5,
    gross: after + 6, method: after + 7, tax: after + 8, net: after + 9, note: after + 10, key: after + 11,
  };
  d.getCell('A1').value = `${program.name} · ${group.name} — 멘토링 수당 산출내역 (회차별 상세)`;
  d.getCell('A1').font = font({ bold: true, size: 14 });
  d.getCell('A2').value = '방식 칸 색: 파랑 = 온라인 · 주황 = 오프라인 · 연두 = 예정(보고서 전) · 회색 = 미시행 · 보라 = 다른 멘토 진행.  방식·시간을 고치면 수당·합계·요약·총괄이 자동으로 바뀝니다(단가는 [단가표]).';
  d.getCell('A2').font = font({ size: 9, color: { argb: 'FF595959' } });
  d.mergeCells(2, 1, 2, K.note);
  [['순번', 1], ['멘토', 2], ['멘티', 3]].forEach(([t, c2]) => { head(d.getCell(4, c2 as number), t as string); d.mergeCells(4, c2 as number, 5, c2 as number); });
  for (let n = 0; n < roundCount; n++) {
    const g = RC(n);
    head(d.getCell(4, g.mode), `${n + 1}회차`); d.mergeCells(4, g.mode, 4, g.fee);
    head(d.getCell(5, g.mode), '방식', true); head(d.getCell(5, g.hours), '시간', true); head(d.getCell(5, g.fee), '수당', true);
  }
  head(d.getCell(4, K.done), '멘티별 집계'); d.mergeCells(4, K.done, 4, K.fee);
  ['시행(회)', '온라인(회)', '오프라인(회)', '온라인(시간)', '오프라인(시간)', '멘티 수당'].forEach((t, i) => head(d.getCell(5, K.done + i), t, true));
  head(d.getCell(4, K.gross), '멘토별 지급'); d.mergeCells(4, K.gross, 4, K.net);
  ['수당 합계', '원천징수 방식', '원천징수', '실 지급액'].forEach((t, i) => head(d.getCell(5, K.gross + i), t, true));
  head(d.getCell(4, K.note), '비고'); d.mergeCells(4, K.note, 5, K.note);
  head(d.getCell(4, K.key), '키'); d.mergeCells(4, K.key, 5, K.key);
  d.getRow(5).height = 30;

  let r = FIRST;
  const ranges: { s: number; e: number; b: MentorBlock; gross: number; tax: number }[] = [];
  const tot = { done: 0, on: 0, off: 0, onH: 0, offH: 0, fee: 0, gross: 0, tax: 0, net: 0 };
  const roundTotals = Array.from({ length: roundCount }, () => 0);
  for (const [bi2, b] of Array.from(blocks.entries())) {
    const s = r;
    let gross = 0;
    for (const row of b.rows) {
      d.getCell(r, 3).value = row.mentee;
      let on = 0, off = 0, onH = 0, offH = 0, fee = 0;
      row.slots.forEach((slot, n) => {
        const g = RC(n);
        const m = `${col(g.mode)}${r}`;
        const h = `${col(g.hours)}${r}`;
        d.getCell(r, g.mode).value = slot.mode;
        d.getCell(r, g.hours).value = slot.hours;
        const v = slotFee(slot, rates);
        d.getCell(r, g.fee).value = fx(slotFeeFormula(m, h, R.on, R.off), v);
        d.getCell(r, g.mode).dataValidation = { type: 'list', allowBlank: false, formulae: [`"${SLOT_MODES.join(',')}"`], showErrorMessage: true, errorTitle: '방식', error: `${SLOT_MODES.join(' / ')} 중에서 고르세요.` };
        d.getCell(r, g.hours).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 12], showErrorMessage: true, errorTitle: '시간', error: '시간은 0~12 사이 숫자로 입력하세요.' };
        if (slot.mode === '온라인') { on += 1; onH += slot.hours ?? 0; }
        if (slot.mode === '오프라인') { off += 1; offH += slot.hours ?? 0; }
        fee += v;
        roundTotals[n] = (roundTotals[n] ?? 0) + v;
      });
      const modes = (word: string) => Array.from({ length: roundCount }, (_, n) => `COUNTIF(${col(RC(n).mode)}${r},"${word}")`).join('+');
      const hoursOf = (word: string) => Array.from({ length: roundCount }, (_, n) => `IF(${col(RC(n).mode)}${r}="${word}",N(${col(RC(n).hours)}${r}),0)`).join('+');
      d.getCell(r, K.on).value = fx(modes('온라인'), on);
      d.getCell(r, K.off).value = fx(modes('오프라인'), off);
      d.getCell(r, K.done).value = fx(`${col(K.on)}${r}+${col(K.off)}${r}`, on + off);
      d.getCell(r, K.onH).value = fx(hoursOf('온라인'), onH);
      d.getCell(r, K.offH).value = fx(hoursOf('오프라인'), offH);
      d.getCell(r, K.fee).value = fx(Array.from({ length: roundCount }, (_, n) => `${col(RC(n).fee)}${r}`).join('+'), fee);
      d.getCell(r, K.note).value = row.notes.join(' / ') || null;
      d.getCell(r, K.key).value = b.no;
      Object.assign(tot, { done: tot.done + on + off, on: tot.on + on, off: tot.off + off, onH: tot.onH + onH, offH: tot.offH + offH, fee: tot.fee + fee });
      gross += fee;
      r += 1;
    }
    const e = r - 1;
    const rule = effectiveRule(b.rule);
    const tax = mentorTax(gross, rule);
    tot.gross += gross; tot.tax += tax; tot.net += gross - tax;
    ranges.push({ s, e, b, gross, tax });
    d.getCell(s, 1).value = b.no;
    d.getCell(s, 2).value = b.name;
    const g = `${col(K.gross)}${s}`;
    d.getCell(s, K.gross).value = fx(`SUM(${col(K.fee)}${s}:${col(K.fee)}${e})`, gross);
    d.getCell(s, K.method).value = TAX_METHOD_LABEL[b.rule.method];
    d.getCell(s, K.tax).value = fx(taxFormula(g, b.rule, TAXC), tax);
    d.getCell(s, K.net).value = fx(`${g}-${col(K.tax)}${s}`, gross - tax);
    if (e > s) for (const c2 of [1, 2, K.gross, K.method, K.tax, K.net]) d.mergeCells(s, c2, e, c2);
    for (let rr = s; rr <= e; rr++) {
      for (let c2 = 1; c2 <= K.note; c2++) {
        const cell = d.getCell(rr, c2);
        cell.font = font(c2 === 2 || c2 === K.gross || c2 === K.net ? { bold: true, color: c2 === K.net ? { argb: C.head } : undefined } : {});
        cell.border = { left: thin, right: thin, top: rr === s ? medium : thin, bottom: rr === e ? medium : thin };
        const isRound = c2 >= 4 && c2 < after;
        cell.alignment = c2 <= 3 || (isRound && (c2 - 4) % 3 === 0) || c2 === K.method ? { horizontal: 'center', vertical: 'middle', wrapText: true } : c2 === K.note ? { vertical: 'middle', wrapText: true } : { horizontal: 'right', vertical: 'middle' };
        if (bi2 % 2 === 1 && !isRound) cell.fill = solid(C.band);
        if (isRound && (c2 - 4) % 3 === 1) cell.numFmt = HOURS;
        if (isRound && (c2 - 4) % 3 === 2) cell.numFmt = MONEY;
      }
      for (const c2 of [K.done, K.on, K.off]) d.getCell(rr, c2).numFmt = CNT;
      for (const c2 of [K.onH, K.offH]) d.getCell(rr, c2).numFmt = HOURS;
      for (const c2 of [K.fee, K.gross, K.tax, K.net]) d.getCell(rr, c2).numFmt = MONEY;
    }
  }
  const LAST = Math.max(r - 1, FIRST);
  const T = LAST + 1;
  d.getCell(T, 1).value = '합계'; d.mergeCells(T, 1, T, 3);
  const sumCol = (c2: number, v: number) => (d.getCell(T, c2).value = fx(`SUM(${col(c2)}${FIRST}:${col(c2)}${LAST})`, v));
  for (let n = 0; n < roundCount; n++) sumCol(RC(n).fee, roundTotals[n] ?? 0);
  sumCol(K.done, tot.done); sumCol(K.on, tot.on); sumCol(K.off, tot.off); sumCol(K.onH, tot.onH); sumCol(K.offH, tot.offH); sumCol(K.fee, tot.fee);
  sumCol(K.gross, tot.gross); sumCol(K.tax, tot.tax); sumCol(K.net, tot.net);
  for (let c2 = 1; c2 <= K.note; c2++) {
    const cell = d.getCell(T, c2);
    cell.font = font({ bold: true }); cell.fill = solid(C.head2); cell.border = BOX;
    cell.alignment = c2 <= 3 ? { horizontal: 'center' } : { horizontal: 'right' };
    if (c2 >= 4 && c2 < after && (c2 - 4) % 3 === 2) cell.numFmt = MONEY;
  }
  for (const c2 of [K.fee, K.gross, K.tax, K.net]) d.getCell(T, c2).numFmt = MONEY;
  for (const c2 of [K.onH, K.offH]) d.getCell(T, c2).numFmt = HOURS;
  for (const c2 of [K.done, K.on, K.off]) d.getCell(T, c2).numFmt = '#,##0';

  if (blocks.length) {
    let pri = 1;
    for (let n = 0; n < roundCount; n++) {
      const g = RC(n);
      const ref = `${col(g.mode)}${FIRST}:${col(g.fee)}${LAST}`;
      const m = `$${col(g.mode)}${FIRST}`;
      const rule = (word: string, fill: string, color: string) => ({ type: 'expression' as const, priority: pri++, formulae: [`${m}="${word}"`], style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: fill } }, font: { color: { argb: color } } } });
      d.addConditionalFormatting({ ref, rules: [rule('온라인', C.on, 'FF1F4E79'), rule('오프라인', C.off, 'FF833C0B'), rule('예정', C.plan, 'FF375623'), rule('미시행', C.none, 'FFA6A6A6'), rule('타멘토', C.other, 'FF5B3F8C')] });
    }
    d.addConditionalFormatting({ ref: `${col(K.gross)}${FIRST}:${col(K.gross)}${LAST}`, rules: [{ type: 'dataBar', priority: pri++, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FF9BC2E6' } } as unknown as ExcelJS.ConditionalFormattingRule] });
  }
  const widths: Record<number, number> = { 1: 5, 2: 10, 3: 10 };
  for (let n = 0; n < roundCount; n++) { widths[RC(n).mode] = 8.5; widths[RC(n).hours] = 7.5; widths[RC(n).fee] = 10; }
  Object.assign(widths, { [K.done]: 8.5, [K.on]: 8.5, [K.off]: 9, [K.onH]: 9, [K.offH]: 9, [K.fee]: 11, [K.gross]: 12, [K.method]: 9, [K.tax]: 10, [K.net]: 12, [K.note]: 32, [K.key]: 5 });
  for (const [c2, w] of Object.entries(widths)) d.getColumn(Number(c2)).width = w;
  d.getColumn(K.key).hidden = true;
  d.autoFilter = { from: { row: 5, column: 1 }, to: { row: LAST, column: K.note } };

  /* ───────── 멘토별 요약 ───────── */
  const s = wb.addWorksheet('멘토별 요약', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4' } });
  s.getCell('A1').value = `${group.name} — 멘토별 수당 요약`; s.getCell('A1').font = font({ bold: true, size: 14 });
  s.getCell('A2').value = '[회차별 상세] 시트를 멘토별로 합산한 표입니다. 수당 합계의 막대 길이로 크기를 비교할 수 있습니다.'; s.getCell('A2').font = font({ size: 9, color: { argb: 'FF595959' } });
  const sh = ['순번', '멘토', '담당 멘티', '시행 회차', '온라인(회)', '오프라인(회)', '온라인(시간)', '오프라인(시간)', '온라인 비중', '수당 합계', '원천징수 방식', '원천징수', '실 지급액'];
  sh.forEach((t, i) => head(s.getCell(4, i + 1), t));
  s.getRow(4).height = 30;
  const D = "'회차별 상세'";
  const keyRng = `${D}!$${col(K.key)}$${FIRST}:$${col(K.key)}$${LAST}`;
  const sumif = (srcCol: number, rr: number) => `SUMIF(${keyRng},A${rr},${D}!$${col(srcCol)}$${FIRST}:$${col(srcCol)}$${LAST})`;
  const SR = 5;
  ranges.forEach(({ b, s: bs, e: be, gross, tax }, i) => {
    const rr = SR + i;
    const sumRows = (fn: (row: MentorBlock['rows'][number]) => number) => b.rows.reduce((a, row) => a + fn(row), 0);
    const cnt = (w: string) => sumRows((row) => row.slots.filter((x) => x.mode === w).length);
    const hrs = (w: string) => sumRows((row) => row.slots.filter((x) => x.mode === w).reduce((a2, x) => a2 + (x.hours ?? 0), 0));
    const on = cnt('온라인'), off = cnt('오프라인');
    s.getCell(rr, 1).value = b.no; s.getCell(rr, 2).value = b.name;
    s.getCell(rr, 3).value = fx(`COUNTIF(${keyRng},A${rr})`, be - bs + 1);
    s.getCell(rr, 4).value = fx(sumif(K.done, rr), on + off);
    s.getCell(rr, 5).value = fx(sumif(K.on, rr), on);
    s.getCell(rr, 6).value = fx(sumif(K.off, rr), off);
    s.getCell(rr, 7).value = fx(sumif(K.onH, rr), hrs('온라인'));
    s.getCell(rr, 8).value = fx(sumif(K.offH, rr), hrs('오프라인'));
    s.getCell(rr, 9).value = fx(`IF(D${rr}=0,0,E${rr}/D${rr})`, on + off ? on / (on + off) : 0);
    s.getCell(rr, 10).value = fx(sumif(K.fee, rr), gross);
    s.getCell(rr, 11).value = TAX_METHOD_LABEL[b.rule.method];
    s.getCell(rr, 12).value = fx(taxFormula(`J${rr}`, b.rule, TAXC), tax);
    s.getCell(rr, 13).value = fx(`J${rr}-L${rr}`, gross - tax);
    for (let c2 = 1; c2 <= 13; c2++) {
      const cell = s.getCell(rr, c2);
      cell.font = font(c2 === 10 || c2 === 13 ? { bold: true, color: c2 === 13 ? { argb: C.head } : undefined } : {});
      cell.border = BOX;
      cell.alignment = c2 <= 2 || c2 === 11 ? { horizontal: 'center' } : { horizontal: 'right' };
      if (i % 2 === 1) cell.fill = solid(C.band);
    }
    for (const c2 of [3, 4, 5, 6]) s.getCell(rr, c2).numFmt = CNT;
    for (const c2 of [7, 8]) s.getCell(rr, c2).numFmt = HOURS;
    s.getCell(rr, 9).numFmt = '0%;-0%;"-"';
    for (const c2 of [10, 12, 13]) s.getCell(rr, c2).numFmt = MONEY;
  });
  const SL = SR + Math.max(ranges.length, 1) - 1;
  const ST = SL + 1;
  s.getCell(ST, 1).value = '합계'; s.mergeCells(ST, 1, ST, 2);
  const sumS = (c2: number, v: number) => (s.getCell(ST, c2).value = fx(`SUM(${col(c2)}${SR}:${col(c2)}${SL})`, v));
  sumS(3, blocks.reduce((a, b) => a + b.rows.length, 0)); sumS(4, tot.done); sumS(5, tot.on); sumS(6, tot.off); sumS(7, tot.onH); sumS(8, tot.offH);
  s.getCell(ST, 9).value = fx(`IF(D${ST}=0,0,E${ST}/D${ST})`, tot.done ? tot.on / tot.done : 0);
  sumS(10, tot.gross); sumS(12, tot.tax); sumS(13, tot.net);
  for (let c2 = 1; c2 <= 13; c2++) {
    const cell = s.getCell(ST, c2);
    cell.font = font({ bold: true }); cell.fill = solid(C.head2); cell.border = BOX; cell.alignment = c2 <= 2 ? { horizontal: 'center' } : { horizontal: 'right' };
  }
  for (const c2 of [3, 4, 5, 6]) s.getCell(ST, c2).numFmt = '#,##0';
  for (const c2 of [7, 8]) s.getCell(ST, c2).numFmt = HOURS;
  s.getCell(ST, 9).numFmt = '0%';
  for (const c2 of [10, 12, 13]) s.getCell(ST, c2).numFmt = MONEY;
  if (ranges.length) {
    s.addConditionalFormatting({ ref: `J${SR}:J${SL}`, rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FF9BC2E6' } } as unknown as ExcelJS.ConditionalFormattingRule] });
    s.addConditionalFormatting({ ref: `D${SR}:D${SL}`, rules: [{ type: 'expression', priority: 2, formulae: [`AND($C${SR}>0,$D${SR}<$C${SR}*${roundCount})`], style: { font: { color: { argb: 'FFC00000' }, bold: true } } }] });
  }
  s.getCell(ST + 2, 1).value = `※ 빨간 시행 회차 = 담당 멘티 × ${roundCount}회보다 적게 진행(보고서 등록 기준)한 멘토. 다른 멘토 진행·중도 종료가 섞여 있을 수 있어 반드시 누락은 아닙니다.`;
  s.getCell(ST + 2, 1).font = font({ size: 9, color: { argb: 'FF595959' } });
  [6, 11, 9, 9, 10, 11, 11, 12, 10, 15, 11, 12, 13].forEach((w, i) => (s.getColumn(i + 1).width = w));
  s.autoFilter = { from: { row: 4, column: 1 }, to: { row: SL, column: 13 } };

  /* ───────── 총괄 ───────── */
  const g = wb.addWorksheet('총괄', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  g.getColumn(1).width = 2;
  for (let c2 = 2; c2 <= 9; c2++) g.getColumn(c2).width = 15;
  g.getCell('B1').value = `${program.name} · ${group.name} — 멘토링 수당 산출내역`; g.getCell('B1').font = font({ bold: true, size: 15 });
  g.getCell('B2').value = `생성일 ${today} · 모든 숫자는 [회차별 상세] 시트에서 수식으로 계산됩니다. 수당은 보고서까지 등록된 회차만 계상합니다.`;
  g.getCell('B2').font = font({ size: 9, color: { argb: 'FF595959' } });
  const totalMentees = blocks.reduce((a, b) => a + b.rows.length, 0);
  const kpi: [string, string, number, string][] = [
    ['멘토', `COUNTA('멘토별 요약'!B${SR}:B${SL})`, blocks.length, '#,##0"명"'],
    ['멘티(줄)', `COUNTA(${D}!C${FIRST}:C${LAST})`, totalMentees, '#,##0"명"'],
    ['시행 회차', `${D}!${col(K.done)}${T}`, tot.done, '#,##0"회"'],
    ['온라인', `${D}!${col(K.on)}${T}`, tot.on, '#,##0"회"'],
    ['오프라인', `${D}!${col(K.off)}${T}`, tot.off, '#,##0"회"'],
    ['수당 합계', `${D}!${col(K.gross)}${T}`, tot.gross, '#,##0"원"'],
    ['원천징수', `${D}!${col(K.tax)}${T}`, tot.tax, '#,##0"원"'],
    ['실 지급액', `${D}!${col(K.net)}${T}`, tot.net, '#,##0"원"'],
  ];
  kpi.forEach(([k, f2, v, fmt], i) => {
    head(g.getCell(4, 2 + i), k);
    const cell = g.getCell(5, 2 + i);
    cell.value = fx(f2, v); cell.numFmt = fmt; cell.font = font({ bold: true, size: 13, color: { argb: C.head } });
    cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = BOX; cell.fill = solid(C.head2);
  });
  g.getRow(5).height = 30;

  g.getCell('B8').value = '방식 · 시간별 회차와 수당'; g.getCell('B8').font = font({ bold: true, size: 12 });
  ['방식', '시간', '회차 수', '시간당 단가', '수당'].forEach((t, i) => head(g.getCell(9, 2 + i), t));
  const hourSet = new Map<string, { mode: '온라인' | '오프라인'; h: number; n: number }>();
  for (const b of blocks) for (const row of b.rows) for (const sl of row.slots) {
    if ((sl.mode === '온라인' || sl.mode === '오프라인') && sl.hours !== null) {
      const k = `${sl.mode}:${sl.hours}`;
      const cur = hourSet.get(k) ?? { mode: sl.mode, h: sl.hours, n: 0 };
      cur.n += 1;
      hourSet.set(k, cur);
    }
  }
  const combos = Array.from(hourSet.values()).sort((a, b) => (a.mode === b.mode ? a.h - b.h : a.mode === '온라인' ? -1 : 1));
  let gr = 10;
  for (const cmb of combos) {
    g.getCell(gr, 2).value = cmb.mode; g.getCell(gr, 3).value = cmb.h;
    const cnt = Array.from({ length: roundCount }, (_, n) => `COUNTIFS(${D}!$${col(RC(n).mode)}$${FIRST}:$${col(RC(n).mode)}$${LAST},B${gr},${D}!$${col(RC(n).hours)}$${FIRST}:$${col(RC(n).hours)}$${LAST},C${gr})`).join('+');
    g.getCell(gr, 4).value = fx(cnt, cmb.n);
    const p = cmb.mode === '온라인' ? rates.online : rates.offline;
    g.getCell(gr, 5).value = fx(cmb.mode === '온라인' ? R.on : R.off, p);
    g.getCell(gr, 6).value = fx(`ROUND(D${gr}*C${gr}*E${gr},0)`, Math.round(cmb.n * cmb.h * p));
    for (let c2 = 2; c2 <= 6; c2++) {
      const cell = g.getCell(gr, c2);
      cell.font = font(); cell.border = BOX; cell.fill = solid(cmb.mode === '온라인' ? C.on : C.off);
      cell.alignment = c2 <= 3 ? { horizontal: 'center' } : { horizontal: 'right' };
    }
    g.getCell(gr, 3).numFmt = '0.#"시간"'; g.getCell(gr, 4).numFmt = '#,##0"회"'; g.getCell(gr, 5).numFmt = MONEY; g.getCell(gr, 6).numFmt = MONEY;
    gr += 1;
  }
  const comboEnd = gr - 1;
  g.getCell(gr, 2).value = '합계'; g.mergeCells(gr, 2, gr, 3);
  g.getCell(gr, 4).value = fx(combos.length ? `SUM(D10:D${comboEnd})` : '0', tot.done);
  g.getCell(gr, 6).value = fx(combos.length ? `SUM(F10:F${comboEnd})` : '0', combos.reduce((a, c3) => a + Math.round(c3.n * c3.h * (c3.mode === '온라인' ? rates.online : rates.offline)), 0));
  for (let c2 = 2; c2 <= 6; c2++) { const cell = g.getCell(gr, c2); cell.font = font({ bold: true }); cell.fill = solid(C.head2); cell.border = BOX; cell.alignment = { horizontal: c2 <= 3 ? 'center' : 'right' }; }
  g.getCell(gr, 4).numFmt = '#,##0"회"'; g.getCell(gr, 6).numFmt = MONEY;
  const comboTotalRow = gr;

  let rr2 = comboTotalRow + 3;
  g.getCell(rr2, 2).value = '회차별 진행 현황'; g.getCell(rr2, 2).font = font({ bold: true, size: 12 });
  rr2 += 1;
  ['회차', '온라인', '오프라인', '예정', '미시행', '다른 멘토', '수당'].forEach((t, i) => head(g.getCell(rr2, 2 + i), t));
  for (let n = 0; n < roundCount; n++) {
    const row = rr2 + 1 + n;
    const rng = `${D}!$${col(RC(n).mode)}$${FIRST}:$${col(RC(n).mode)}$${LAST}`;
    const count = (w: string) => blocks.reduce((a, b) => a + b.rows.filter((x) => x.slots[n]?.mode === w).length, 0);
    g.getCell(row, 2).value = `${n + 1}회차`;
    (['온라인', '오프라인', '예정', '미시행', '타멘토'] as const).forEach((w, i) => (g.getCell(row, 3 + i).value = fx(`COUNTIF(${rng},"${w}")`, count(w))));
    g.getCell(row, 8).value = fx(`SUM(${D}!$${col(RC(n).fee)}$${FIRST}:$${col(RC(n).fee)}$${LAST})`, roundTotals[n] ?? 0);
    [C.on, C.off, C.plan, C.none, C.other].forEach((fill, i) => (g.getCell(row, 3 + i).fill = solid(fill)));
    for (let c2 = 2; c2 <= 8; c2++) {
      const cell = g.getCell(row, c2);
      cell.font = font(); cell.border = BOX; cell.alignment = { horizontal: c2 === 2 ? 'center' : 'right' };
      if (c2 >= 3 && c2 <= 7) cell.numFmt = '#,##0"회"';
    }
    g.getCell(row, 8).numFmt = MONEY;
  }

  let vr = rr2 + roundCount + 3;
  g.getCell(vr, 2).value = '검증 — 플랫폼 기록과 대조'; g.getCell(vr, 2).font = font({ bold: true, size: 12 });
  vr += 1;
  ['항목', '플랫폼 기록', '이 표', '차이', '설명'].forEach((t, i) => head(g.getCell(vr, 2 + i), t));
  g.mergeCells(vr, 6, vr, 9);
  const checks: [string, number, string, number, string][] = [
    ['수당 합계', platformGross, `${D}!${col(K.gross)}${T}`, tot.gross, '보고서 등록 회차의 금액 스냅샷 합계. 0(초록)이면 일치, 빨간색이면 방식·시간·단가를 확인하세요.'],
    ['원천징수(참고)', platformTax, `${D}!${col(K.tax)}${T}`, tot.tax, '플랫폼은 멘티별 확정·품의 단위 과세최저한이라 이 표(멘토 합계 기준)와 다를 수 있습니다. 실제 지급은 정산·품의 화면 금액.'],
  ];
  checks.forEach(([k, pv, f2, v, desc], i) => {
    const row = vr + 1 + i;
    g.getCell(row, 2).value = k;
    g.getCell(row, 3).value = pv;
    g.getCell(row, 4).value = fx(f2, v);
    g.getCell(row, 5).value = fx(`ROUND(D${row}-C${row},0)`, Math.round(v - pv));
    g.getCell(row, 6).value = desc; g.mergeCells(row, 6, row, 9);
    for (let c2 = 2; c2 <= 9; c2++) {
      const cell = g.getCell(row, c2);
      cell.font = font(c2 === 6 ? { size: 9, color: { argb: 'FF595959' } } : {}); cell.border = BOX;
      cell.alignment = c2 === 2 ? { horizontal: 'center', vertical: 'middle' } : c2 >= 6 ? { wrapText: true, vertical: 'middle' } : { horizontal: 'right', vertical: 'middle' };
    }
    for (const c2 of [3, 4, 5]) g.getCell(row, c2).numFmt = MONEY;
    g.getRow(row).height = 32;
  });
  const okRow = vr + 1;
  g.addConditionalFormatting({ ref: `E${okRow}`, rules: [
    { type: 'expression', priority: 1, formulae: [`E${okRow}=0`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' }, bold: true } } },
    { type: 'expression', priority: 2, formulae: [`E${okRow}<>0`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } },
  ] });
  g.addConditionalFormatting({ ref: `E${okRow + 1}`, rules: [
    { type: 'expression', priority: 3, formulae: [`E${okRow + 1}<>0`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C5700' } } } },
  ] });

  // 시트 순서: 총괄 · 멘토별 요약 · 회차별 상세 · 단가표
  const order = ['총괄', '멘토별 요약', '회차별 상세', '단가표'];
  wb.worksheets.forEach((ws) => { (ws as unknown as { orderNo: number }).orderNo = order.indexOf(ws.name); });
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const contract = (program.contract_title as string | null) || program.name;
  const fileName = `멘토링 수당 산출내역_${safeName(group.name)}_${safeName(contract)}_${today.replace(/-/g, '').slice(2)}.xlsx`;
  return { ok: true, buffer, fileName, rows: totalMentees };
}
