import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export interface BoardReplyItem {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  authorName: string | null;
  authorRole: string | null;
}

export interface BoardPostItem {
  id: string;
  author_id: string;
  title: string;
  body: string;
  visibility: 'all' | 'nextlab_only';
  created_at: string;
  authorName: string | null;
  authorRole: string | null;
  replies: BoardReplyItem[];
}

/** board_* 는 타입 생성 전(0036) 테이블이라 loosely-typed 클라이언트로 접근한다. */
function loose() {
  return createClient() as unknown as SupabaseClient;
}

/**
 * 문의·요청 게시판: 현재 사용자가 열람 가능한 글 + 답변 (RLS 로 가시성 자동 제한).
 * 최신 글 먼저, 답변은 오래된 순.
 */
export async function listBoardPosts(): Promise<BoardPostItem[]> {
  const board = loose();
  const { data: postRows } = await board
    .from('board_posts')
    .select('*')
    .order('created_at', { ascending: false });
  const posts = (postRows ?? []) as Omit<BoardPostItem, 'authorName' | 'authorRole' | 'replies'>[];
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const { data: replyRows } = await board
    .from('board_replies')
    .select('*')
    .in('post_id', postIds)
    .order('created_at', { ascending: true });
  const replies = (replyRows ?? []) as Omit<BoardReplyItem, 'authorName' | 'authorRole'>[];

  // 작성자 이름·역할 보강
  const authorIds = Array.from(
    new Set([...posts.map((p) => p.author_id), ...replies.map((r) => r.author_id)]),
  );
  const typed = createClient();
  const { data: users } = authorIds.length
    ? await typed.from('users').select('id, name, role').in('id', authorIds)
    : { data: [] as { id: string; name: string; role: string }[] };
  const byId = new Map((users ?? []).map((u) => [u.id, u]));

  const repliesByPost = new Map<string, BoardReplyItem[]>();
  for (const r of replies) {
    const u = byId.get(r.author_id);
    const item: BoardReplyItem = {
      ...r,
      authorName: u?.name ?? null,
      authorRole: u?.role ?? null,
    };
    const list = repliesByPost.get(r.post_id) ?? [];
    list.push(item);
    repliesByPost.set(r.post_id, list);
  }

  return posts.map((p) => {
    const u = byId.get(p.author_id);
    return {
      ...p,
      authorName: u?.name ?? null,
      authorRole: u?.role ?? null,
      replies: repliesByPost.get(p.id) ?? [],
    };
  });
}
