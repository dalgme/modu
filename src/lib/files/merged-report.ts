import 'server-only';

import { mentorOfCaseOrNull, realRoleOrNull } from '@/lib/auth/guards';
import type { Profile } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { moveFile, sha256Hex } from '@/lib/storage/files';
import { reportDocKey } from '@/lib/data/rounds';
import { mergedReportFileName } from '@/lib/files/download-name-rule';
import { partKindOf } from '@/lib/files/round-package-shared';
import {
  MERGED_REPORT_DOC_KEY,
  MERGED_REPORT_MAX_BYTES,
  mergedFingerprint,
  mergedReportStatus,
  mergedStoragePath,
  roundsText,
  type MergedReportPlan,
  type MergedReportStatus,
  type MergedSource,
} from '@/lib/files/merged-report-shared';
import { observationRequiredFor } from '@/lib/workflow/observation-required';
import { logAudit } from '@/lib/workflow/audit';

/**
 * 멘티별 회차 보고서 합본 PDF (2026-11-10) — 서버 쪽. 규칙·지문은 `merged-report-shared.ts`.
 *  - 목록(plan): 보고서가 등록된 회차의 보고서 파일을 회차 순서로 + 짧은 서명 URL → 브라우저가 PDF 로 합친다(한글은 rhwp)
 *  - 저장(save): 브라우저가 스테이징에 올린 합본을 검증(PDF·크기·지문)해 케이스 폴더로 옮기고 documents 에 1건만 남긴다
 *  - 상태(status): 저장된 합본이 지금 보고서 목록과 같은지
 * 만들기·저장 = 컨텍스트 행사의 운영사·발주처 또는 그 케이스의 활성 담당 멘토. 받기는 일반 파일과 같은 권한(`resolveDocAccess`).
 */

type CaseRow = { id: string; owner_name: string; support_type_id: string; program_id: string };

export type MergedAuth = { ok: true; actor: Profile; caseRow: CaseRow } | { ok: false; status: 400 | 403 | 404; error: string };

export async function authorizeMergedReport(caseId: string): Promise<MergedAuth> {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return { ok: false, status: 400, error: '잘못된 요청입니다.' };
  const { data: c } = await createAdminClient().from('cases').select('id, owner_name, support_type_id, program_id').eq('id', caseId).maybeSingle();
  if (!c) return { ok: false, status: 404, error: '케이스를 찾을 수 없습니다.' };
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (staff) {
    const ctx = await contextOrNull(staff);
    if (ctx && ctx.programId === c.program_id) return { ok: true, actor: staff, caseRow: c };
  }
  const mentor = await mentorOfCaseOrNull(caseId);
  if (mentor) return { ok: true, actor: mentor, caseRow: c };
  return { ok: false, status: 403, error: '이 멘티의 보고서 합본을 만들 권한이 없습니다.' };
}

type ReportDoc = { id: string; case_id: string; doc_key: string; doc_name: string; storage_path: string; mime_type: string | null; created_at: string; updated_at: string | null };

/** 케이스별 합본 대상 보고서(보고서 등록 회차) + 저장된 합본 */
async function loadSources(caseIds: string[]): Promise<Map<string, { sources: (MergedSource & { doc: ReportDoc })[]; merged: ReportDoc | null }>> {
  const admin = createAdminClient();
  const [logs, docs] = await Promise.all([
    fetchAllIn<{ id: string; case_id: string; round_no: number }>(caseIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('id, case_id, round_no').in('case_id', chunk).not('report_registered_at', 'is', null).range(from, to),
    ),
    fetchAllIn<ReportDoc>(caseIds, (chunk, from, to) =>
      admin
        .from('documents')
        .select('id, case_id, doc_key, doc_name, storage_path, mime_type, created_at, updated_at')
        .in('case_id', chunk)
        .or(`doc_key.like.mentoring_report:%,doc_key.eq.${MERGED_REPORT_DOC_KEY}`)
        .order('created_at')
        .range(from, to),
    ),
  ]);
  const byKey = new Map(docs.filter((d) => d.doc_key.startsWith('mentoring_report:')).map((d) => [d.doc_key, d]));
  const out = new Map<string, { sources: (MergedSource & { doc: ReportDoc })[]; merged: ReportDoc | null }>();
  for (const id of caseIds) out.set(id, { sources: [], merged: null });
  for (const l of logs) {
    const d = byKey.get(reportDocKey(l.id));
    if (!d) continue;
    out.get(l.case_id)!.sources.push({ roundNo: l.round_no, docId: d.id, storagePath: d.storage_path, stamp: d.updated_at ?? d.created_at, doc: d });
  }
  for (const d of docs) if (d.doc_key === MERGED_REPORT_DOC_KEY) out.get(d.case_id)!.merged = d; // 최신(정렬 마지막)
  out.forEach((v) => v.sources.sort((a, b) => a.roundNo - b.roundNo));
  return out;
}

