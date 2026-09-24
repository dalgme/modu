'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless, isPL } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  commitImport,
  finishImportAutoMatch,
  isImportKind,
  parseSheet,
  previewImport,
  type ImportKind,
  type ImportMode,
  type ImportPreview,
  type ImportResult,
  type ImportRow,
} from '@/lib/import/bulk-import';

type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };
type CommitResult = { ok: true; result: ImportResult } | { ok: false; error: string };

/** 청크 커밋 한 번에 받는 최대 행 수 (클라이언트는 50행씩 보낸다, P31) — 'use server' 파일은 함수만 export 할 수 있어 상수는 지역 */
const MAX_COMMIT_ROWS = 100;
const MAX_PREVIEW_ROWS = 500;

async function operatorContext(): Promise<{ id: string; programId: string; isPL: boolean } | { error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'members');
  if (denied) return { error: denied };
  return { id: profile.id, programId: ctx.programId, isPL: isPL(ctx.grade) };
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

const modeOf = (v: unknown, kind: ImportKind): ImportMode => (v === 'update' && kind === 'mentee' ? 'update' : 'create');

/** 1단계: 파일 검증·미리보기 (DB 조회만). formData: kind · group · mode(create|update) · file */
export async function previewImportAction(formData: FormData): Promise<PreviewResult> {
  const op = await operatorContext();
  if ('error' in op) return { ok: false, error: op.error };
  const kindRaw = formData.get('kind');
  const kind: ImportKind = isImportKind(kindRaw) ? kindRaw : 'mentee';
  const mode = modeOf(formData.get('mode'), kind);
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: '파일을 선택하세요.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: '파일이 너무 큽니다. (최대 5MB)' };
  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed: ReturnType<typeof parseSheet>;
  try {
    parsed = parseSheet(buffer, kind);
  } catch (err) {
    console.error('[import] parse failed:', err instanceof Error ? err.message : err);
    return { ok: false, error: '엑셀 파일을 읽을 수 없습니다. 템플릿 형식(.xlsx 또는 UTF-8/EUC-KR CSV)을 확인하세요.' };
  }
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { sheet } = parsed;
  if (sheet.rows.length === 0) return { ok: false, error: `데이터 행이 없습니다. (${sheet.headerLine}행이 헤더)` };
  if (sheet.rows.length > MAX_PREVIEW_ROWS) return { ok: false, error: `한 번에 최대 ${MAX_PREVIEW_ROWS}행까지 등록할 수 있습니다.` };
  const groupRaw = formData.get('group');
  const group = await resolveGroup(op.programId, kind, typeof groupRaw === 'string' && groupRaw ? groupRaw : null);
  if ('error' in group) return { ok: false, error: group.error };
  try {
    const preview = await previewImport(op.programId, kind, sheet.rows, group.groupId, mode);
    preview.headers = { recognized: sheet.recognized, ignored: sheet.ignored, headerLine: sheet.headerLine };
    return { ok: true, preview };
  } catch (err) {
    // 조회 실패(1,000행 캡·네트워크)는 미리보기를 통째로 실패시킨다 — 잘못된 '신규' 판정으로 중복 계정이 생기지 않게 (P31)
    return { ok: false, error: `기존 계정 조회에 실패해 검증을 중단했습니다: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface CommitInput {
  kind: ImportKind;
  rows: ImportRow[];
  groupId?: string | null;
  mode?: ImportMode;
  /** 청크 커밋: 마지막 청크가 아니면 true (자동 매칭 생략) */
  skipAutoMatch?: boolean;
  allowReactivate?: boolean;
  allowSuspectDuplicates?: boolean;
}

/**
 * 2단계: 확정 — 미리보기에서 유효했던 행을 다시 검증한 뒤 생성.
 * 구 시그니처 `(kind, rows, groupId)` 와 새 옵션 객체 둘 다 받는다. 클라이언트는 50행 청크로 반복 호출하고 마지막 청크에서만 자동 매칭을 돌린다 (P31).
 */
export async function commitImportAction(kindOrInput: ImportKind | CommitInput, rowsArg?: ImportRow[], groupIdArg?: string | null): Promise<CommitResult> {
  const input: CommitInput = typeof kindOrInput === 'string' ? { kind: kindOrInput, rows: rowsArg ?? [], groupId: groupIdArg ?? null } : kindOrInput;
  const op = await operatorContext();
  if ('error' in op) return { ok: false, error: op.error };
  const { kind, rows } = input;
  if (!isImportKind(kind)) return { ok: false, error: '등록 종류가 올바르지 않습니다.' };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '등록할 행이 없습니다.' };
  if (rows.length > MAX_COMMIT_ROWS) return { ok: false, error: `한 번에 최대 ${MAX_COMMIT_ROWS}행까지 확정할 수 있습니다. (화면은 50행씩 나눠 보냅니다)` };
  const mode = modeOf(input.mode, kind);
  const group = await resolveGroup(op.programId, kind, input.groupId ?? null);
  if ('error' in group) return { ok: false, error: group.error };
  // 클라이언트가 보낸 검증 결과를 믿지 않는다 — 서버에서 재검증
  let revalidated: ImportPreview;
  try {
    revalidated = await previewImport(
      op.programId,
      kind,
      rows.map((r) => ({ line: Number(r.line) || 0, values: r.values })),
      group.groupId,
      mode,
    );
  } catch (err) {
    return { ok: false, error: `재검증 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
  const result = await commitImport(op.programId, kind, revalidated.rows, op.id, group.groupId, {
    actorIsPL: op.isPL,
    mode,
    skipAutoMatch: input.skipAutoMatch === true,
    allowReactivate: input.allowReactivate === true,
    allowSuspectDuplicates: input.allowSuspectDuplicates === true,
  });
  revalidatePath('/nextlab/members');
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/dashboard');
  return { ok: true, result };
}

/** 청크 커밋이 모두 끝난 뒤 자동 매칭 1회 (P31) — 마지막 청크가 실패해도 여기서 따로 돌릴 수 있다 */
export async function finishImportAction(kind: ImportKind): Promise<{ ok: true } | { ok: false; error: string }> {
  const op = await operatorContext();
  if ('error' in op) return { ok: false, error: op.error };
  if (kind === 'mentor' || kind === 'mentee') await finishImportAutoMatch(op.programId, op.id);
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/dashboard');
  return { ok: true };
}
