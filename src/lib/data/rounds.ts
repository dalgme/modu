import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';
import { downloadNamesForCase } from '@/lib/files/download-name';
import type { Tables } from '@/types/database';

export type RoundRow = Tables<'mentoring_logs'>;

export interface RoundItem extends RoundRow {
  mentorName: string | null;
  photos: { id: string; url: string | null; name: string }[];
  /** 회차 보고서 파일 — createdAt = 최초 등록, updatedAt = 마지막 수정 등록(교체) */
  report: { id: string; url: string | null; name: string; createdAt: string; updatedAt: string | null } | null;
  /** 정산에 포함되어 잠김 */
  locked: boolean;
}

export const photoDocKey = (logId: string) => `mentoring_photo:${logId}`;
export const reportDocKey = (logId: string) => `mentoring_report:${logId}`;

/** 케이스의 회차 목록 (회차 번호순) + 사진·보고서 파일 signed URL */
export async function listRounds(caseId: string): Promise<RoundItem[]> {
  const supabase = createClient();
  const { data: logs } = await supabase.from('mentoring_logs').select('*').eq('case_id', caseId).order('round_no');
  const rows = logs ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const keys = [...ids.map(photoDocKey), ...ids.map(reportDocKey)];
  const mentorIds = Array.from(new Set(rows.map((r) => r.mentor_id)));
  const [{ data: docs }, { data: mentors }] = await Promise.all([
    supabase.from('documents').select('id, doc_key, doc_name, storage_path, created_at, updated_at').eq('case_id', caseId).in('doc_key', keys),
    supabase.from('users').select('id, name').in('id', mentorIds),
  ]);
  const mentorName = new Map((mentors ?? []).map((m) => [m.id, m.name]));
  // 받는 파일 이름 = "멘토명-멘티명-N회차 보고서" (2026-09-30 파일명 규칙)
  const dlNames = await downloadNamesForCase(caseId);
  const out: RoundItem[] = [];
  for (const r of rows) {
    const photoDocs = (docs ?? []).filter((d) => d.doc_key === photoDocKey(r.id));
    const reportDoc = (docs ?? []).find((d) => d.doc_key === reportDocKey(r.id)) ?? null;
    const photos = await Promise.all(
      photoDocs.map(async (d) => ({ id: d.id, name: d.doc_name, url: await createCaseScopedSignedUrl('photos', caseId, d.storage_path, 600) })),
    );
    const report = reportDoc
      ? { id: reportDoc.id, name: reportDoc.doc_name, url: await createCaseScopedSignedUrl('documents', caseId, reportDoc.storage_path, 600, dlNames.get(reportDoc.id) ?? reportDoc.doc_name), createdAt: reportDoc.created_at, updatedAt: reportDoc.updated_at ?? null }
      : null;
    out.push({ ...r, mentorName: mentorName.get(r.mentor_id) ?? null, photos, report, locked: r.settlement_id !== null });
  }
  return out;
}

/** 케이스의 승인된 추가 회차 합 + 대기 중 요청 수 */
export async function getRoundAllowance(caseId: string): Promise<{ approvedExtra: number; pendingRequests: number }> {
  const admin = createAdminClient();
  const { data } = await admin.from('round_extension_requests').select('extra_rounds, status').eq('case_id', caseId);
  let approvedExtra = 0;
  let pendingRequests = 0;
  for (const r of data ?? []) {
    if (r.status === 'approved') approvedExtra += r.extra_rounds;
    if (r.status === 'pending') pendingRequests += 1;
  }
  return { approvedExtra, pendingRequests };
}

export async function getObservationReport(caseId: string): Promise<Tables<'observation_reports'> | null> {
  const supabase = createClient();
  const { data } = await supabase.from('observation_reports').select('*').eq('case_id', caseId).maybeSingle();
  return data ?? null;
}

export interface ObservationFileInfo {
  id: string;
  name: string;
  url: string | null;
  /** 최초 업로드 일시 — 교체해도 유지(같은 행을 update) */
  createdAt: string;
  /** 마지막 수정(교체) 일시 */
  updatedAt: string;
}

export async function getObservationReportFile(caseId: string): Promise<ObservationFileInfo | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('id, doc_name, storage_path, created_at, updated_at')
    .eq('case_id', caseId)
    .eq('doc_key', 'observation_report')
    .maybeSingle();
  if (!data) return null;
  const dlNames = await downloadNamesForCase(caseId);
  return {
    id: data.id,
    name: data.doc_name,
    url: await createCaseScopedSignedUrl('documents', caseId, data.storage_path, 600, dlNames.get(data.id) ?? data.doc_name),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export interface ObservationHistoryItem {
  kind: 'upload' | 'replace' | 'delete';
  at: string;
  fileName: string | null;
  actorName: string | null;
  /** 운영사가 멘토 화면 대행으로 처리 */
  viaViewAs: boolean;
}

/**
 * 관찰의견서 파일 변경 이력 (2026-09-30) — 감사 로그 observation.upload/replace/delete. 최신순.
 * 호출부가 이미 이 케이스 열람 권한을 확인한 뒤 부른다(서비스롤 조회).
 */
export async function listObservationHistory(caseId: string): Promise<ObservationHistoryItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('audit_logs')
    .select('action, created_at, metadata, actor_id')
    .eq('entity_type', 'cases')
    .eq('entity_id', caseId)
    .in('action', ['observation.upload', 'observation.replace', 'observation.delete'])
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = data ?? [];
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
  const { data: users } = actorIds.length ? await admin.from('users').select('id, name').in('id', actorIds) : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as { file_name?: string; via?: string };
    return {
      kind: r.action === 'observation.replace' ? 'replace' : r.action === 'observation.delete' ? 'delete' : 'upload',
      at: r.created_at,
      fileName: meta.file_name ?? null,
      actorName: r.actor_id ? (nameById.get(r.actor_id) ?? null) : null,
      viaViewAs: meta.via === 'view-as',
    };
  });
}

export async function listPendingRequestsForCase(caseId: string): Promise<{
  extensions: Tables<'round_extension_requests'>[];
  withdrawals: Tables<'mentor_withdrawal_requests'>[];
}> {
  const supabase = createClient();
  const [{ data: ext }, { data: wd }] = await Promise.all([
    supabase.from('round_extension_requests').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
    supabase.from('mentor_withdrawal_requests').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
  ]);
  return { extensions: ext ?? [], withdrawals: wd ?? [] };
}
