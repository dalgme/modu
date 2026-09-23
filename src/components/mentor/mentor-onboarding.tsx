import Link from 'next/link';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';

/** 멘토 시작 체크리스트 (대시보드 상단, P28) — 미완료 항목이 있을 때만 보인다. */
export interface MentorOnboardingItem {
  done: boolean;
  label: string;
  desc: string;
  href: string;
}

export function MentorOnboarding({ items }: { items: MentorOnboardingItem[] }) {
  if (items.every((i) => i.done)) return null;
  const doneCount = items.filter((i) => i.done).length;
  return (
    <section className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Sparkles className="h-4 w-4 text-primary" /> 시작 전 준비 <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{doneCount}/{items.length}</span>
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className={`flex items-start gap-2 rounded-xl border bg-background p-3 text-sm hover:border-primary ${i.done ? 'opacity-70' : ''}`}>
              {i.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              <span className="flex flex-col">
                <span className="font-semibold">{i.label}</span>
                <span className="text-[11px] text-muted-foreground">{i.desc}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
