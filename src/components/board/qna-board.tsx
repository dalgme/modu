'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Users, MessageSquare, Trash2, Send, Plus } from 'lucide-react';

import type { BoardPostItem } from '@/lib/data/board';
import {
  createBoardPostAction,
  createBoardReplyAction,
  deleteBoardPostAction,
} from '@/lib/workflow/board-actions';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  const label = ROLE_LABELS[role as UserRole] ?? role;
  const cls =
    role === 'nextlab'
      ? 'bg-primary/10 text-primary'
      : role === 'mentor'
        ? 'bg-status-progress/10 text-status-progress'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold', cls)}>{label}</span>
  );
}

function ReplyForm({ postId, onDone }: { postId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  async function submit() {
    if (!body.trim()) return;
    setSending(true);
    const res = await createBoardReplyAction({ postId, body });
    setSending(false);
    if (res.ok) {
      setBody('');
      onDone();
    } else {
      toast({ title: '답변 실패', description: res.error, variant: 'destructive' });
    }
  }
  return (
    <div className="mt-2 flex items-start gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="답변을 입력하세요."
        className="flex-1"
      />
      <Button type="button" size="sm" onClick={submit} disabled={sending} className="gap-1">
        <Send className="h-3.5 w-3.5" />
        {sending ? '…' : '답변'}
      </Button>
    </div>
  );
}

export function QnaBoard({
  posts,
  currentUserId,
  currentRole,
}: {
  posts: BoardPostItem[];
  currentUserId: string;
  currentRole: UserRole;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isMentor = currentRole === 'mentor';

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [nextlabOnly, setNextlabOnly] = useState(false);
  const [posting, setPosting] = useState(false);

  async function submitPost() {
    if (!title.trim() || !body.trim()) {
      toast({ title: '제목과 내용을 입력하세요.', variant: 'destructive' });
      return;
    }
    setPosting(true);
    const res = await createBoardPostAction({ title, body, nextlabOnly });
    setPosting(false);
    if (res.ok) {
      toast({ title: '등록되었습니다.' });
      setTitle('');
      setBody('');
      setNextlabOnly(false);
      setShowForm(false);
      router.refresh();
    } else {
      toast({ title: '등록 실패', description: res.error, variant: 'destructive' });
    }
  }

  async function removePost(id: string) {
    const res = await deleteBoardPostAction(id);
    if (res.ok) router.refresh();
    else toast({ title: '삭제 실패', description: res.error, variant: 'destructive' });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          운영사·멘토단이 함께 쓰는 문의·요청 게시판입니다.
          {isMentor && ' 글 작성 시 ‘운영사에게만 공개’를 선택할 수 있습니다.'}
        </p>
        <Button type="button" size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          글쓰기
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">새 문의·요청 작성</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="post-title">제목</Label>
              <Input
                id="post-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="post-body">내용</Label>
              <Textarea
                id="post-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
              />
            </div>
            {isMentor && (
              <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={nextlabOnly}
                  onChange={(e) => setNextlabOnly(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span>
                  <b>운영사에게만 공개</b> — 체크하면 운영사만 볼 수 있고, 체크하지 않으면
                  모든 멘토가 함께 볼 수 있습니다.
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                취소
              </Button>
              <Button type="button" onClick={submitPost} disabled={posting}>
                {posting ? '등록 중…' : '등록'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          등록된 글이 없습니다. 첫 문의·요청을 남겨보세요.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((p) => {
            const canDelete = currentRole === 'nextlab' || p.author_id === currentUserId;
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{p.title}</CardTitle>
                        {p.visibility === 'nextlab_only' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            <Lock className="h-3 w-3" />
                            운영사 공개
                          </span>
                        )}
                        {p.visibility === 'all' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <Users className="h-3 w-3" />
                            전체 공개
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {p.authorName ?? '작성자'}
                        <RoleBadge role={p.authorRole} />· {formatDateTime(p.created_at)}
                      </p>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => removePost(p.id)}
                        className="shrink-0 text-muted-foreground hover:text-status-rejected"
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="whitespace-pre-wrap text-sm">{p.body}</p>

                  {/* 답변 */}
                  {p.replies.length > 0 && (
                    <div className="flex flex-col gap-2 border-l-2 border-muted pl-3">
                      {p.replies.map((r) => (
                        <div key={r.id} className="text-sm">
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MessageSquare className="h-3 w-3" />
                            {r.authorName ?? '작성자'}
                            <RoleBadge role={r.authorRole} />· {formatDateTime(r.created_at)}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap">{r.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <ReplyForm postId={p.id} onDone={() => router.refresh()} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
