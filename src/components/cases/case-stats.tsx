import { Card, CardContent } from '@/components/ui/card';
import { CASE_STATUS_META } from '@/types/case-status';
import type { CaseListItem } from '@/lib/data/cases';

function tally(items: CaseListItem[]) {
  let progress = 0;
  let approved = 0;
  let rejected = 0;
  let unassigned = 0;
  for (const c of items) {
    const tone = CASE_STATUS_META[c.status].tone;
    if (tone === 'progress' || tone === 'pending') progress += 1;
    if (tone === 'approved') approved += 1;
    if (tone === 'rejected') rejected += 1;
    if (!c.mentorName) unassigned += 1;
  }
  return { total: items.length, progress, approved, rejected, unassigned };
}

const TILES: { key: keyof ReturnType<typeof tally>; label: string; className: string }[] = [
  { key: 'total', label: '전체', className: 'text-foreground' },
  { key: 'progress', label: '진행중', className: 'text-status-progress' },
  { key: 'approved', label: '승인·완료', className: 'text-status-approved' },
  { key: 'rejected', label: '반려', className: 'text-status-rejected' },
  { key: 'unassigned', label: '멘토 미배정', className: 'text-status-pending' },
];

export function CaseStats({ items }: { items: CaseListItem[] }) {
  const counts = tally(items);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {TILES.map((t) => (
        <Card key={t.key}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${t.className}`}>
              {counts[t.key]}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
