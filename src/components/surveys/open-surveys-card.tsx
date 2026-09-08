import Link from 'next/link';
import { ClipboardList } from 'lucide-react';

import { formatDateTime } from '@/lib/utils/format';

/** 대시보드 — 내가 응답해야 할 열린 조사 (서버 컴포넌트에서 데이터를 받아 렌더만) */
export function OpenSurveysCard({ surveys }: { surveys: { token: string; title: string; endsAt: string | null }[] }) {
  if (surveys.length === 0) return null;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ClipboardList className="h-4 w-4 text-primary" /> 참여할 조사 {surveys.length}건
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {surveys.map((s) => (
          <li key={s.token} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{s.title}{s.endsAt ? <span className="ml-1 text-xs text-muted-foreground">마감 {formatDateTime(s.endsAt)}</span> : null}</span>
            <Link href={`/s/${s.token}`} className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90">응답하기</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
