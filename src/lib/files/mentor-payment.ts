import 'server-only';
import { createHash } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';

import { realRoleOrNull, roleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll } from '@/lib/supabase/paginate';
import { mergeKindOf, type MentorPaymentFileItem } from '@/lib/files/mentor-payment-shared';

/**
 * 멘토 지급증빙 서류 (2026-09-30) — 조회·권한·합본 PDF.
 * 저장: documents 버킷 `mentor-payment/{programId}/{mentorId}/{uuid}.{ext}` (스토리지 키에 한글을 넣지 않는다 — 원래 파일명은 file_name).
 * 합본 PDF 캐시: 같은 폴더의 `_merged-{지문}.pdf`. 지문 = 파일 id·순서·수정시각 해시라 파일이 바뀌면 이름이 달라져
 * 무효화 경쟁(삭제 직후 옛 합본이 다시 만들어지는 문제) 없이 새로 만든다. 변경 액션은 옛 합본을 지운다(정리용).
 * 권한은 코드에서 확인한다(테이블은 서비스롤 전용 — CLAUDE.md §6-2).
 */

export const MENTOR_PAYMENT_BUCKET = 'documents' as const;
export const mentorPaymentFolder = (programId: string, mentorId: string) => `mentor-payment/${programId}/${mentorId}`;

type FileRow = { id: string; mentor_id: string; file_name: string; storage_path: string; mime_type: string | null; file_size: number | null; sort_order: number; created_at: string; updated_at: string };

const toItem = (r: FileRow): MentorPaymentFileItem => ({
  id: r.id,
  name: r.file_name,
  mime: r.mime_type,
  size: r.file_size,
  mergeable: mergeKindOf(r.file_name, r.mime_type) !== null,
  createdAt: r.created_at,
});

const bySort = (a: FileRow, b: FileRow) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/** 행사의 멘토별 지급서류 목록 (순서대로). mentorIds 를 주면 그 멘토만. */
export async function listMentorPaymentFiles(programId: string, mentorIds?: string[]): Promise<Record<string, MentorPaymentFileItem[]>> {
  const admin = createAdminClient();
  const rows = await fetchAll<FileRow>((from, to) =>
    admin
      .from('mentor_payment_files')
      .select('id, mentor_id, file_name, storage_path, mime_type, file_size, sort_order, created_at, updated_at')
      .eq('program_id', programId)
      .order('sort_order')
      .order('created_at')
      .range(from, to),
  );
  const want = mentorIds ? new Set(mentorIds) : null;
  const out: Record<string, MentorPaymentFileItem[]> = {};
  for (const r of rows.sort(bySort)) {
    if (want && !want.has(r.mentor_id)) continue;
    (out[r.mentor_id] ??= []).push(toItem(r));
  }
  return out;
}

/** 한 멘토의 원본 행 (순서대로) */
export async function loadMentorPaymentRows(programId: string, mentorId: string): Promise<FileRow[]> {
  const { data, error } = await createAdminClient()
    .from('mentor_payment_files')
    .select('id, mentor_id, file_name, storage_path, mime_type, file_size, sort_order, created_at, updated_at')
    .eq('program_id', programId)
    .eq('mentor_id', mentorId);
  if (error) throw new Error(error.message);
  return (data ?? []).sort(bySort);
}

/* ── 권한 ──────────────────────────────────────────────────────────────── */

export type PaymentViewer = { ok: true; programId: string; userId: string; role: 'nextlab' | 'institution' | 'mentor' } | { ok: false; status: number; error: string };

/**
 * 지급서류 열람 권한 (라우트 공용).
 *  - 운영사: 컨텍스트 행사 + `mentors.docs` 권한(옵저버 등 차단 — 서류 ZIP 라우트와 같은 기준)
 *  - 발주처: 컨텍스트 행사 — 멘토별 확인·저장(요건)
 *  - 멘토: 본인 파일만
 * 대상 멘토가 그 행사의 멘토(program_members.role='mentor')인지 코드로 확인한다.
 */
export async function resolvePaymentViewer(mentorId: string): Promise<PaymentViewer> {
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (staff) {
    const ctx = await contextOrNull(staff);
    if (ctx) {
      if (ctx.role === 'nextlab') {
        const denied = denyUnless(ctx, 'mentors.docs');
        if (denied) return { ok: false, status: 403, error: denied };
      } else if (ctx.role !== 'institution') {
        return { ok: false, status: 403, error: '권한이 없습니다.' };
      }
      if (!(await isProgramMentor(ctx.programId, mentorId))) return { ok: false, status: 404, error: '이 행사의 멘토가 아닙니다.' };
      return { ok: true, programId: ctx.programId, userId: staff.id, role: ctx.role };
    }
  }
  const mentor = await roleOrNull(['mentor']);
  if (!mentor || mentor.id !== mentorId) return { ok: false, status: 403, error: '권한이 없습니다.' };
  const ctx = await contextOrNull(mentor);
  if (!ctx) return { ok: false, status: 400, error: '행사를 먼저 선택하세요.' };
  return { ok: true, programId: ctx.programId, userId: mentor.id, role: 'mentor' };
}