/** 여러 케이스의 합본 상태 (리포트 [보고서 파일] 표) */
export async function mergedReportStatusForCases(caseIds: string[]): Promise<Map<string, MergedReportStatus>> {
  const map = new Map<string, MergedReportStatus>();
  if (caseIds.length === 0) return map;
  const loaded = await loadSources(caseIds);
  loaded.forEach((v, id) => {
    map.set(id, mergedReportStatus(v.sources, v.merged ? { id: v.merged.id, name: v.merged.doc_name, storagePath: v.merged.storage_path, createdAt: v.merged.updated_at ?? v.merged.created_at } : null));
  });
  return map;
}

export async function mergedReportStatusFor(caseId: string): Promise<MergedReportStatus> {
  return (await mergedReportStatusForCases([caseId])).get(caseId)!;
}

/** 합치기 목록 — 회차 순서 보고서 + 1시간 서명 URL */
export async function buildMergedReportPlan(c: CaseRow): Promise<{ ok: true; plan: MergedReportPlan } | { ok: false; error: string }> {
  const { sources } = (await loadSources([c.id])).get(c.id)!;
  if (sources.length === 0) return { ok: false, error: '아직 등록된 회차 보고서가 없습니다.' };
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage.from('documents').createSignedUrls(sources.map((s) => s.storagePath), 3600);
  if (error) return { ok: false, error: `파일 주소를 만들지 못했습니다: ${error.message}` };
  const name = await mergedNameFor(c, sources);
  return {
    ok: true,
    plan: {
      caseId: c.id,
      menteeName: c.owner_name,
      name,
      fingerprint: mergedFingerprint(sources),
      parts: sources.map((s, i) => ({
        roundNo: s.roundNo,
        label: `${s.roundNo}회차 보고서`,
        sourceName: s.doc.doc_name || s.storagePath,
        kind: partKindOf(s.doc.doc_name || s.storagePath, s.doc.mime_type),
        url: signed?.[i]?.signedUrl ?? '',
      })),
    },
  };
}

/** 합본 파일 이름 = 다운로드 이름 규칙(보고서가 등록된 회차를 진행한 멘토들, 회차 순) */
async function mergedNameFor(c: CaseRow, sources: (MergedSource & { doc: ReportDoc })[]): Promise<string> {
  const admin = createAdminClient();
  const logIds = new Set(sources.map((s) => s.doc.doc_key.split(':')[1]));
  const { data: logs } = await admin.from('mentoring_logs').select('id, round_no, mentor_id').eq('case_id', c.id).order('round_no');
  const mentorIds = Array.from(new Set((logs ?? []).filter((l) => logIds.has(l.id)).map((l) => l.mentor_id)));
  const { data: users } = mentorIds.length ? await admin.from('users').select('id, name').in('id', mentorIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.name]));
  const mentors = mentorIds.map((id) => nameOf.get(id)).filter(Boolean).join('·');
  return mergedReportFileName(mentors || null, c.owner_name, await observationRequiredFor(c.support_type_id));
}

