import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listInquiries, INQUIRY_CATEGORY_LABELS, INQUIRY_STATUS_LABELS } from '@/lib/data/inquiries';
import { listBoardPosts } from '@/lib/data/board';
import { listInbox } from '@/lib/data/requests';
import { listOperatorRequests } from '@/lib/data/operator-requests';
import { listAllFaqs } from '@/lib/data/faqs';
import { listProgramMessages } from '@/lib/messages/data';
import { InquiryAnswerForm } from '@/components/inquiries/inquiry-answer-form';
import { QnaBoard } from '@/components/board/qna-board';
import { InboxList } from '@/components/nextlab/inbox-list';
import { FaqManager } from '@/components/admin/faq-manager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
/** 요청함 승인 액션에서 PDF(정산서) 생성 가능 — 서버리스 Chromium 콜드스타트 대비 (CLAUDE.md §6-4) */
export const maxDuration = 60;

const TABS = [
  { key: 'all', label: '전체 글' },
  { key: 'inquiries', label: '멘티 문의' },
  { key: 'qna', label: '멘토·운영 게시판' },
  { key: 'requests', label: '요청함' },
  { key: 'messages', label: '멘토·멘티 메시지' },
  { key: 'faq', label: '멘토 FAQ' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const SENDER_FILTERS = [
  { key: '', label: '전체' },
  { key: 'mentor', label: '멘토' },
  { key: 'mentee', label: '멘티' },
  { key: 'nextlab', label: '운영사' },
  { key: 'institution', label: '발주처' },
] as const;

const SENDER_LABEL: Record<string, string> = { mentor: '멘토', mentee: '멘티', nextlab: '운영사', institution: '발주처' };

interface UnifiedRow {
  id: string;
  title: string;
  senderRole: string;
  senderName: string;
  at: string;
  checked: boolean;
  href: string;
}

const cut20 = (s: string) => {
  const first = (s ?? '').split('\n')[0]!.trim();
  return first.length > 20 ? `${first.slice(0, 20)}…` : first || '(내용 없음)';
};

const KIND_LABEL: Record<string, string> = {
  extension: '추가 회차 요청',
  mentor_change: '멘토 변경 요청',
  mentor_withdrawal: '멘토 중도 종료 요청',
};

/** 게시판 통합 탭 (P20) — 멘티 문의 · 멘토·운영 게시판 · 요청함 · 멘토·멘티 메시지 · 멘토 FAQ */
export default async function Page({ searchParams }: { searchParams: { tab?: string; from?: string; sub?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab = (TABS.find((t) => t.key === searchParams.tab)?.key ?? 'all') as TabKey;
  const from = SENDER_FILTERS.find((f) => f.key === searchParams.from)?.key ?? '';

  let body: React.ReactNode = null;

  if (tab === 'all') {
    const [inquiries, posts, inbox, opReqs, messages] = await Promise.all([
      listInquiries(),
      listBoardPosts(),
      listInbox(ctx.programId, ctx.supportTypeId ?? undefined, false),
      listOperatorRequests(),
      listProgramMessages(ctx.programId),
    ]);
    const rows: UnifiedRow[] = [
      ...inquiries.map((q) => ({
        id: `inq-${q.id}`,
        title: cut20(q.subject || q.body),
        senderRole: 'mentee',
        senderName: q.menteeName ?? '멘티',
        at: q.created_at,
        checked: q.status !== 'open',
        href: '/nextlab/board?tab=inquiries',
      })),
      ...posts.map((p) => ({
        id: `post-${p.id}`,
        title: cut20(p.title || p.body),
        senderRole: p.authorRole ?? 'mentor',
        senderName: p.authorName ?? '-',
        at: p.created_at,
        checked: p.replies.length > 0,
        href: '/nextlab/board?tab=qna',
      })),
      ...inbox.map((r) => ({
        id: `req-${r.kind}-${r.id}`,
        title: cut20(`${KIND_LABEL[r.kind] ?? '요청'} — ${r.ownerName}/${r.businessName}`),
        senderRole: r.kind === 'mentor_change' ? 'mentee' : 'mentor',
        senderName: r.requesterName,
        at: r.createdAt,
        checked: r.status !== 'pending',
        href: '/nextlab/board?tab=requests&sub=all',
      })),
      ...opReqs.map((r) => ({
        id: `opr-${r.id}`,
        title: cut20(r.title || r.body),
        senderRole: 'mentor',
        senderName: r.createdByName ?? '-',
        at: r.created_at,
        checked: !!r.read_at,
        href: '/nextlab/dashboard',
      })),
      ...messages.map((m) => ({
        id: `msg-${m.id}`,
        title: cut20(m.body),
        senderRole: m.senderRole,
        senderName: m.senderName,
        at: m.createdAt,
        checked: m.read,
        href: '/nextlab/board?tab=messages',
      })),
    ]
      .filter((r) => !from || r.senderRole === from)
      .sort((a, b) => (a.at < b.at ? 1 : -1));

    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">발송자 모아보기:</span>
          {SENDER_FILTERS.map((f) => (
            <Link
              key={f.key || 'all'}
              href={`/nextlab/board?tab=all${f.key ? `&from=${f.key}` : ''}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${from === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">제목</th>
                <th className="px-3 py-2">발송자</th>
                <th className="px-3 py-2">발송일시</th>
                <th className="px-3 py-2">확인여부</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">등록된 글이 없습니다.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={cn('border-b last:border-0', !r.checked && 'bg-amber-50/40 dark:bg-amber-950/20')}>
                  <td className="px-3 py-2">
                    <Link href={r.href} className="font-medium hover:underline">{r.title}</Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="mr-1.5 text-[10px]">{SENDER_LABEL[r.senderRole] ?? r.senderRole}</Badge>
                    {r.senderName}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-2">
                    {r.checked ? (
                      <span className="rounded-full bg-status-approved/10 px-2 py-0.5 text-xs font-semibold text-status-approved">확인</span>
                    ) : (
                      <span className="rounded-full bg-status-progress/10 px-2 py-0.5 text-xs font-semibold text-status-progress">미확인</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === 'inquiries') {
    const inquiries = await listInquiries();
    const openCount = inquiries.filter((q) => q.status === 'open').length;
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">멘티 문의를 확인하고 답변합니다. 미답변 <span className="font-semibold text-status-progress">{openCount}건</span></p>
        {inquiries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">접수된 문의가 없습니다.</div>
        ) : (
          inquiries.map((q) => {
            const answered = q.status !== 'open';
            return (
              <Card key={q.id} className={cn(!answered && 'border-status-progress/40')}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      <Badge variant="secondary" className="mr-2 align-middle text-[11px]">{INQUIRY_CATEGORY_LABELS[q.category] ?? '기타'}</Badge>
                      {q.subject}
                    </CardTitle>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', answered ? 'bg-status-approved/10 text-status-approved' : 'bg-status-progress/10 text-status-progress')}>
                      {INQUIRY_STATUS_LABELS[q.status] ?? '접수'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {q.menteeName ?? '멘티'}{q.businessName ? ` · ${q.businessName}` : ''} · {formatDateTime(q.created_at)}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="whitespace-pre-wrap text-sm">{q.body}</p>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">{q.answer ? '답변 (수정 가능)' : '답변 작성'}</p>
                    <InquiryAnswerForm id={q.id} initialAnswer={q.answer ?? undefined} />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    );
  }

  if (tab === 'qna') {
    const posts = await listBoardPosts();
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">멘토단의 문의·요청을 확인하고 답변합니다. 운영사는 모든 글(운영사 전용 포함)을 볼 수 있습니다.</p>
        <QnaBoard posts={posts} currentUserId={profile.id} currentRole={profile.role} />
      </div>
    );
  }

  if (tab === 'requests') {
    const all = searchParams.sub === 'all';
    const items = await listInbox(ctx.programId, ctx.supportTypeId ?? undefined, !all);
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">멘토의 추가 회차·중도 종료 요청과 멘티의 멘토 변경 요청을 처리합니다. {ctx.group ? `(${ctx.group.name})` : ''}</p>
          <div className="flex gap-1">
            <Link href="/nextlab/board?tab=requests" className={`rounded-full px-3 py-1 text-xs font-semibold ${!all ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>대기</Link>
            <Link href="/nextlab/board?tab=requests&sub=all" className={`rounded-full px-3 py-1 text-xs font-semibold ${all ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>전체</Link>
          </div>
        </div>
        <InboxList items={items} />
      </div>
    );
  }

  if (tab === 'messages') {
    const messages = await listProgramMessages(ctx.programId);
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">담당 멘토 ↔ 멘티가 주고받은 메시지입니다 (운영사 열람 전용 — 답장은 당사자 화면에서). 미확인 = 수신자가 아직 읽지 않음.</p>
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">멘티(케이스)</th>
                <th className="px-3 py-2">발송자</th>
                <th className="px-3 py-2">내용</th>
                <th className="px-3 py-2">발송일시</th>
                <th className="px-3 py-2">확인</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">주고받은 메시지가 없습니다.</td></tr>
              )}
              {messages.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/nextlab/cases/${m.caseId}`} className="hover:underline">{m.ownerName}<span className="text-muted-foreground">/{m.businessName}</span></Link>
                  </td>
                  <td className="px-3 py-2"><Badge variant="secondary" className="mr-1 text-[10px]">{SENDER_LABEL[m.senderRole]}</Badge>{m.senderName}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground">{cut20(m.body)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{formatDateTime(m.createdAt)}</td>
                  <td className="px-3 py-2 text-xs">{m.read ? '확인' : <span className="font-semibold text-status-progress">미확인</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === 'faq') {
    const faqs = await listAllFaqs('mentor');
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">멘토 안내 페이지 하단에 노출되는 FAQ를 추가·수정·삭제합니다. 정렬 순서가 작을수록 위에 표시되고, ‘게시’를 끄면 멘토에게 노출되지 않습니다.</p>
        <FaqManager faqs={faqs} />
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">게시판</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          멘티 문의 · 멘토·운영 게시판 · 요청함 · 멘토·멘티 메시지 · 멘토 FAQ 를 한곳에서 봅니다. 새 글이 등록되면 대시보드에 알림이 표시됩니다.
        </p>
      </div>
      <nav className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/nextlab/board?tab=${t.key}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </main>
  );
}