export async function isProgramMentor(programId: string, mentorId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('program_members').select('user_id').eq('program_id', programId).eq('user_id', mentorId).eq('role', 'mentor').maybeSingle();
  return !!data;
}

/* ── 합본 PDF ──────────────────────────────────────────────────────────── */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 24;

/** 파일 구성 지문 — 파일 추가·삭제·교체·순서 변경 시 달라진다 */
export function mergedFingerprint(rows: Pick<FileRow, 'id' | 'sort_order' | 'updated_at'>[]): string {
  const src = rows.map((r) => `${r.id}:${r.sort_order}:${r.updated_at}`).join('|');
  return createHash('sha256').update(src).digest('hex').slice(0, 16);
}

/** 폴더의 합본 캐시 전부 삭제 (변경 액션에서 정리용) */
export async function clearMergedCache(programId: string, mentorId: string): Promise<void> {
  const admin = createAdminClient();
  const folder = mentorPaymentFolder(programId, mentorId);
  const { data } = await admin.storage.from(MENTOR_PAYMENT_BUCKET).list(folder, { limit: 100, search: '_merged' });
  const paths = (data ?? []).filter((o) => o.name.startsWith('_merged')).map((o) => `${folder}/${o.name}`);
  if (paths.length) await admin.storage.from(MENTOR_PAYMENT_BUCKET).remove(paths);
}

export type MergedResult =
  | { ok: true; path: string; mergedCount: number; skipped: string[] }
  | { ok: false; status: number; error: string };

/**
 * 멘토의 PDF·JPG·PNG 를 순서대로 한 PDF 로 합쳐 스토리지에 캐시하고 경로를 돌려준다.
 * 응답 본문으로 PDF 를 보내지 않는다(Vercel 응답 4.5MB 한도) — 호출부가 짧은 서명 URL 을 만든다.
 * 읽지 못한 PDF(암호·손상)는 건너뛰고 skipped 에 이름을 남긴다.
 */
export async function ensureMergedPdf(programId: string, mentorId: string): Promise<MergedResult> {
  const rows = await loadMentorPaymentRows(programId, mentorId);
  const mergeable = rows.filter((r) => mergeKindOf(r.file_name, r.mime_type) !== null);
  if (mergeable.length === 0) return { ok: false, status: 404, error: 'PDF 로 합칠 수 있는 파일(PDF·JPG·PNG)이 없습니다.' };
  const admin = createAdminClient();
  const folder = mentorPaymentFolder(programId, mentorId);
  const name = `_merged-${mergedFingerprint(rows)}.pdf`;
  const path = `${folder}/${name}`;

  const { data: existing } = await admin.storage.from(MENTOR_PAYMENT_BUCKET).list(folder, { limit: 100, search: '_merged' });
  if ((existing ?? []).some((o) => o.name === name)) return { ok: true, path, mergedCount: mergeable.length, skipped: [] };

  const out = await PDFDocument.create();
  out.setTitle('지급증빙 서류');
  const skipped: string[] = [];
  let merged = 0;
  for (const r of mergeable) {
    const kind = mergeKindOf(r.file_name, r.mime_type);
    const { data: blob } = await admin.storage.from(MENTOR_PAYMENT_BUCKET).download(r.storage_path);
    if (!blob) {
      skipped.push(r.file_name);
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      if (kind === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
      } else {
        const img = kind === 'png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        // 가로로 긴 이미지는 가로 A4 로 — 작게 줄어드는 것을 줄인다
        const landscape = img.width > img.height;
        const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
        const scale = Math.min((pw - MARGIN * 2) / img.width, (ph - MARGIN * 2) / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const page = out.addPage([pw, ph]);
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
      merged++;
    } catch {
      skipped.push(r.file_name);
    }
  }
  if (merged === 0) return { ok: false, status: 422, error: `합칠 수 있는 파일을 읽지 못했습니다 (${skipped.join(', ')}). 개별 미리보기를 이용하세요.` };
  const pdf = await out.save();
  // 옛 합본 정리 후 새 합본 저장 (같은 지문이 동시에 만들어지면 upsert 로 덮어쓴다)
  const stale = (existing ?? []).filter((o) => o.name.startsWith('_merged') && o.name !== name).map((o) => `${folder}/${o.name}`);
  if (stale.length) await admin.storage.from(MENTOR_PAYMENT_BUCKET).remove(stale);
  const { error } = await admin.storage.from(MENTOR_PAYMENT_BUCKET).upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true });
  if (error) return { ok: false, status: 500, error: `합본 PDF 저장 실패: ${error.message}` };
  return { ok: true, path, mergedCount: merged, skipped };
}
