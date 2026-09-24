'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { realRoleOrNull } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/workflow/audit';

export type BoardResult = { ok: true } | { ok: false; error: string };

/**
 * 게시판 쓰기는 anon(RLS) 클라이언트로 나가고 정책이 `author_id = auth.uid()` 를 요구한다.
 * DB 의 auth.uid() 는 대행(view-as) 쿠키로 치환되지 않으므로 반드시 **실제 신원**으로 작성한다
 * (유효 신원으로 쓰면 대행 중 글쓰기가 RLS 위반으로 전면 실패한다).
 */
const BOARD_WRITE_DENIED = '글을 작성할 권한이 없습니다.';

function loose() {
  return createClient() as unknown as SupabaseClient;
}

function revalidateBoards() {
  revalidatePath('/mentor/qna');
  revalidatePath('/nextlab/qna');
  revalidatePath('/nextlab/board');
}

/** 문의·요청 글 작성 (운영사·멘토). nextlabOnly=true → 운영사에게만 공개. program_id = 현재 행사 컨텍스트 (0080). */
export async function createBoardPostAction(input: {
  title: string;
  body: string;
  nextlabOnly: boolean;
}): Promise<BoardResult> {
  const profile = await realRoleOrNull(['mentor', 'nextlab']);
  if (!profile) return { ok: false, error: BOARD_WRITE_DENIED };
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, error: '제목을 입력하세요.' };
  if (!body) return { ok: false, error: '내용을 입력하세요.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };

  const { error } = await loose().from('board_posts').insert({
    author_id: profile.id,
    program_id: ctx.programId,
    title,
    body,
    visibility: input.nextlabOnly ? 'nextlab_only' : 'all',
  });
  if (error) return { ok: false, error: error.message };
  revalidateBoards();
  return { ok: true };
}

/** 답변 작성 (운영사·멘토). RLS 로 열람 가능한 글에만 허용. */
export async function createBoardReplyAction(input: {
  postId: string;
  body: string;
}): Promise<BoardResult> {
  const profile = await realRoleOrNull(['mentor', 'nextlab']);
  if (!profile) return { ok: false, error: BOARD_WRITE_DENIED };
  const body = input.body.trim();
  if (!body) return { ok: false, error: '답변 내용을 입력하세요.' };

  const { error } = await loose().from('board_replies').insert({
    post_id: input.postId,
    author_id: profile.id,
    body,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBoards();
  return { ok: true };
}

/**
 * 글 삭제 — 작성자 본인, 또는 그 행사의 운영사(`review` 권한 — 옵저버 차단). 감사 'board.delete'.
 */
export async function deleteBoardPostAction(id: string): Promise<BoardResult> {
  const profile = await realRoleOrNull(['mentor', 'nextlab']);
  if (!profile) return { ok: false, error: BOARD_WRITE_DENIED };
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data: post } = await admin.from('board_posts').select('id, author_id, title, program_id, visibility').eq('id', id).maybeSingle();
  if (!post) return { ok: false, error: '글을 찾을 수 없습니다.' };
  const isAuthor = post.author_id === profile.id;
  const ctx = await contextOrNull(profile);
  let programId: string | null = post.program_id ?? ctx?.programId ?? null;
  if (!isAuthor) {
    if (profile.role !== 'nextlab') return { ok: false, error: '본인이 쓴 글만 삭제할 수 있습니다.' };
    if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
    const denied = denyUnless(ctx, 'review');
    if (denied) return { ok: false, error: denied };
    if (post.program_id && post.program_id !== ctx.programId) return { ok: false, error: '이 행사의 글이 아닙니다.' };
    programId = ctx.programId;
  }
  const { error } = await admin.from('board_posts').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  await logAudit(createAdminClient(), {
    actorId: profile.id,
    programId,
    action: 'board.delete',
    entityType: 'board_posts',
    entityId: id,
    metadata: { title: post.title, author_id: post.author_id, by_author: isAuthor, visibility: post.visibility },
  });
  revalidateBoards();
  return { ok: true };
}
