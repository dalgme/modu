import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';
import type { Tables } from '@/types/database';
import type { SettlementLine } from '@/lib/settlement/compute';
import { mentorsMissingPaymentDocs } from '@/lib/data/mentors';

export type SettlementRow = Tables<'settlements'>;
export type BatchRow = Tables<'settlement_batches'>;

export interface SettlementItem extends SettlementRow {
  mentorName: string;
  businessName: string;
  ownerName: string;
  supportTypeName: string | null;
  batchTitle: string | null;
  batchStatus: string | null;
  linesParsed: SettlementLine[];
  roundCount: number;
  /** 멘토 지급서류(3종) 미수령 */
  mentorDocsMissing: boolean;
}

export interface BatchItem extends BatchRow {
  itemCount: number;
  confirmedByName: string | null;
  createdByName: string | null;
}

function parseLines(v: unknown): SettlementLine[] {
  return Array.isArray(v) ? (v as SettlementLine[]) : [];
}

/** 행사 범위 정산 건 목록 (스태프). 코드에서 program_id 로 강제. */
export async function listSettlements(filters: { programId: string; supportTypeId?: string; status?: string[]; mentorId?: string; caseId?: string; batchId?: string }): Promise<SettlementItem[]> {
  const supabase = createClient();
  let q = supabase.from('settlements').select('*').eq('program_id', filters.programId).order('confirmed_at', { ascending: false });
  if (filters.status && filters.status.length) q = q.in('status', filters.status);
  if (filters.mentorId) q = q.eq('mentor_id', filters.mentorId);
  if (filters.caseId) q = q.eq('case_id', filters.caseId);
  if (filters.batchId) q = q.eq('batch_id', filters.batchId);
  const { data } = await q;
  return enrich(data ?? [], filters.supportTypeId);
}

/** 멘토 본인 정산 목록 (RLS: mentor_id = auth.uid()) */
export async function listMentorSettlements(mentorId: string, programId: string): Promise<SettlementItem[]> {
  const supabase = createClient();
  const { data } = await supabase.from('settlements').select('*').eq('mentor_id', mentorId).eq('program_id', programId).neq('status', 'canceled').order('confirmed_at', { ascending: false });
  return enrich(data ?? []);
}

export async function listCaseSettlements(caseId: string): Promise<SettlementItem[]> {
  const supabase = createClient();
  const { data } = await supabase.from('settlements').select('*').eq('case_id', caseId).order('created_at', { ascending: false });
  return enrich(data ?? []);
}

async function enrich(rows: SettlementRow[], supportTypeId?: string): Promise<SettlementItem[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const caseIds = Array.from(new Set(rows.map((r) => r.case_id)));
  const mentorIds = Array.from(new Set(rows.map((r) => r.mentor_id)));
  const batchIds = Array.from(new Set(rows.map((r) => r.batch_id).filter((x): x is string => !!x)));
  const [{ data: cases }, { data: users }, { data: batches }] = await Promise.all([
    admin.from('cases').select('id, business_name, owner_name, support_type_id, support_types(name)').in('id', caseIds),
    admin.from('users').select('id, name').in('id', mentorIds),
    batchIds.length ? admin.from('settlement_batches').select('id, title, status').in('id', batchIds) : Promise.resolve({ data: [] as { id: string; title: string; status: string }[] }),
  ]);
  const caseMap = new Map((cases ?? []).map((c) => [c.id, c]));
  const userMap = new Map((users ?? []).map((u) => [u.id, u.name]));
  const batchMap = new Map((batches ?? []).map((b) => [b.id, b]));
  const programId = rows[0]!.program_id;
  const missingDocs = await mentorsMissingPaymentDocs(programId, mentorIds);
  const out: SettlementItem[] = [];
  for (const r of rows) {
    const c = caseMap.get(r.case_id);
    if (supportTypeId && c?.support_type_id !== supportTypeId) continue;
    const st = (c?.support_types as unknown as { name: string } | null) ?? null;
    const b = r.batch_id ? batchMap.get(r.batch_id) : undefined;
    const lines = parseLines(r.lines);
    out.push({
      ...r,
      mentorName: userMap.get(r.mentor_id) ?? '-',
      businessName: c?.business_name ?? '-',
      ownerName: c?.owner_name ?? '-',
      supportTypeName: st?.name ?? null,
      batchTitle: b?.title ?? null,
      batchStatus: b?.status ?? null,
      linesParsed: lines,
      roundCount: lines.reduce((s, l) => s + l.count, 0),
      mentorDocsMissing: missingDocs.has(r.mentor_id),
    });
  }
  return out;
}

export async function listBatches(programId: string, status?: string[]): Promise<BatchItem[]> {
  const supabase = createClient();
  let q = supabase.from('settlement_batches').select('*').eq('program_id', programId).order('created_at', { ascending: false });
  if (status && status.length) q = q.in('status', status);
  const { data } = await q;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const ids = rows.map((b) => b.id);
  const userIds = Array.from(new Set(rows.flatMap((b) => [b.created_by, b.confirmed_by]).filter((x): x is string => !!x)));
  const [{ data: items }, { data: users }] = await Promise.all([
    admin.from('settlements').select('batch_id').in('batch_id', ids).neq('status', 'canceled'),
    userIds.length ? admin.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const counts = new Map<string, number>();
  for (const s of items ?? []) if (s.batch_id) counts.set(s.batch_id, (counts.get(s.batch_id) ?? 0) + 1);
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));
  return rows.map((b) => ({
    ...b,
    itemCount: counts.get(b.id) ?? 0,
    createdByName: b.created_by ? (names.get(b.created_by) ?? null) : null,
    confirmedByName: b.confirmed_by ? (names.get(b.confirmed_by) ?? null) : null,
  }));
}

export async function getBatch(batchId: string, programId: string): Promise<{ batch: BatchItem; items: SettlementItem[] } | null> {
  const list = await listBatches(programId);
  const batch = list.find((b) => b.id === batchId);
  if (!batch) return null;
  const items = await listSettlements({ programId, batchId });
  return { batch, items };
}

/** 정산서 PDF (케이스별 최신 1건 또는 전체) */
export async function listStatementFiles(caseId: string): Promise<{ id: string; name: string; url: string | null; createdAt: string }[]> {
  const supabase = createClient();
  const { data } = await supabase.from('documents').select('id, doc_name, storage_path, created_at').eq('case_id', caseId).eq('doc_key', 'settlement_statement').order('created_at', { ascending: false });
  const out = [];
  for (const d of data ?? []) {
    out.push({ id: d.id, name: d.doc_name, createdAt: d.created_at, url: await createCaseScopedSignedUrl('documents', caseId, d.storage_path, 600, d.doc_name) });
  }
  return out;
}

export { SETTLEMENT_STATUS_LABELS, BATCH_STATUS_LABELS } from '@/lib/settlement/labels';
