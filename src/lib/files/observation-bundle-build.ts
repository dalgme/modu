import type JSZipType from 'jszip';

import { observationFileName, type BlindStatus, type ObservationBundleItem, type ObservationBundleManifest } from '@/lib/files/observation-redact-shared';

/**
 * 관찰의견서 묶음 조립 (2026-11-17) — 브라우저에서 실행(테스트는 Node, 가리기 함수는 주입).
 * 목록 순서대로 사본을 받아 "운영기관" 칸을 가린 PDF 로 만들고 "001. …pdf" 이름으로 한 폴더에 넣는다.
 * 가리지 못한 파일은 이름 끝에 (블라인드 미적용)/(블라인드 일부 확인 필요)를 붙이고 결과 목록에 남긴다.
 */
export interface RedactorOutcome {
  pdf: Uint8Array;
  status: BlindStatus;
}
export interface Redactors {
  pdf: (bytes: Uint8Array) => Promise<RedactorOutcome>;
  hwp: (bytes: Uint8Array) => Promise<RedactorOutcome>;
}

export interface ObservationBuildResult {
  zip: JSZipType;
  counts: Record<BlindStatus, number>;
  /** 확인이 필요한 파일: 이름 + 이유 */
  problems: { name: string; reason: string }[];
}

function extOf(name: string): string {
  const e = (name.split('.').pop() ?? '').toLowerCase();
  return e && e !== name.toLowerCase() ? e : 'bin';
}

async function one(item: ObservationBundleItem, fetchBytes: (url: string) => Promise<Uint8Array>, redact: Redactors): Promise<{ bytes: Uint8Array; status: BlindStatus; ext: string; reason?: string }> {
  const bytes = await fetchBytes(item.url);
  if (item.kind === 'other') return { bytes, status: 'none', ext: extOf(item.sourceName), reason: `${extOf(item.sourceName).toUpperCase()} 파일이라 PDF 로 바꾸지 못해 원본을 넣음` };
  try {
    const r = await (item.kind === 'hwp' ? redact.hwp(bytes) : redact.pdf(bytes));
    const reason =
      r.status === 'none'
        ? '“운영기관” 칸을 찾지 못함(스캔 이미지·표가 아닌 형식·다른 항목명 등) — 가리지 않은 파일'
        : r.status === 'partial'
          ? '“운영기관”이 여러 곳 있어 일부만 가림'
          : undefined;
    return { bytes: r.pdf, status: r.status, ext: 'pdf', reason };
  } catch {
    if (item.kind === 'pdf') return { bytes, status: 'none', ext: 'pdf', reason: 'PDF 를 읽지 못함(암호·손상) — 원본을 넣음' };
    return { bytes, status: 'none', ext: extOf(item.sourceName), reason: '한글 파일을 PDF 로 바꾸지 못함(암호·배포용·손상) — 원본을 넣음' };
  }
}

export async function assembleObservationBundle(
  manifest: ObservationBundleManifest,
  fetchBytes: (url: string) => Promise<Uint8Array>,
  redact: Redactors,
  onProgress?: (done: number, total: number) => void,
): Promise<ObservationBuildResult> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const dir = zip.folder(manifest.base)!;
  const counts: Record<BlindStatus, number> = { full: 0, partial: 0, none: 0 };
  const problems: ObservationBuildResult['problems'] = [];
  const total = manifest.items.length;
  onProgress?.(0, total);
  // 한 번에 하나씩 — 한글 변환기(rhwp)는 한 줄로만 돌고, 큰 쪽 그림이 메모리를 많이 쓴다
  for (let i = 0; i < total; i++) {
    const item = manifest.items[i]!;
    let r: Awaited<ReturnType<typeof one>> | null = null;
    try {
      r = await one(item, fetchBytes, redact);
    } catch {
      const name = observationFileName(i + 1, total, item.mentorName, item.menteeName, manifest.order, 'none');
      problems.push({ name, reason: '파일을 받지 못함 — 묶음에 넣지 못함' });
      counts.none += 1;
      onProgress?.(i + 1, total);
      continue;
    }
    const name = observationFileName(i + 1, total, item.mentorName, item.menteeName, manifest.order, r.status, r.ext);
    dir.file(name, r.bytes);
    counts[r.status] += 1;
    if (r.reason) problems.push({ name, reason: r.reason });
    onProgress?.(i + 1, total);
  }
  return { zip, counts, problems };
}
