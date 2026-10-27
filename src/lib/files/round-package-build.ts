import type JSZipType from 'jszip';

import { MENTOR_PACKAGE_NAME, chunkRanges, mentorChunkZipName, originalPartName, type PackageDoc, type RoundPackageManifest } from '@/lib/files/round-package-shared';

/**
 * 라운드 제출용 묶음 조립 (2026-10-27) — 브라우저에서 실행(테스트는 Node). 서버 목록(RoundPackageManifest)을 받아
 *  1) 합본마다 부품(PDF·JPG·PNG)을 순서대로 한 PDF 로 합치고
 *     한글(HWP·HWPX)은 renderHwp(브라우저 rhwp)로 쪽 이미지를 만들어 같은 PDF 에 넣는다
 *  2) 합칠 수 없는 부품(변환 실패한 한글·Word·손상·암호 PDF)은 원본을 같은 폴더에 "{합본 이름} - {설명}.{확장자}" 로 넣고 problems 에 남긴다
 *  3) 멘토별: 이름순 20명씩 "(붙임2)…(1~20번).zip" → "멘토별 멘토링 보고서 및 수당지급 서류/" 폴더 → 바깥 ZIP
 *     멘티별: "001. 이름/" 폴더들 → 바깥 ZIP
 */
export interface BuildProgress {
  done: number;
  total: number;
  phase: 'files' | 'zip';
}

export interface BuildResult {
  zip: JSZipType;
  pdfCount: number;
  problems: string[];
}

type Fetcher = (url: string) => Promise<Uint8Array>;

/** 한글 문서 한 쪽 = 이미지 + PDF 쪽 크기(pt) */
export interface RenderedPage {
  bytes: Uint8Array;
  format: 'jpg' | 'png';
  widthPt: number;
  heightPt: number;
}
export type HwpRenderer = (bytes: Uint8Array) => Promise<RenderedPage[]>;

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 24;

interface Entry {
  name: string;
  bytes: Uint8Array;
}

async function buildDoc(doc: PackageDoc, folder: string, fetchBytes: Fetcher, problems: string[], renderHwp?: HwpRenderer): Promise<Entry[]> {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const extras: Entry[] = [];
  let merged = 0;
  for (const part of doc.parts) {
    let bytes: Uint8Array;
    try {
      if (!part.url) throw new Error('주소 없음');
      bytes = await fetchBytes(part.url);
    } catch {
      problems.push(`${folder} / ${doc.name} — ${part.label}: 파일을 받지 못함`);
      continue;
    }
    if (part.kind === 'hwp' && renderHwp) {
      try {
        const pages = await renderHwp(bytes);
        for (const pg of pages) {
          const img = pg.format === 'png' ? await out.embedPng(pg.bytes) : await out.embedJpg(pg.bytes);
          out.addPage([pg.widthPt, pg.heightPt]).drawImage(img, { x: 0, y: 0, width: pg.widthPt, height: pg.heightPt });
        }
        merged += 1;
      } catch {
        extras.push({ name: originalPartName(doc.name, part.label, part.sourceName), bytes });
        problems.push(`${folder} / ${doc.name} — ${part.label}: 한글 파일을 PDF 로 바꾸지 못해(암호·배포용·손상 등) 원본을 함께 넣음`);
      }
      continue;
    }
    if (part.kind === 'other' || part.kind === 'hwp') {
      extras.push({ name: originalPartName(doc.name, part.label, part.sourceName), bytes });
      problems.push(`${folder} / ${doc.name} — ${part.label}: ${part.sourceName.split('.').pop()?.toUpperCase() ?? '원본'} 파일이라 PDF 에 합치지 못해 원본을 함께 넣음`);
      continue;
    }
    try {
      if (part.kind === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
      } else {
        const img = part.kind === 'png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const landscape = img.width > img.height;
        const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
        const scale = Math.min((pw - MARGIN * 2) / img.width, (ph - MARGIN * 2) / img.height, 1);
        const page = out.addPage([pw, ph]);
        page.drawImage(img, { x: (pw - img.width * scale) / 2, y: (ph - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
      }
      merged += 1;
    } catch {
      extras.push({ name: originalPartName(doc.name, part.label, part.sourceName), bytes });
      problems.push(`${folder} / ${doc.name} — ${part.label}: PDF 를 읽지 못해(암호·손상) 원본을 함께 넣음`);
    }
  }
  const entries: Entry[] = [];
  if (merged > 0) entries.push({ name: doc.name, bytes: await out.save() });
  return entries.concat(extras);
}

export async function assembleRoundPackage(
  manifest: RoundPackageManifest,
  fetchBytes: Fetcher,
  onProgress?: (p: BuildProgress) => void,
  opts: { concurrency?: number; renderHwp?: HwpRenderer } = {},
): Promise<BuildResult> {
  const concurrency = opts.concurrency ?? 4;
  const JSZip = (await import('jszip')).default;
  const problems: string[] = [];
  const jobs = manifest.folders.flatMap((f, fi) => f.docs.map((d) => ({ fi, folder: f.folder, doc: d })));
  const results: Entry[][] = manifest.folders.map(() => []);
  let done = 0;
  onProgress?.({ done, total: jobs.length, phase: 'files' });
  const queue = jobs.map((j, i) => ({ ...j, i }));
  const order: { fi: number; i: number; entries: Entry[] }[] = [];
  const worker = async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      const entries = await buildDoc(j.doc, j.folder, fetchBytes, problems, opts.renderHwp);
      order.push({ fi: j.fi, i: j.i, entries });
      done += 1;
      onProgress?.({ done, total: jobs.length, phase: 'files' });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  // 폴더 안 파일 순서 = 목록 순서(지급서류 → 멘티 이름순)
  for (const o of order.sort((a, b) => a.i - b.i)) results[o.fi]!.push(...o.entries);
  const pdfCount = results.flat().filter((e) => e.name.toLowerCase().endsWith('.pdf')).length;

  onProgress?.({ done, total: jobs.length, phase: 'zip' });
  const zip = new JSZip();
  const fill = (target: JSZipType, fi: number) => {
    const dir = target.folder(manifest.folders[fi]!.folder)!;
    for (const e of results[fi]!) dir.file(e.name, e.bytes);
  };
  if (manifest.kind === 'mentor') {
    const root = zip.folder(MENTOR_PACKAGE_NAME)!;
    for (const { start, end } of chunkRanges(manifest.folders.length)) {
      const inner = new JSZip();
      for (let fi = start - 1; fi < end; fi++) fill(inner, fi);
      root.file(mentorChunkZipName(start, end), await inner.generateAsync({ type: 'uint8array', compression: 'STORE' }));
    }
  } else {
    manifest.folders.forEach((_, fi) => fill(zip, fi));
  }
  return { zip, pdfCount, problems };
}
