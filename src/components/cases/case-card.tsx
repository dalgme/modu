import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import { StatusBadge } from '@/components/cases/status-badge';
import { ProcessStepBar } from '@/components/cases/process-step-bar';
import type { Branding } from '@/lib/programs/branding';

/** 케이스 카드 (멘토·멘티 목록용) */
export function CaseCard({ item, href, branding }: { item: CaseListItem; href: string; branding?: Branding }) {
  return (
    <Link href={href} className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm transition-colors hover:border-primary/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.business_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.owner_name} · {item.supportTypeName ?? '-'}
            {item.mentorName ? ` · 멘토 ${item.mentorName}` : ''}
          </p>
        </div>
        <StatusBadge status={item.status} branding={branding} short />
      </div>
      <ProcessStepBar status={item.status} compact />
      <p className="text-xs text-muted-foreground">
        회차 {item.roundsDone}/{item.requiredRounds}
      </p>
    </Link>
  );
}
