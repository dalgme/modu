import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import { StatusBadge } from '@/components/cases/status-badge';
import { CaseStepNumbers } from '@/components/cases/case-step-numbers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/utils/format';
import type { Branding } from '@/lib/programs/branding';

/** 케이스 목록 표 (스태프·멘토 공용). 행 클릭 → 상세. */
export function CaseTable({
  items,
  basePath,
  branding,
  showMentor = true,
  showGroup = true,
  emptyText = '케이스가 없습니다.',
}: {
  items: CaseListItem[];
  basePath: string;
  branding?: Branding;
  showMentor?: boolean;
  showGroup?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>멘티 (이름/소속)</TableHead>
            {showGroup && <TableHead>그룹</TableHead>}
            {showMentor && <TableHead>담당 멘토</TableHead>}
            <TableHead className="text-center">회차</TableHead>
            <TableHead>단계</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="text-right">등록일</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                {/* 멘티 표시 형식 = "이름/소속" (P20 결정) */}
                <Link href={`${basePath}/${c.id}`} className="font-medium hover:underline">
                  {c.owner_name}
                  <span className="font-normal text-muted-foreground">/{c.business_name}</span>
                </Link>
              </TableCell>
              {showGroup && <TableCell className="text-sm">{c.supportTypeName ?? '-'}</TableCell>}
              {showMentor && <TableCell className="text-sm">{c.mentorName ?? <span className="text-muted-foreground">미배정</span>}</TableCell>}
              <TableCell className="text-center text-sm tabular-nums">
                {c.roundsDone}/{c.requiredRounds}
              </TableCell>
              <TableCell>
                <CaseStepNumbers status={c.status} />
              </TableCell>
              <TableCell>
                <StatusBadge status={c.status} branding={branding} short />
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">{formatDate(c.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
