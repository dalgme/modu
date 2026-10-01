import * as XLSX from 'xlsx';
import { contentDisposition } from '@/lib/http/download';

/**
 * 엑셀 내보내기 공통 (P31) — 모든 다운로드가 같은 품질을 갖도록 한 곳에서:
 *  - 상단 메타(기준일·범위·필터) → 빈 줄 → 헤더 → 데이터
 *  - 헤더 행 자동 필터, 컬럼 너비(헤더/내용 길이 기준, 상한)
 *  - KST 날짜/일시 포맷, 파일명 규칙 `{행사}_{그룹|전체}_{탭}_{YYYY-MM-DD}.xlsx`
 */
export interface SheetMeta {
  기준일?: string;
  범위?: string;
  필터?: string;
  /** 추가 메타 행 (라벨, 값) */
  extra?: [string, string | number][];
  /** 자동 판정(isMoneyHeader) 외에 금액으로 취급할 헤더·항목 이름 (예: 예산 시트의 '확정'·'예상') */
  money?: string[];
}

/**
 * 금액 칸 천단위 콤마 (2026-10-01, P49) — 값은 숫자 그대로 두고 셀 서식만 `#,##0` 으로 지정한다(합계·정렬·수식 그대로 동작).
 * 금액 칸 판정은 헤더 이름 한 곳: 수당·세금·원천징수·실지급·지급총액·소득세·단가·예산·합계 등. 비율·건수·방식은 제외.
 * 정수만 서식을 붙이므로(원 단위 금액은 정수) 만족도 평균·집행률 같은 소수 값이 잘못 반올림 표시될 일이 없다.
 */
export const MONEY_FORMAT = '#,##0';
const MONEY_HEADER = /(금액|수당|세금|원천|실지급|지급액|지급총액|총지급|소득세|소득금액|단가|예산|합계|총액|세전|세후|필요경비|\(원\))/;
const NOT_MONEY_HEADER = /(율|률|%|건수|인원|방식|일자|상태|횟수)/;

export function isMoneyHeader(name: string, extra: readonly string[] = []): boolean {
  const n = name.trim();
  if (!n) return false;
  if (extra.includes(n)) return true;
  return MONEY_HEADER.test(n) && !NOT_MONEY_HEADER.test(n);
}

/**
 * 시트 전체에 금액 서식을 적용한다 — sheetWithMeta 를 쓰지 않는 시트(품의·원천세·종합리포트)도 이 함수 하나로.
 *  - 열 기준: 위쪽에서 가장 최근에 나온 글자 칸(헤더)이 금액 이름이면 그 아래 정수 칸
 *  - 행 기준: 바로 왼쪽 칸이 금액 이름인 정수 칸 (항목/값 2열 시트)
 */
