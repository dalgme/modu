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
  const s = v == null ? '' : String(v);
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
  return ws;
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
