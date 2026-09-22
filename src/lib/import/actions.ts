'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { commitImport, isImportKind, parseSheet, previewImport, type ImportKind, type ImportPreview, type ImportResult, type ImportRow } from '@/lib/import/bulk-import';

type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };
type CommitResult = { ok: true; result: ImportResult } | { ok: false; error: string };

async function operatorContext(): Promise<{ id: string; programId: string } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'members');
  if (denied) return { error: denied };
  return { id: profile.id, programId: ctx.programId };
}

/** 업로드 화면에서 고른 사업그룹 검증 — 멘티는 필수, 멘토는 선택 (P23: 그룹코드 컬럼 폐지) */
async function resolveGroup(programId: string, kind: ImportKind, groupId: string | null): Promise<{ groupId: string | null } | { error: string }> {
  if (!groupId) {
    if (kind === 'mentee') return { error: '멘티 등록은 사업그룹을 먼저 선택해야 합니다.' };
    return { groupId: null };
  }
  const { data: g } = await createAdminClient().from('support_types').select('id, program_id, status').eq('id', groupId).maybeSingle();
  if (!g || g.program_id !== programId) return { error: '이 행사의 사업그룹이 아닙니다.' };
  if (g.status !== 'active') return { error: '종료된 사업그룹에는 등록할 수 없습니다.' };
  return { groupId: g.id };
}

/** 1단계: 파일 검증·미리보기 (DB 조회만) */
export async function previewImportAction(formData: FormData): Promise<PreviewResult> {
  const op = await operatorContext();
  if ('error' in op) return { ok: false, error: op.error };
  const kindRaw = formData.get('kind');
  const kind: ImportKind = isImportKind(kindRaw) ? kindRaw : 'mentee';
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: '파일을 선택하세요.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: '파일이 너무 큽니다. (최대 5MB)' };
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, string>[];
  try {
    rows = parseSheet(buffer, kind);
  } catch {
    return { ok: false, error: '엑셀 파일을 읽을 수 없습니다. 템플릿 형식(.xlsx)을 확인하세요.' };
  }
  if (rows.length === 0) return { ok: false, error: '데이터 행이 없습니다. (1행은 헤더)' };
  if (rows.length > 500) return { ok: false, error: '한 번에 최대 500행까지 등록할 수 있습니다.' };
  const groupRaw = formData.get('group');
  const group = await resolveGroup(op.programId, kind, typeof groupRaw === 'string' && groupRaw ? groupRaw : null);
  if ('error' in group) return { ok: false, error: group.error };
  const preview = await previewImport(op.programId, kind, rows);
  return { ok: true, preview };
}

/** 2단계: 확정 — 미리보기에서 유효했던 행을 다시 검증한 뒤 생성 */
export async function commitImportAction(kind: ImportKind, rows: ImportRow[], groupId?: string | null): Promise<CommitResult> {
  const op = await operatorContext();
  if ('error' in op) return { ok: false, error: op.error };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '등록할 행이 없습니다.' };
  const group = await resolveGroup(op.programId, kind, groupId ?? null);
  if ('error' in group) return { ok: false, error: group.error };
  // 클라이언트가 보낸 검증 결과를 믿지 않는다 — 서버에서 재검증
  const revalidated = await previewImport(op.programId, kind, rows.map((r) => r.values));
  const result = await commitImport(op.programId, kind, revalidated.rows, op.id, group.groupId);
  revalidatePath('/nextlab/members');
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/dashboard');
  return { ok: true, result };
}
