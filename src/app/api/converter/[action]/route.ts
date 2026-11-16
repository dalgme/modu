import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { decideConverterRun } from '@/lib/converter/schedule-rule';
import {
  authenticateConverter,
  converterFeatureOn,
  CONVERTED_PREFIX,
  CONVERTER_STAGING_PREFIX,
  converterAudit,
  findSource,
  listPendingConversions,
  loadConverterSchedule,
  MAX_CONVERTED_PDF_BYTES,
  type ConverterAuth,
} from '@/lib/converter/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
/** 이 API 의 응답 필드는 영문·숫자만 쓴다 — Windows PowerShell 5.1 이 한글 JSON 을 잘못 읽는 경우가 있어서 */
const fail = (code: string, status: number) => json({ ok: false, error: code }, status);

/**
 * 한글 PDF 변환 PC 전용 API (2026-11-16) — Authorization: Bearer <연결 키>. 로그인 세션을 쓰지 않는다.
 *  GET  schedule  → { runNow, nextRunAt, sleepSeconds }          (일정만 — 파일은 보지 않음)
 *  POST run       { phase: 'start' | 'finish', converted, failed }
 *  GET  jobs      → { items: [{ docId, ext, sourcePath, downloadUrl }] } (최대 20건, 1시간 서명 URL)
 *  POST upload    { docId } → { uploadUrl, stagingPath }          (PDF 를 PUT 할 서명 URL)
 *  POST complete  { docId, sourcePath, stagingPath }               (검증 후 케이스 폴더로 옮기고 변환본으로 등록)
 *  POST fail      { docId, sourcePath, error }
 */
async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = await request.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function GET(request: Request, { params }: { params: { action: string } }) {
  const auth = await authenticateConverter(request);
  if (!auth) return fail('unauthorized', 401);
  const on = await converterFeatureOn(auth.programId);
  if (params.action === 'schedule') {
    // 기능이 꺼진 행사 = 변환하지 않고 1시간 뒤 다시 묻기만 한다
    if (!on) return json({ ok: true, runNow: false, nextRunAt: null, sleepSeconds: 3600, disabled: true });
    const s = await loadConverterSchedule(auth.programId);
    const d = decideConverterRun(s.schedule, s.lastRunAt, s.requestedAt, Date.now());
    return json({ ok: true, ...d });
  }
  if (!on) return fail('disabled', 403);
  if (params.action === 'jobs') return jobs(auth);
  return fail('not_found', 404);
}

export async function POST(request: Request, { params }: { params: { action: string } }) {
  const auth = await authenticateConverter(request);
  if (!auth) return fail('unauthorized', 401);
  if (!(await converterFeatureOn(auth.programId))) return fail('disabled', 403);
  const b = await body(request);
  switch (params.action) {
    case 'run':
      return run(auth, b);
    case 'upload':
      return upload(auth, b);
    case 'complete':
      return complete(auth, b);
    case 'fail':
      return failed(auth, b);
    default:
      return fail('not_found', 404);
  }
}

async function run(auth: ConverterAuth, b: Record<string, unknown>) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  if (b.phase === 'start') {
    // 실행 시작 시각을 행사 기준으로 남겨 같은 점검 시각을 두 번 돌지 않게 한다
    await admin.from('programs').update({ converter_last_run_at: now }).eq('id', auth.programId);
    await admin.from('report_converters').update({ last_run_at: now }).eq('id', auth.converterId);
    return json({ ok: true });
  }
  const result = { converted: Number(b.converted) || 0, failed: Number(b.failed) || 0, finishedAt: now };
  await admin.from('report_converters').update({ last_result: result }).eq('id', auth.converterId);
  if (result.converted || result.failed) await converterAudit(auth.programId, 'report.pdf_convert_run', auth.converterId, { converter: auth.name, ...result });
  return json({ ok: true });
}

async function jobs(auth: ConverterAuth) {
  const items = await listPendingConversions(auth.programId, 20);
  if (items.length === 0) return json({ ok: true, items: [] });
  const { data, error } = await createAdminClient().storage.from('documents').createSignedUrls(items.map((i) => i.storagePath), 3600);
  if (error) return fail('sign_failed', 500);
  return json({
    ok: true,
    items: items
      .map((i, idx) => ({ docId: i.docId, ext: i.ext, sourcePath: i.storagePath, downloadUrl: data?.[idx]?.signedUrl ?? '' }))
      .filter((i) => i.downloadUrl),
  });
}

