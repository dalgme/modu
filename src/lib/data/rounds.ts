import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';
import type { Tables } from '@/types/database';

export type RoundRow = Tables<'mentoring_logs'>;

export interface RoundItem extends RoundRow {
  mentorName: string | null;
  photos: { id: string; url: string | null; name: string }[];
  report: { id: string; url: string | null; name: string } | null;
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
    supabase.from('documents').select('id, doc_key, doc_name, storage_path').eq('case_id', caseId).in('doc_key', keys),
    supabase.from('users').select('id, name').in('id', mentorIds),
  ]);
  const mentorName = new Map((mentors ?? []).map((m) => [m.id, m.name]));
  const out: RoundItem[] = [];
  for (const r of rows) {
    const photoDocs = (docs ?? []).filter((d) => d.doc_key === photoDocKey(r.id));
    const reportDoc = (docs ?? []).find((d) => d.doc_key === reportDocKey(r.id)) ?? null;
    const photos = await Promise.all(
      photoDocs.map(async (d) => ({ id: d.id, name: d.doc_name, url: await createCaseScopedSignedUrl('photos', caseId, d.storage_path, 600) })),
    );
    const report = reportDoc
      ? { id: reportDoc.id, name: reportDoc.doc_name, url: await createCaseScopedSignedUrl('documents', caseId, reportDoc.storage_path, 600, reportDoc.doc_name) }
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

export async function getObservationReportFile(caseId: string): Promise<{ id: string; name: string; url: string | null } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('id, doc_name, storage_path')
    .eq('case_id', caseId)
    .eq('doc_key', 'observation_report')
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.doc_name, url: await createCaseScopedSignedUrl('documents', caseId, data.storage_path, 600, data.doc_name) };
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
