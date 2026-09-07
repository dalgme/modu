import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';
import { isWebPreviewable } from '@/lib/utils/file-type';
import type { Tables } from '@/types/database';

export type MentoringLogRow = Tables<'mentoring_logs'>;

/** 케이스의 멘토링 일지(회차) 목록 — 방문일 오름차순(1회차 → N회차). */
export async function listMentoringLogs(caseId: string): Promise<MentoringLogRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('mentoring_logs')
    .select('*')
    .eq('case_id', caseId)
    .order('visited_at', { ascending: true })
    .order('created_at', { ascending: true });
  return data ?? [];
}

/**
 * 여러 케이스의 멘토링 일지를 케이스별로 묶어 반환 (열람 허브용).
 * 케이스마다 방문일 오름차순(1회차 → N회차). 진흥원·넥스트랩 '멘토링 일지 열람' 화면에서
 * 멘티기업별 회차를 한 번에 나열하기 위한 배치 조회(케이스별 개별 조회 N+1 방지).
 */
export async function listMentoringLogsByCases(
  caseIds: string[],
): Promise<Map<string, MentoringLogRow[]>> {
  const byCase = new Map<string, MentoringLogRow[]>();
  if (caseIds.length === 0) return byCase;
  const supabase = createClient();
  const { data } = await supabase
    .from('mentoring_logs')
    .select('*')
    .in('case_id', caseIds)
    .order('visited_at', { ascending: true })
    .order('created_at', { ascending: true });
  for (const row of data ?? []) {
    const arr = byCase.get(row.case_id);
    if (arr) arr.push(row);
    else byCase.set(row.case_id, [row]);
  }
  return byCase;
}

/** 케이스의 멘토링 현장 사진 열람용 signed URL 목록 (doc_key=mentoring_photo). */
export async function getMentoringPhotoUrls(caseId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', 'mentoring_photo')
    .order('created_at', { ascending: true });
  const urls = await Promise.all(
    (data ?? []).map((d) => createCaseScopedSignedUrl('photos', caseId, d.storage_path, 600)),
  );
  return urls.filter((u): u is string => !!u);
}

/** 회차(log)별 사진 doc_key */
export const mentoringPhotoDocKey = (logId: string) => `mentoring_photo:${logId}`;

/**
 * 특정 회차(log)의 현장사진 storage 경로 목록.
 *  - 신규: doc_key=`mentoring_photo:{logId}` 로 회차에 태깅된 사진
 *  - 레거시(무태깅 doc_key='mentoring_photo'): 등록(created_at) 순서로 회차에 자동 배분.
 *    (제출 시 사진이 해당 회차 log 직전에 등록되던 순서를 이용 — 이전 회차 log 시각 초과 ~ 이번 회차 log 시각 이하)
 */
export async function getMentoringPhotoPathsByLog(
  caseId: string,
  logId: string,
): Promise<string[]> {
  const admin = createAdminClient();
  const { data: tagged } = await admin
    .from('documents')
    .select('storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', mentoringPhotoDocKey(logId))
    .order('created_at', { ascending: true });
  if (tagged && tagged.length > 0) return tagged.map((d) => d.storage_path);

  // 레거시 무태깅 사진 배분
  const [{ data: logs }, { data: photos }] = await Promise.all([
    admin
      .from('mentoring_logs')
      .select('id, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true }),
    admin
      .from('documents')
      .select('storage_path, created_at')
      .eq('case_id', caseId)
      .eq('doc_key', 'mentoring_photo')
      .order('created_at', { ascending: true }),
  ]);
  if (!logs || !photos || photos.length === 0) return [];
  const idx = logs.findIndex((l) => l.id === logId);
  if (idx < 0) return [];
  const prevCreated = idx > 0 ? logs[idx - 1]!.created_at : null;
  const thisCreated = logs[idx]!.created_at;
  const isLast = idx === logs.length - 1;
  return photos
    .filter((p) => {
      const after = prevCreated === null ? true : p.created_at > prevCreated;
      const before = isLast ? true : p.created_at <= thisCreated;
      return after && before;
    })
    .map((p) => p.storage_path);
}

/** 특정 회차(log)의 현장사진 열람용 signed URL 목록 */
export async function getMentoringPhotoUrlsByLog(
  caseId: string,
  logId: string,
): Promise<string[]> {
  const paths = await getMentoringPhotoPathsByLog(caseId, logId);
  const urls = await Promise.all(
    paths.map((p) => createCaseScopedSignedUrl('photos', caseId, p, 600)),
  );
  return urls.filter((u): u is string => !!u);
}

/**
 * 케이스별 멘토링 회차 수 (웹작성 일지 + 업로드한 완성본 보고서 합계).
 * 대시보드 '컨설팅' 열에서 진행 회차 평가용.
 */
export async function getMentoringRoundCounts(caseIds: string[]): Promise<Map<string, number>> {
  if (caseIds.length === 0) return new Map();
  const admin = createAdminClient();
  const [logs, reports] = await Promise.all([
    admin.from('mentoring_logs').select('case_id').in('case_id', caseIds),
    admin
      .from('documents')
      .select('case_id')
      .eq('doc_key', 'mentoring_report')
      .in('case_id', caseIds),
  ]);
  const m = new Map<string, number>();
  for (const r of logs.data ?? []) {
    if (r.case_id) m.set(r.case_id, (m.get(r.case_id) ?? 0) + 1);
  }
  for (const r of reports.data ?? []) {
    if (r.case_id) m.set(r.case_id, (m.get(r.case_id) ?? 0) + 1);
  }
  return m;
}

/** 케이스에 첨부된 '멘토링 보고서 완성본' 파일 (doc_key=mentoring_report) */
export const MENTORING_REPORT_DOC_KEY = 'mentoring_report';

export interface AttachedReportFile {
  id: string;
  name: string;
  /** 브라우저 열람용 signed URL */
  url: string | null;
  /** 다운로드 강제 signed URL */
  downloadUrl: string | null;
  /** PDF 여부 — 컨설팅 보고서 '병합' 대상은 PDF 뿐(비-PDF 는 보기/다운로드만) */
  isPdf: boolean;
  /** 웹 인라인 미리보기 가능 여부(PDF·이미지만 true) */
  previewable: boolean;
  createdAt: string;
}

/** 첨부된 멘토링 보고서 완성본 파일 목록 (열람·다운로드 signed URL 포함) */
export async function listMentoringReportFiles(caseId: string): Promise<AttachedReportFile[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('id, doc_name, storage_path, created_at, mime_type')
    .eq('case_id', caseId)
    .eq('doc_key', MENTORING_REPORT_DOC_KEY)
    .order('created_at', { ascending: true });
  const rows = data ?? [];
  const [viewUrls, downloadUrls] = await Promise.all([
    Promise.all(rows.map((d) => createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600))),
    Promise.all(
      rows.map((d) =>
        createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600, d.doc_name || true),
      ),
    ),
  ]);
  return rows.map((d, i) => ({
    id: d.id,
    name: d.doc_name ?? '멘토링 보고서',
    url: viewUrls[i] ?? null,
    downloadUrl: downloadUrls[i] ?? null,
    isPdf: (d.mime_type ?? '').toLowerCase().includes('pdf'),
    previewable: isWebPreviewable(d.mime_type, d.storage_path),
    createdAt: d.created_at,
  }));
}