async function upload(auth: ConverterAuth, b: Record<string, unknown>) {
  const src = await findSource(auth.programId, str(b.docId, 40));
  if (!src) return fail('unknown_doc', 404);
  const stagingPath = `${CONVERTER_STAGING_PREFIX}${randomUUID()}.pdf`;
  const { data, error } = await createAdminClient().storage.from('documents').createSignedUploadUrl(stagingPath);
  if (error || !data) return fail('upload_url_failed', 500);
  return json({ ok: true, uploadUrl: data.signedUrl, stagingPath: data.path });
}

async function complete(auth: ConverterAuth, b: Record<string, unknown>) {
  const admin = createAdminClient();
  const stagingPath = str(b.stagingPath, 200);
  const cleanup = () => (stagingPath.startsWith(CONVERTER_STAGING_PREFIX) ? admin.storage.from('documents').remove([stagingPath]) : Promise.resolve());
  if (!stagingPath.startsWith(CONVERTER_STAGING_PREFIX) || stagingPath.includes('..')) return fail('bad_staging_path', 400);
  const src = await findSource(auth.programId, str(b.docId, 40));
  if (!src) {
    await cleanup();
    return fail('unknown_doc', 404);
  }
  // 변환하는 사이 멘토가 보고서를 바꿨으면 이 PDF 는 버린다(다음 점검에서 새 파일을 변환)
  if (str(b.sourcePath, 300) !== src.storagePath) {
    await cleanup();
    return fail('source_changed', 409);
  }
  const { data: blob, error: dlErr } = await admin.storage.from('documents').download(stagingPath);
  if (dlErr || !blob) return fail('staging_missing', 400);
  const buf = Buffer.from(await blob.arrayBuffer());
  if (buf.byteLength > MAX_CONVERTED_PDF_BYTES || buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    await cleanup();
    return fail('not_pdf', 400);
  }
  const dest = `${src.caseId}/${CONVERTED_PREFIX}/${src.docId}-${randomUUID().slice(0, 8)}.pdf`;
  const { error: mvErr } = await admin.storage.from('documents').move(stagingPath, dest);
  if (mvErr) return fail('move_failed', 500);
  const { data: prev } = await admin.from('report_conversions').select('pdf_path').eq('source_doc_id', src.docId).maybeSingle();
  const now = new Date().toISOString();
  const { error: upErr } = await admin.from('report_conversions').upsert({
    source_doc_id: src.docId,
    program_id: auth.programId,
    case_id: src.caseId,
    source_path: src.storagePath,
    status: 'done',
    attempts: 0,
    last_error: null,
    pdf_path: dest,
    pdf_size: buf.byteLength,
    converter_id: auth.converterId,
    converted_at: now,
    updated_at: now,
  });
  if (upErr) {
    await admin.storage.from('documents').remove([dest]);
    return fail('save_failed', 500);
  }
  if (prev?.pdf_path && prev.pdf_path !== dest) await admin.storage.from('documents').remove([prev.pdf_path]);
  await converterAudit(auth.programId, 'report.pdf_converted', src.docId, { case_id: src.caseId, doc_name: src.docName, kind: src.kind, converter: auth.name, size: buf.byteLength });
  return json({ ok: true });
}

async function failed(auth: ConverterAuth, b: Record<string, unknown>) {
  const src = await findSource(auth.programId, str(b.docId, 40));
  if (!src) return fail('unknown_doc', 404);
  if (str(b.sourcePath, 300) !== src.storagePath) return json({ ok: true, ignored: 'source_changed' });
  const admin = createAdminClient();
  const { data: prev } = await admin.from('report_conversions').select('source_path, status, attempts, pdf_path').eq('source_doc_id', src.docId).maybeSingle();
  const samePath = prev?.source_path === src.storagePath;
  if (samePath && prev?.status === 'done') return json({ ok: true, ignored: 'already_done' });
  const attempts = (samePath ? (prev?.attempts ?? 0) : 0) + 1;
  await admin.from('report_conversions').upsert({
    source_doc_id: src.docId,
    program_id: auth.programId,
    case_id: src.caseId,
    source_path: src.storagePath,
    status: 'failed',
    attempts,
    last_error: str(b.error, 300) || 'unknown',
    pdf_path: samePath ? (prev?.pdf_path ?? null) : null,
    converter_id: auth.converterId,
    updated_at: new Date().toISOString(),
  });
  return json({ ok: true, attempts });
}
