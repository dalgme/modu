import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/cases/status-badge';
import { formatDate } from '@/lib/utils/format';
import type { CaseListItem } from '@/lib/data/cases';

/** 멘토 대시보드: 담당 케이스 카드 */
export function CaseCard({ item, basePath }: { item: CaseListItem; basePath: string }) {
  return (
    <Link href={`${basePath}/${item.id}`}>
      <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{item.business_name}</CardTitle>
            <StatusBadge status={item.status} showStep />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>대표자 {item.owner_name}</span>
          <span>{item.supportTypeName ?? '-'}</span>
          <span className="text-xs">등록 {formatDate(item.created_at)}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
