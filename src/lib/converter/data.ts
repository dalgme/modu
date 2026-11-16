import 'server-only';

import { featureEnabled } from '@/lib/platform/features';
import { createHash, randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { isHwpFile, MAX_CONVERT_ATTEMPTS, parseConverterSchedule, type ConverterSchedule } from '@/lib/converter/schedule-rule';
import type { Json } from '@/types/database';

/**
 * 한글 PDF 자동 변환 (2026-11-16) — 운영사 PC 의 상주 프로그램이 정품 한글로 HWP·HWPX 보고서를 PDF 로 저장해 올린다.
 * 대상 = 회차 보고서(mentoring_report:*) · 관찰의견서(observation_report) 중 한글 파일.
 * 결과는 report_conversions 에 원본 문서별로 두고(원본은 그대로 보관), 합본·제출용 묶음이 원본 대신 이 PDF 를 쓴다.
 * 원본 storage_path 가 바뀌면(수정 업로드) 예전 변환본은 무효 → 다시 변환 대상.
 */

export const CONVERTED_PREFIX = 'converted';
export const CONVERTER_STAGING_PREFIX = '_staging/conv-';
export const MAX_CONVERTED_PDF_BYTES = 150 * 1024 * 1024;

export function hashConverterToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 새 연결 키 — 화면에 한 번만 보여 주고 해시만 저장 */
export function newConverterToken(): string {
  return `modu_conv_${randomBytes(24).toString('base64url')}`;
}

export interface ConverterAuth {
  converterId: string;
  programId: string;
  name: string;
}

/** Authorization: Bearer <연결 키> → 변환 PC (해제된 키는 거부). 마지막 접속 시각 기록 */
export async function authenticateConverter(request: Request): Promise<ConverterAuth | null> {
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(modu_conv_[A-Za-z0-9_-]{20,})$/.exec(header.trim());
  if (!m) return null;
  const admin = createAdminClient();
  const { data } = await admin.from('report_converters').select('id, program_id, name, revoked_at').eq('token_hash', hashConverterToken(m[1]!)).maybeSingle();
  if (!data || data.revoked_at) return null;
  const version = request.headers.get('x-agent-version')?.slice(0, 20) ?? null;
  await admin.from('report_converters').update({ last_seen_at: new Date().toISOString(), ...(version ? { agent_version: version } : {}) }).eq('id', data.id);
  return { converterId: data.id, programId: data.program_id, name: data.name };
}

/** 행사 기능 플래그 hwp_converter (기본 꺼짐) — 꺼져 있으면 변환 PC 는 대기만 한다 */
export async function converterFeatureOn(programId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('programs').select('features').eq('id', programId).maybeSingle();
  return featureEnabled(data?.features, 'hwp_converter');
}

export async function loadConverterSchedule(programId: string): Promise<{ schedule: ConverterSchedule; lastRunAt: string | null; requestedAt: string | null }> {
  const { data } = await createAdminClient().from('programs').select('converter_settings, converter_last_run_at, converter_run_requested_at').eq('id', programId).maybeSingle();
  return {
    schedule: parseConverterSchedule(data?.converter_settings),
    lastRunAt: data?.converter_last_run_at ?? null,
    requestedAt: data?.converter_run_requested_at ?? null,
  };
}

export interface HwpSource {
  docId: string;
  caseId: string;
  docName: string;
  storagePath: string;
  ext: 'hwp' | 'hwpx';
  kind: 'report' | 'observation';
}

type ConversionRow = { source_doc_id: string; source_path: string; status: string; attempts: number; last_error: string | null; pdf_path: string | null; converted_at: string | null; updated_at: string };

/** 행사 안 한글 보고서·관찰의견서 + 변환 기록 */
async function loadSourcesAndConversions(programId: string): Promise<{ sources: HwpSource[]; conversions: Map<string, ConversionRow> }> {
  const admin = createAdminClient();
  const cases = await fetchAll<{ id: string }>((f, t) => admin.from('cases').select('id').eq('program_id', programId).range(f, t));
  const caseIds = cases.map((c) => c.id);
  const docs = await fetchAllIn<{ id: string; case_id: string; doc_key: string; doc_name: string; storage_path: string; mime_type: string | null }>(caseIds, (chunk, f, t) =>
    admin.from('documents').select('id, case_id, doc_key, doc_name, storage_path, mime_type').in('case_id', chunk).or('doc_key.like.mentoring_report:%,doc_key.eq.observation_report').range(f, t),
  );
  const sources: HwpSource[] = [];
  for (const d of docs) {
    const ext = isHwpFile(d.doc_name || d.storage_path, d.mime_type) ?? isHwpFile(d.storage_path);
    if (!ext) continue;
    sources.push({ docId: d.id, caseId: d.case_id, docName: d.doc_name, storagePath: d.storage_path, ext, kind: d.doc_key === 'observation_report' ? 'observation' : 'report' });
  }
  const rows = await fetchAll<ConversionRow>((f, t) =>
    admin.from('report_conversions').select('source_doc_id, source_path, status, attempts, last_error, pdf_path, converted_at, updated_at').eq('program_id', programId).range(f, t),
  );
  return { sources, conversions: new Map(rows.map((r) => [r.source_doc_id, r])) };
}

export type SourceState = 'done' | 'pending' | 'failed';

export function sourceState(s: HwpSource, c: ConversionRow | undefined): SourceState {
  if (!c || c.source_path !== s.storagePath) return 'pending';
  if (c.status === 'done' && c.pdf_path) return 'done';
  return c.attempts >= MAX_CONVERT_ATTEMPTS ? 'failed' : 'pending';
}

/** 변환할 차례인 파일 (실패 3회 미만, 원본 경로 기준 최신) */
export async function listPendingConversions(programId: string, limit: number): Promise<HwpSource[]> {
  const { sources, conversions } = await loadSourcesAndConversions(programId);
  return sources.filter((s) => sourceState(s, conversions.get(s.docId)) === 'pending').slice(0, limit);
}

export async function findSource(programId: string, docId: string): Promise<HwpSource | null> {
  const admin = createAdminClient();
  const { data: d } = await admin.from('documents').select('id, case_id, doc_key, doc_name, storage_path, mime_type').eq('id', docId).maybeSingle();
  if (!d || !d.case_id) return null;
  if (!(d.doc_key.startsWith('mentoring_report:') || d.doc_key === 'observation_report')) return null;
  const { data: c } = await admin.from('cases').select('program_id').eq('id', d.case_id).maybeSingle();
  if (!c || c.program_id !== programId) return null;
  const ext = isHwpFile(d.doc_name || d.storage_path, d.mime_type) ?? isHwpFile(d.storage_path);
  if (!ext) return null;
  return { docId: d.id, caseId: d.case_id, docName: d.doc_name, storagePath: d.storage_path, ext, kind: d.doc_key === 'observation_report' ? 'observation' : 'report' };
}

/** 합본·제출용 묶음용 — 원본 문서 id → 지금 유효한 변환 PDF 경로 (원본 경로가 같을 때만) */
export async function convertedPdfMap(docs: { id: string; storage_path: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = docs.map((d) => d.id);
  if (ids.length === 0) return out;
  const rows = await fetchAllIn<{ source_doc_id: string; source_path: string; status: string; pdf_path: string | null }>(ids, (chunk, f, t) =>
    createAdminClient().from('report_conversions').select('source_doc_id, source_path, status, pdf_path').in('source_doc_id', chunk).eq('status', 'done').range(f, t),
  );
  const pathOf = new Map(docs.map((d) => [d.id, d.storage_path]));
  for (const r of rows) if (r.pdf_path && pathOf.get(r.source_doc_id) === r.source_path) out.set(r.source_doc_id, r.pdf_path);
  return out;
}

export async function converterAudit(programId: string, action: string, entityId: string | null, metadata: Json, actorId: string | null = null): Promise<void> {
  const { error } = await createAdminClient().from('audit_logs').insert({ actor_id: actorId, program_id: programId, action, entity_type: 'report_conversions', entity_id: entityId, metadata });
  if (error) console.error(`[converter] audit ${action} failed:`, error.message);
}

export interface ConverterOverview {
  schedule: ConverterSchedule;
  lastRunAt: string | null;
  requestedAt: string | null;
  converters: { id: string; name: string; createdAt: string; lastSeenAt: string | null; lastRunAt: string | null; lastResult: { converted?: number; failed?: number } | null; revokedAt: string | null; agentVersion: string | null }[];
  counts: { total: number; done: number; pending: number; failed: number };
  failures: { docId: string; caseId: string; name: string; error: string | null; attempts: number }[];
  pendingSamples: { docId: string; caseId: string; name: string }[];
}

export async function loadConverterOverview(programId: string): Promise<ConverterOverview> {
  const admin = createAdminClient();
  const [{ schedule, lastRunAt, requestedAt }, { data: convs }, { sources, conversions }] = await Promise.all([
    loadConverterSchedule(programId),
    admin.from('report_converters').select('id, name, created_at, last_seen_at, last_run_at, last_result, revoked_at, agent_version').eq('program_id', programId).order('created_at', { ascending: false }),
    loadSourcesAndConversions(programId),
  ]);
  const counts = { total: sources.length, done: 0, pending: 0, failed: 0 };
  const failures: ConverterOverview['failures'] = [];
  const pendingSamples: ConverterOverview['pendingSamples'] = [];
  for (const s of sources) {
    const c = conversions.get(s.docId);
    const st = sourceState(s, c);
    counts[st]++;
    if (st === 'failed') failures.push({ docId: s.docId, caseId: s.caseId, name: s.docName, error: c?.last_error ?? null, attempts: c?.attempts ?? 0 });
    else if (st === 'pending' && pendingSamples.length < 30) pendingSamples.push({ docId: s.docId, caseId: s.caseId, name: s.docName });
  }
  return {
    schedule,
    lastRunAt,
    requestedAt,
    converters: (convs ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: c.created_at,
      lastSeenAt: c.last_seen_at,
      lastRunAt: c.last_run_at,
      lastResult: (c.last_result as { converted?: number; failed?: number } | null) ?? null,
      revokedAt: c.revoked_at,
      agentVersion: c.agent_version,
    })),
    counts,
    failures,
    pendingSamples,
  };
}