export function applyMoneyFormat(ws: XLSX.WorkSheet, extra: readonly string[] = []): XLSX.WorkSheet {
  const ref = ws['!ref'];
  if (!ref) return ws;
  const range = XLSX.utils.decode_range(ref);
  const colMoney = new Map<number, boolean>();
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell) continue;
      if (cell.t === 's') {
        const text = String(cell.v ?? '').trim();
        if (text) colMoney.set(c, isMoneyHeader(text, extra));
        continue;
      }
      if (cell.t !== 'n' || typeof cell.v !== 'number' || !Number.isInteger(cell.v) || cell.z) continue;
      const left = c > range.s.c ? (ws[XLSX.utils.encode_cell({ r, c: c - 1 })] as XLSX.CellObject | undefined) : undefined;
      const leftMoney = left?.t === 's' && isMoneyHeader(String(left.v ?? ''), extra);
      if (colMoney.get(c) || leftMoney) cell.z = MONEY_FORMAT;
    }
  }
  return ws;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKst(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** ISO → 'YYYY-MM-DD' (KST). 값이 없거나 파싱 실패면 '' */
export function kstDate(iso: string | Date | null | undefined): string {
  const d = toKst(iso);
  return d ? d.toISOString().slice(0, 10) : '';
}

/** ISO → 'YYYY-MM-DD HH:mm' (KST) */
export function kstDateTime(iso: string | Date | null | undefined): string {
  const d = toKst(iso);
  return d ? d.toISOString().slice(0, 16).replace('T', ' ') : '';
}

/** ISO → 'HH:mm' (KST) */
export function kstTime(iso: string | Date | null | undefined): string {
  const d = toKst(iso);
  return d ? d.toISOString().slice(11, 16) : '';
}

/** 오늘 (KST) 'YYYY-MM-DD' */
export function kstToday(): string {
  return kstDate(new Date());
}

/** 셀 표시 길이 추정 — 한글·전각은 2칸 */
function displayWidth(v: unknown): number {
  // 정수는 천단위 콤마 서식으로 표시되므로 콤마 포함 길이로 잰다 (P49)
  const s = v == null ? '' : typeof v === 'number' && Number.isInteger(v) ? v.toLocaleString('en-US') : String(v);
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ　-〿가-힯＀-￯一-鿿]/.test(ch) ? 2 : 1;
  return w;
}

const MIN_COL = 6;
const MAX_COL = 48;

/** 파일명·시트명에 못 쓰는 문자 정리 */
export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 메타 + 헤더 + 데이터로 시트를 만든다. `rows` 의 각 원소는 header 순서의 값 배열.
 * 반환 시트는 `XLSX.utils.book_append_sheet` 로 붙이면 된다.
 */
export function sheetWithMeta(header: string[], rows: unknown[][], meta: SheetMeta = {}): XLSX.WorkSheet {
  const metaRows: (string | number)[][] = [];
  metaRows.push(['기준일', meta.기준일 ?? kstDateTime(new Date())]);
  if (meta.범위) metaRows.push(['범위', meta.범위]);
  if (meta.필터) metaRows.push(['필터', meta.필터]);
  for (const [k, v] of meta.extra ?? []) metaRows.push([k, v]);
  const headerRowIdx = metaRows.length + 1; // 0-based: 메타 + 빈 줄
  const aoa: unknown[][] = [...metaRows, [], header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 자동 필터 (헤더 행 ~ 마지막 데이터 행)
  const lastRow = headerRowIdx + Math.max(rows.length, 0);
  const lastCol = Math.max(header.length - 1, 0);
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRowIdx, c: 0 }, e: { r: lastRow, c: lastCol } }) };
  // 컬럼 너비: 헤더/내용 길이 기준 (최대 200행 샘플), 상한
  const widths = header.map((h) => displayWidth(h));
  const sample = rows.slice(0, 200);
  for (const r of sample) r.forEach((v, i) => { if (i < widths.length) widths[i] = Math.max(widths[i]!, displayWidth(v)); });
  ws['!cols'] = widths.map((w) => ({ wch: Math.min(MAX_COL, Math.max(MIN_COL, w + 2)) }));
  return applyMoneyFormat(ws, meta.money);
}

/** 시트 이름 31자 제한 + 금지문자 */
export function sheetName(name: string): string {
  return safeName(name).slice(0, 31) || '시트';
}

/** 파일명 규칙 — `{행사}_{그룹|전체}_{한국어탭}_{YYYY-MM-DD KST}.xlsx` */
export function excelFileName(program: string, scope: string | null | undefined, tabLabel: string): string {
  return `${safeName(program)}_${safeName(scope || '전체')}_${safeName(tabLabel)}_${kstToday()}.xlsx`;
}

/** 워크북 → 버퍼 */
export function workbookBuffer(wb: XLSX.WorkBook): Buffer {
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

/** xlsx 다운로드 Response (Content-Disposition UTF-8 파일명) */
export function xlsxResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
      'Cache-Control': 'private, no-store',
    },
  });
}
