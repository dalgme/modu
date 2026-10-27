/**
 * 라운드 제출용 묶음 (2026-10-27) — 이름 규칙·정렬·묶음 단위. 서버(목록)·브라우저(합치기·압축) 공용 순수 함수.
 *
 *  A) 멘토별: "멘토별 멘토링 보고서 및 수당지급 서류.zip"
 *       └ 멘토별 멘토링 보고서 및 수당지급 서류/
 *            └ (붙임2)멘토링 보고서 및 관찰의견서(1~20번).zip   ← 멘토 이름순 20명씩
 *                 └ 강석우/ 1.수당지급서류 일체_강석우.pdf
 *                           책임멘토 멘토링 보고서 및 관찰 의견서(강석우멘토-남준현멘티).pdf
 *  B) 멘티별: "(멘티별)멘토링 보고서_별첨자료 삽입.zip"
 *       └ 001. 남준현/ 책임멘토 멘토링 보고서 및 관찰 의견서(강석우멘토-남준현멘티).pdf
 *
 * "책임멘토 멘토링 보고서 및 관찰 의견서(…)" = 그 멘토가 진행한 회차 보고서(회차순) + 관찰의견서를 한 PDF 로 합친 것.
 * 관찰의견서가 없으면(불필요 그룹·미제출·교체 전 멘토) "책임멘토 멘토링 보고서(…)".
 * 한글(HWP·HWPX)은 브라우저에서 rhwp 로 쪽 이미지를 만들어 합친다(hwp-render.ts). 실패하면 원본을 함께 넣는다.
 */

export const MENTOR_PACKAGE_NAME = '멘토별 멘토링 보고서 및 수당지급 서류';
export const MENTEE_PACKAGE_NAME = '(멘티별)멘토링 보고서_별첨자료 삽입';
export const MENTOR_CHUNK = 20;

/** hwp = 한글 HWP·HWPX — 브라우저에서 rhwp 로 페이지 이미지를 만들어 합친다 */
export type PartKind = 'pdf' | 'jpg' | 'png' | 'hwp' | 'other';

/** PDF 로 합칠 수 있는 형식인지 (확장자·MIME) */
export function partKindOf(name: string, mime?: string | null): PartKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const m = (mime ?? '').toLowerCase();
  if (ext === 'pdf' || m === 'application/pdf') return 'pdf';
  if (ext === 'jpg' || ext === 'jpeg' || m === 'image/jpeg') return 'jpg';
  if (ext === 'png' || m === 'image/png') return 'png';
  if (ext === 'hwp' || ext === 'hwpx' || m === 'application/x-hwp' || m === 'application/haansofthwp' || m === 'application/vnd.hancom.hwpx') return 'hwp';
  return 'other';
}

/** 파일·폴더 이름에 못 쓰는 글자 정리 */
export function cleanName(s: string | null | undefined, fallback: string): string {
  const v = (s ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return v || fallback;
}

export function pairPdfName(mentorName: string, menteeName: string, withObservation: boolean): string {
  const pair = `${cleanName(mentorName, '멘토')}멘토-${cleanName(menteeName, '멘티')}멘티`;
  return withObservation ? `책임멘토 멘토링 보고서 및 관찰 의견서(${pair}).pdf` : `책임멘토 멘토링 보고서(${pair}).pdf`;
}

export function paymentPdfName(mentorName: string): string {
  return `1.수당지급서류 일체_${cleanName(mentorName, '멘토')}.pdf`;
}

/** 멘토 20명 묶음 ZIP 이름 — 마지막 묶음은 실제 인원까지 (예: 41~53번) */
export function mentorChunkZipName(start: number, end: number): string {
  return `(붙임2)멘토링 보고서 및 관찰의견서(${start}~${end}번).zip`;
}

export function chunkRanges(total: number, size = MENTOR_CHUNK): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (let s = 1; s <= total; s += size) out.push({ start: s, end: Math.min(s + size - 1, total) });
  return out;
}

/** 멘티 폴더 "001. 이름" — 100명 이상이면 자릿수를 늘린다 */
export function menteeFolderName(index: number, total: number, name: string): string {
  const width = Math.max(3, String(total).length);
  return `${String(index).padStart(width, '0')}. ${cleanName(name, '멘티')}`;
}

/** 같은 이름이 여러 번 나오면 뒤에 (2)(3) — 폴더 충돌 방지 */
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = seen.get(n) ?? 0;
    seen.set(n, k + 1);
    return k === 0 ? n : `${n}(${k + 1})`;
  });
}

/** 고유번호 자연 정렬 (A-2 < A-10), 없는 값은 뒤로 */
export function compareExternalNo(a: string | null | undefined, b: string | null | undefined): number {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return x.localeCompare(y, 'ko', { numeric: true });
}

/** 원본을 그대로 넣을 때 이름: "{합본 이름 앞부분} - {설명}.{원래 확장자}" */
export function originalPartName(pdfName: string, label: string, sourceName: string): string {
  const base = pdfName.replace(/\.pdf$/i, '');
  const ext = (sourceName.split('.').pop() ?? '').toLowerCase();
  return `${base} - ${cleanName(label, '원본')}${ext && ext !== sourceName.toLowerCase() ? `.${ext}` : ''}`;
}

/* ── 서버 → 브라우저 목록 ──────────────────────────────────────────────── */

export interface PackagePart {
  /** "1회차 보고서" · "관찰의견서" · 지급서류 파일명 */
  label: string;
  sourceName: string;
  kind: PartKind;
  url: string;
}

export interface PackageDoc {
  /** 합본 PDF 이름 */
  name: string;
  parts: PackagePart[];
}

export interface PackageFolder {
  folder: string;
  docs: PackageDoc[];
}

export interface RoundPackageManifest {
  kind: 'mentor' | 'mentee';
  groupName: string;
  zipName: string;
  /** mentor: 이름순 멘토 폴더(묶음은 브라우저가 20명씩) · mentee: 번호 붙은 멘티 폴더 */
  folders: PackageFolder[];
  /** 안내 — 지급서류가 없는 멘토, 보고서가 없는 멘티 등 */
  notes: string[];
}
