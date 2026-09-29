'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Search, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { ScheduleMentor } from '@/lib/data/staff-schedule-shared';

/**
 * 멘토 목록(가나다순) — 멘토별 달력·세부일정 공용 왼쪽 열. 누르면 `${hrefBase}&mentor=<id>`.
 * 폰에서는 멘토를 고른 뒤 목록을 접어 달력/표가 바로 보이게 한다(md 이상은 항상 펼침).
 */
export function MentorList({ mentors, selectedId, hrefBase }: { mentors: ScheduleMentor[]; selectedId: string | null; hrefBase: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!selectedId);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    if (!t) return mentors;
    return mentors.filter((m) => m.name.toLowerCase().includes(t) || (digits.length >= 2 && (m.phone ?? '').replace(/\D/g, '').includes(digits)));
  }, [mentors, q]);
  const selected = mentors.find((m) => m.id === selectedId) ?? null;
  const sep = hrefBase.includes('?') ? '&' : '?';

  return (
    <aside className="flex flex-col gap-2 rounded-xl border bg-background p-3 md:sticky md:top-32 md:max-h-[calc(100dvh-9rem)]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center justify-between gap-2 text-left md:pointer-events-none" aria-expanded={open}>
        <span className="text-sm font-bold">
          멘토 <span className="tabular-nums text-muted-foreground">{mentors.length}명</span>
          {selected && <span className="ml-2 font-semibold text-primary md:hidden">· {selected.name}</span>}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform md:hidden', open && 'rotate-180')} />
      </button>
      <div className={cn('min-h-0 flex-col gap-2 md:flex-1', open ? 'flex' : 'hidden md:flex')}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="멘토 이름·휴대폰" className="h-9 pl-8" aria-label="멘토 검색" />
        </div>
        {mentors.length === 0 ? (
          <p className="flex items-center gap-1.5 py-4 text-xs text-muted-foreground"><Users className="h-4 w-4" />이 범위에 배정된 멘토가 없습니다.</p>
        ) : (
          <ul className="flex max-h-[50dvh] min-h-0 flex-col gap-0.5 overflow-y-auto md:max-h-none md:flex-1">
            {shown.map((m) => {
              const active = m.id === selectedId;
              return (
                <li key={m.id}>
                  <Link
                    href={`${hrefBase}${sep}mentor=${m.id}`}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'true' : undefined}
                    className={cn('flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent', active && 'bg-primary text-primary-foreground hover:bg-primary/90')}
                  >
                    <span className="truncate font-semibold">{m.name}</span>
                    <span className={cn('shrink-0 text-[11px] tabular-nums', active ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
                      멘티 {m.activeCases} · 회차 {m.roundCount}
                    </span>
                  </Link>
                </li>
              );
            })}
            {shown.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">검색 결과가 없습니다.</li>}
          </ul>
        )}
      </div>
    </aside>
  );
}
