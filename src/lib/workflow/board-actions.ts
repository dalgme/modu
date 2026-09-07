'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireRole, realRoleOrNull } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

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
}

/** 문의·요청 글 작성 (넥스트랩·멘토). nextlabOnly=true → 운영사(넥스트랩)에게만 공개. */
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

  const { error } = await loose().from('board_posts').insert({
    author_id: profile.id,
    title,
    body,
    visibility: input.nextlabOnly ? 'nextlab_only' : 'all',
  });
  if (error) return { ok: false, error: error.message };
  revalidateBoards();
  return { ok: true };
}

/** 답변 작성 (넥스트랩·멘토). RLS 로 열람 가능한 글에만 허용. */
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

/** 글 삭제 (넥스트랩 또는 작성자 — RLS 로 강제). */
export async function deleteBoardPostAction(id: string): Promise<BoardResult> {
  await requireRole(['mentor', 'nextlab']);
  const { error } = await loose().from('board_posts').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidateBoards();
  return { ok: true };
}
