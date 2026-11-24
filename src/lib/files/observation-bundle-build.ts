import type JSZipType from 'jszip';

import { BLIND_CHECK_LIST_NAME, blindCheckListText, observationFileName, type BlindStatus, type ObservationBundleItem, type ObservationBundleManifest } from '@/lib/files/observation-redact-shared';

/**
 * 관찰의견서 묶음 조립 (2026-11-17, 11-18 원본 묶음 추가) — 브라우저에서 실행(테스트는 Node, 처리 함수는 주입).
 * 목록 순서대로 파일을 받아 "001. …pdf" 이름으로 한 폴더에 넣는다.
 *  - blind: "운영기관"·"책임멘토명" 칸을 가린 PDF. 파일 이름·번호는 원본 묶음과 같다(2026-11-24). 가리지 못했거나 일부만 가린 파일은
 *    이름을 바꾸지 않고 problems(결과 창)와 ZIP 맨 위 "블라인드 확인 필요 목록.txt" 로 알린다
 *  - original: PDF 는 받은 그대로, 한글은 PDF 로만 바꾼다(가림 없음). 바꾸지 못한 파일은 원본을 넣고 알린다
 */
export interface RedactorOutcome {
  pdf: Uint8Array;
  status: BlindStatus;
}
export interface Redactors {
  pdf: (bytes: Uint8Array) => Promise<RedactorOutcome>;
  hwp: (bytes: Uint8Array) => Promise<RedactorOutcome>;
}

/** 원본 묶음 처리 — PDF 그대로, 한글만 PDF 로 */
export function originalProcessors(hwpToPdf: (bytes: Uint8Array) => Promise<Uint8Array>): Redactors {
  return {
    pdf: async (bytes) => ({ pdf: bytes, status: 'full' }),
    hwp: async (bytes) => ({ pdf: await hwpToPdf(bytes), status: 'full' }),
  };
}

export interface ObservationProblem {
  name: string;
  reason: string;
  /** 블라인드 결과(일부 확인 필요·미적용) — 결과 창 집계·확인 목록 */
  status?: BlindStatus;
  /**
   * 직접 가리기(블라인드 묶음의 PDF 만) — 지금 넣은 PDF 와, 다 가렸을 때 바꿀 이름.
   * 결과 창에서 사람이 상자를 그려 가리면 ZIP 안의 name 을 fixedName 으로 바꿔 넣는다.
   */
  fix?: { pdf: Uint8Array; fixedName: string };
}

export interface ObservationBuildResult {
  zip: JSZipType;
  counts: Record<BlindStatus, number>;
  /** 확인이 필요한 파일: 이름 + 이유 */
  problems: ObservationProblem[];
}

function extOf(name: string): string {
  const e = (name.split('.').pop() ?? '').toLowerCase();
  return e && e !== name.toLowerCase() ? e : 'bin';
}

async function one(item: ObservationBundleItem, fetchBytes: (url: string) => Promise<Uint8Array>, redact: Redactors, blind: boolean): Promise<{ bytes: Uint8Array; status: BlindStatus; ext: string; reason?: string }> {
  const bytes = await fetchBytes(item.url);
  if (item.kind === 'other') return { bytes, status: 'none', ext: extOf(item.sourceName), reason: `${extOf(item.sourceName).toUpperCase()} 파일이라 PDF 로 바꾸지 못해 원본을 넣음` };
  try {
    const r = await (item.kind === 'hwp' ? redact.hwp(bytes) : redact.pdf(bytes));
    const reason = !blind
      ? undefined
      : r.status === 'none'
        ? '“운영기관”·“책임멘토명” 칸을 찾지 못함(글자 인식으로도 못 읽은 스캔·표가 아닌 형식·다른 항목명 등) — 가리지 않은 파일'
        : r.status === 'partial'
          ? '두 항목 중 일부만 가림(한 항목을 찾지 못했거나 여러 곳에 있음) — 열어서 확인'
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
      r = await one(item, fetchBytes, redact, manifest.mode === 'blind');
    } catch {
      const name = observationFileName(i + 1, total, item.mentorName, item.menteeName, manifest.order, manifest.mode, 'none');
      problems.push({ name, reason: '파일을 받지 못함 — 묶음에 넣지 못함', status: 'none' });
      counts.none += 1;
      onProgress?.(i + 1, total);
      continue;
    }
    const name = observationFileName(i + 1, total, item.mentorName, item.menteeName, manifest.order, manifest.mode, r.status, r.ext);
    dir.file(name, r.bytes);
    counts[r.status] += 1;
    if (r.reason) {
      const fixable = manifest.mode === 'blind' && r.ext === 'pdf' && r.status !== 'full';
      problems.push({ name, reason: r.reason, status: r.status, fix: fixable ? { pdf: r.bytes, fixedName: observationFileName(i + 1, total, item.mentorName, item.menteeName, manifest.order, manifest.mode, 'full', 'pdf') } : undefined });
    }
    onProgress?.(i + 1, total);
  }
  // 블라인드: 확인이 필요한 파일 목록을 ZIP 맨 위(폴더 밖)에 — 제출용 폴더는 그대로 두고 담당자가 열어 볼 목록
  if (manifest.mode === 'blind' && problems.length > 0) zip.file(BLIND_CHECK_LIST_NAME, blindCheckListText(manifest.base, problems));
  return { zip, counts, problems };
}
