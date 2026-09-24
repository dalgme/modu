import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import type { Branding } from '@/lib/programs/branding';
import { MenteeJourney } from '@/components/cases/mentee-journey';
import { StatusBadge } from '@/components/cases/status-badge';
import { formatDate } from '@/lib/utils/format';
import { MentorChangeRequest } from '@/components/mentee/mentor-change-request';
import { MentorContactCard } from '@/components/mentee/mentor-contact-card';
import type { MenteeDashboardExtra } from '@/lib/data/role-dashboard';
import { PenLine, ClipboardList, FileWarning, CheckCircle2 } from 'lucide-react';

/** 멘티 대시보드 본문 — 현재 그룹 케이스의 여정 + 다른 그룹(승계) 케이스 목록 */
export interface MenteeTodo {
  unsignedRounds: number;
  surveyOpen: boolean;
  surveyDone: boolean;
  missingDocs: string[];
  canRequestChange: boolean;
  pendingChange: { created_at: string; reason: string } | null;
  lastDecision: { status: string; handled_at: string | null; handling_note: string | null } | null;
}

export function MenteeDashboardBody({
  name,
  cases,
  branding,
  todo,
  extra,
}: {
  name: string;
  cases: CaseListItem[];
  branding: Branding;
  todo?: MenteeTodo | null;
  /** 담당 멘토 연락처·다음 일정 (P28) */
  extra?: MenteeDashboardExtra | null;
}) {
  const [primary, ...others] = cases;
  // 승계 체인 순서: predecessor_case_id 를 따라 "이전 → 그 이전" 순으로 정렬해 몇 단계 전인지 표시 (P30)
  const byId = new Map(cases.map((c) => [c.id, c]));
  const chain: CaseListItem[] = [];
  let cursor = primary?.predecessor_case_id ?? null;
  for (let i = 0; i < 10 && cursor; i += 1) {
    const prev = byId.get(cursor);
    if (!prev) break;
    chain.push(prev);
    cursor = prev.predecessor_case_id;
  }
  const chainIds = new Set(chain.map((c) => c.id));
  const unrelated = others.filter((c) => !chainIds.has(c.id));
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{name}님, 안녕하세요</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {primary ? `${primary.supportTypeName ?? ''} 컨설팅 진행 현황입니다.` : '아직 등록된 컨설팅이 없습니다. 운영사에 문의해 주세요.'}
        </p>
      </div>

      {primary && (
        <>
          <MenteeJourney
            status={primary.status}
            roundsDone={primary.roundsDone}
            requiredRounds={primary.requiredRounds}
            branding={branding}
          />
          {extra && <MentorContactCard extra={extra} />}
          {todo && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Link href="/mentee/rounds" className={`flex items-center gap-2 rounded-xl border p-3 text-sm shadow-sm ${todo.unsignedRounds > 0 ? 'border-amber-300 bg-amber-50/50' : 'bg-background'}`}>
                <PenLine className="h-5 w-5 shrink-0 text-primary" />
                <span>
                  <b>회차 확인·서명</b>
                  <br />
                  <span className="text-xs text-muted-foreground">{todo.unsignedRounds > 0 ? `서명 대기 ${todo.unsignedRounds}회차` : `${primary.roundsDone}회차 모두 확인`}</span>
                </span>
              </Link>
              <Link href="/mentee/survey" className={`flex items-center gap-2 rounded-xl border p-3 text-sm shadow-sm ${todo.surveyOpen ? 'border-amber-300 bg-amber-50/50' : 'bg-background'}`}>
                {todo.surveyDone ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <ClipboardList className="h-5 w-5 shrink-0 text-primary" />}
                <span>
                  <b>만족도 조사</b>
                  <br />
                  <span className="text-xs text-muted-foreground">{todo.surveyDone ? '응답 완료' : todo.surveyOpen ? '참여해 주세요' : '목표 회차 보고서가 모두 등록되면 열립니다'}</span>
                </span>
              </Link>
              <Link href="/mentee/documents" className={`flex items-center gap-2 rounded-xl border p-3 text-sm shadow-sm ${todo.missingDocs.length > 0 ? 'border-amber-300 bg-amber-50/50' : 'bg-background'}`}>
                {todo.missingDocs.length > 0 ? <FileWarning className="h-5 w-5 shrink-0 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                <span>
                  <b>내 서류</b>
                  <br />
                  <span className="text-xs text-muted-foreground">{todo.missingDocs.length > 0 ? `필수서류 누락: ${todo.missingDocs.join(', ')}` : '필수서류 제출 완료'}</span>
                </span>
              </Link>
            </div>
          )}
          <MentorChangeRequest caseId={primary.id} mentorName={primary.mentorName} canRequest={!!todo?.canRequestChange} pending={todo?.pendingChange ?? null} lastDecision={todo?.lastDecision ?? null} />
        </>
      )}

      {chain.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">이전 단계 이력</h2>
          <p className="text-xs text-muted-foreground">현재 컨설팅은 아래 단계에서 이어졌습니다. 이전 회차·서류는 그대로 보존됩니다.</p>
          <ul className="flex flex-col gap-2">
            {chain.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <span>
                  <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{i + 1}단계 전</span>
                  {c.supportTypeName ?? '-'} · 멘토 {c.mentorName ?? '-'} · 회차 {c.roundsDone}/{c.requiredRounds} · {formatDate(c.created_at)}
                </span>
                <StatusBadge status={c.status} branding={branding} short />
              </li>
            ))}
          </ul>
        </section>
      )}
      {unrelated.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">다른 그룹 참여 이력</h2>
          <ul className="flex flex-col gap-2">
            {unrelated.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <span>
                  {c.supportTypeName ?? '-'} · 멘토 {c.mentorName ?? '-'} · {formatDate(c.created_at)}
                </span>
                <StatusBadge status={c.status} branding={branding} short />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        문의가 있으면 <Link href="/mentee/inquiries" className="underline">문의하기</Link>를 이용하세요.
      </p>
    </div>
  );
}
