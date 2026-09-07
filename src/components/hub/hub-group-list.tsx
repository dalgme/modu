import Link from 'next/link';
import { ArrowLeft, ArrowRight, Users } from 'lucide-react';

import type { MyGroup, Program } from '@/lib/programs/data';
import { cn } from '@/lib/utils';

/** 허브 — 행사 안의 그룹 배너 (스태프는 '행사 전체' 카드가 맨 앞) */
export function HubGroupList({
  program,
  groups,
  isStaff,
  tab,
}: {
  program: Program;
  groups: MyGroup[];
  isStaff: boolean;
  tab: 'active' | 'ended';
}) {
  const active = groups.filter((g) => g.group.status === 'active');
  const ended = groups.filter((g) => g.group.status !== 'active');
  const list = tab === 'active' ? active : ended;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/hub?pick=1" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> 행사 목록
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{program.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {program.client_name} · {program.operator_name} — 들어갈 그룹을 선택하세요.
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <Tab href={`/hub?program=${program.id}`} active={tab === 'active'} label={`진행 중 ${active.length}`} />
          <Tab href={`/hub?program=${program.id}&tab=ended`} active={tab === 'ended'} label={`종료 ${ended.length}`} />
        </nav>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {isStaff && tab === 'active' && (
          <li>
            <Link
              href={`/hub/enter?program=${program.id}&all=1`}
              className="group flex h-full flex-col justify-between gap-4 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 shadow-sm transition-colors hover:bg-primary/10"
            >
              <div>
                <p className="text-lg font-semibold">행사 전체</p>
                <p className="text-xs text-muted-foreground">모든 그룹의 케이스·정산·리포트를 한 화면에서 봅니다.</p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                들어가기 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        )}
        {list.map(({ group, caseCount }) => (
          <li key={group.id}>
            <Link
              href={`/hub/enter?program=${program.id}&group=${group.id}`}
              className={cn(
                'group flex h-full flex-col justify-between gap-4 rounded-2xl border bg-background p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5',
                group.status !== 'active' && 'opacity-80',
              )}
            >
              <div>
                <p className="text-lg font-semibold">{group.name}</p>
                {group.description && <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> 케이스 {caseCount}건 · {group.round_label} {group.required_rounds}회
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  들어가기 <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </li>
        ))}
        {list.length === 0 && !(isStaff && tab === 'active') && (
          <li className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground sm:col-span-2">
            {tab === 'active' ? '참여 중인 그룹이 없습니다.' : '종료된 그룹이 없습니다.'}
          </li>
        )}
      </ul>
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
