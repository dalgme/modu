import Link from 'next/link';
import { ArrowRight, CalendarRange, Layers } from 'lucide-react';

import type { MyProgram } from '@/lib/programs/data';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/** 허브 — 행사 배너 목록 (활성 / 종료 탭) */
export function HubProgramList({
  programs,
  tab,
  isPlatformAdmin,
  role,
}: {
  programs: MyProgram[];
  tab: 'active' | 'ended';
  isPlatformAdmin: boolean;
  role: UserRole;
}) {
  const active = programs.filter((p) => p.program.status === 'active' && p.memberActive);
  const ended = programs.filter((p) => p.program.status !== 'active' || !p.memberActive);
  const list = tab === 'active' ? active : ended;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">행사 선택</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            참여 중인 행사입니다. 행사마다 역할이 다를 수 있으며(예: 한 행사에서는 멘토, 다른 행사에서는 멘티) 배너의 역할 배지로 확인합니다. 배너를 눌러 업무를 시작하세요.
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <Tab href="/hub?pick=1" active={tab === 'active'} label={`진행 중 ${active.length}`} />
          <Tab href="/hub?pick=1&tab=ended" active={tab === 'ended'} label={`종료 ${ended.length}`} />
        </nav>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {tab === 'active' ? '참여 중인 행사가 없습니다. 운영사에 문의하세요.' : '종료된 행사가 없습니다.'}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {list.map(({ program, memberActive, role: programRole }) => {
            const endedView = program.status !== 'active' || !memberActive;
            return (
              <li key={program.id}>
                <Link
                  href={`/hub?program=${program.id}${endedView ? '&tab=active' : ''}`}
                  className={cn(
                    'group flex h-full flex-col justify-between gap-4 rounded-2xl border bg-background p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5',
                    endedView && 'opacity-80',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-midnight text-lg font-bold text-midnight-foreground">
                      {program.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold">{program.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {program.client_name} · {program.operator_name}
                      </p>
                    </div>
                    <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', programRole === role ? 'bg-primary/10 text-primary' : 'bg-violet-100 text-violet-800')}>
                        {ROLE_LABELS[programRole]}
                      </span>
                      {endedView && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">종료</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarRange className="h-3.5 w-3.5" />
                      {program.starts_on ? formatDate(program.starts_on) : '-'} ~{' '}
                      {program.ends_on ? formatDate(program.ends_on) : '-'}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      <Layers className="h-3.5 w-3.5" />
                      그룹 선택 <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {isPlatformAdmin && (
        <p className="text-xs text-muted-foreground">
          플랫폼 통합관리자는 모든 행사가 표시됩니다. 행사 개설·계정 통합 조회·시스템 상태는 상단 배지 또는{' '}
          <Link href="/platform" className="font-semibold text-violet-700 underline">플랫폼 통합관리 콘솔</Link>에서 합니다.
        </p>
      )}
    </section>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-3 py-1.5 font-medium transition-colors',
        active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </Link>
  );
}
