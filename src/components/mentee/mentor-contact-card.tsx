import { Mail, Phone, CalendarClock, MessageSquare } from 'lucide-react';
import Link from 'next/link';

import type { MenteeDashboardExtra } from '@/lib/data/role-dashboard';

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${day}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 멘티 대시보드 — 담당 멘토 연락처 + 다음 컨설팅 일정 (P28). 전화·이메일은 바로 걸 수 있는 링크 */
export function MentorContactCard({ extra, messagesHref = '/mentee/inquiries?tab=messages', scheduleHref = '/mentee/schedule' }: { extra: MenteeDashboardExtra; messagesHref?: string; scheduleHref?: string }) {
  const m = extra.mentor;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-xl border-2 bg-background p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">담당 멘토</p>
        {m ? (
          <>
            <p className="mt-1 text-lg font-bold">{m.name} <span className="text-sm font-normal text-muted-foreground">{m.organization ?? ''}</span></p>
            {m.expertise.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1">{m.expertise.map((e) => <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{e}</span>)}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {m.phone && <a href={`tel:${m.phone.replace(/\D/g, '')}`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"><Phone className="h-3.5 w-3.5" />{m.phone}</a>}
              {m.email && <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"><Mail className="h-3.5 w-3.5" />{m.email}</a>}
              <Link href={messagesHref} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"><MessageSquare className="h-3.5 w-3.5" /> 메시지</Link>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">아직 담당 멘토가 배정되지 않았습니다. 배정되면 여기에 연락처가 나타납니다.</p>
        )}
      </div>
      <div className="rounded-xl border-2 bg-background p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">다음 컨설팅</p>
        {extra.nextPlanned ? (
          <>
            <p className="mt-1 flex items-center gap-2 text-lg font-bold"><CalendarClock className="h-5 w-5 text-primary" />{fmtWhen(extra.nextPlanned.startedAt)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{extra.nextPlanned.roundNo}회차 · {extra.nextPlanned.mode === 'online' ? '온라인' : '오프라인'}{extra.nextPlanned.place ? ` · ${extra.nextPlanned.place}` : ''}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{extra.lastDone ? `마지막 컨설팅 ${fmtWhen(extra.lastDone.startedAt)} (${extra.lastDone.roundNo}회차). 다음 일정은 멘토가 등록하면 표시됩니다.` : '예정된 일정이 없습니다. 멘토가 일정을 등록하면 여기에 표시됩니다.'}</p>
        )}
        <Link href={scheduleHref} className="mt-2 inline-block text-xs text-primary hover:underline">전체 일정 보기 →</Link>
      </div>
    </div>
  );
}