/** 브라우저가 올린 합본 저장 — 지문이 지금 보고서 목록과 같을 때만 */
export async function saveMergedReport(input: {
  auth: Extract<MergedAuth, { ok: true }>;
  stagingPath: string;
  fingerprint: string;
  includedRounds: number[];
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { actor, caseRow: c } = input.auth;
  if (!/^_staging\/[0-9a-f-]{36}\.pdf$/i.test(input.stagingPath)) return { ok: false, error: '잘못된 업로드 경로입니다.' };
  const admin = createAdminClient();
  const removeStaging = () => admin.storage.from('documents').remove([input.stagingPath]);

  const { sources, merged: old } = (await loadSources([c.id])).get(c.id)!;
  if (sources.length === 0 || mergedFingerprint(sources) !== input.fingerprint) {
    await removeStaging();
    return { ok: false, error: '합치는 동안 회차 보고서가 바뀌었습니다. 다시 만들어 주세요.' };
  }
  const reportRounds = new Set(sources.map((s) => s.roundNo));
  const included = Array.from(new Set(input.includedRounds)).filter((n) => reportRounds.has(n)).sort((a, b) => a - b);
  if (included.length === 0) {
    await removeStaging();
    return { ok: false, error: 'PDF 로 합친 회차가 없습니다.' };
  }

  const { data: blob } = await admin.storage.from('documents').download(input.stagingPath);
  if (!blob) return { ok: false, error: '올린 합본 파일을 확인할 수 없습니다. 다시 만들어 주세요.' };
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.byteLength > MERGED_REPORT_MAX_BYTES || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    await removeStaging();
    return { ok: false, error: buffer.byteLength > MERGED_REPORT_MAX_BYTES ? '합본 PDF 가 너무 큽니다(150MB 초과).' : 'PDF 파일이 아닙니다.' };
  }

  const dest = mergedStoragePath(c.id, input.fingerprint, included);
  const name = await mergedNameFor(c, sources);
  if (old?.storage_path === dest) await admin.storage.from('documents').remove([dest]);
  try {
    await moveFile('documents', input.stagingPath, dest);
  } catch {
    await removeStaging();
    return { ok: false, error: '합본 파일을 저장하지 못했습니다. 다시 시도해 주세요.' };
  }

  const row = {
    doc_name: name,
    storage_path: dest,
    sha256: sha256Hex(buffer),
    file_size: buffer.byteLength,
    mime_type: 'application/pdf',
    uploaded_by: actor.id,
    uploaded_role: actor.role,
    mentor_visible: true,
    updated_at: new Date().toISOString(),
  };
  // 케이스당 1건 — 기존 행이 있으면 그 행을 갱신(다운로드 링크 id 유지), 남은 중복·옛 파일은 정리
  const { data: existing } = await admin.from('documents').select('id, storage_path').eq('case_id', c.id).eq('doc_key', MERGED_REPORT_DOC_KEY).order('created_at');
  const keep = (existing ?? [])[0] ?? null;
  const { error: writeErr } = keep
    ? await admin.from('documents').update(row).eq('id', keep.id)
    : await admin.from('documents').insert({ ...row, case_id: c.id, doc_key: MERGED_REPORT_DOC_KEY });
  if (writeErr) {
    console.error('[merged-report] 문서 기록 실패', writeErr.message);
    if (old?.storage_path !== dest) await admin.storage.from('documents').remove([dest]);
    return { ok: false, error: '합본 기록을 저장하지 못했습니다. 다시 시도해 주세요.' };
  }
  const extra = (existing ?? []).slice(1);
  if (extra.length) await admin.from('documents').delete().in('id', extra.map((e) => e.id));
  const stalePaths = (existing ?? []).map((e) => e.storage_path).filter((p) => p && p !== dest);
  if (stalePaths.length) await admin.storage.from('documents').remove(stalePaths);

  const missing = Array.from(reportRounds).filter((n) => !included.includes(n)).sort((a, b) => a - b);
  await logAudit(admin, {
    actorId: actor.id,
    programId: c.program_id,
    action: 'report.merged',
    entityType: 'case',
    entityId: c.id,
    metadata: { case_id: c.id, file: name, rounds: included, missing, replaced: !!keep },
  });
  return {
    ok: true,
    message: missing.length ? `${c.owner_name} 합본 PDF 를 저장했습니다 (${roundsText(included)} · ${roundsText(missing)}는 PDF 로 바꾸지 못해 빠짐).` : `${c.owner_name} 합본 PDF 를 저장했습니다 (${roundsText(included)}).`,
  };
}
