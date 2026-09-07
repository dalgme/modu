import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import type { CaseListItem } from '@/lib/data/cases';
import { StatusBadge } from '@/components/cases/status-badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';
import type { Branding } from '@/lib/programs/branding';

/** "지금 처리할 것" 목록 — 역할별 대시보드 상단 */
export function CaseActionQueue({
  title,
  description,
  items,
  basePath,
  ctaLabel,
  emptyText,
  branding,
}: {
  title: string;
  description?: string;
  items: CaseListItem[];
  basePath: string;
  ctaLabel: string;
  emptyText: string;
  branding?: Branding;
}) {
  return (
    <section className="rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{items.length}</span>
      </div>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <span className="font-medium">{c.business_name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.owner_name} · {c.supportTypeName ?? '-'} · {formatDate(c.updated_at)}
                </span>
                <span className="ml-2">
                  <StatusBadge status={c.status} branding={branding} short />
                </span>
              </div>
              <Button asChild size="sm" className="gap-1">
                <Link href={`${basePath}/${c.id}`}>
                  {ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
