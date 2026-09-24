import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import { StatusBadge } from '@/components/cases/status-badge';
import { CaseStepNumbers } from '@/components/cases/case-step-numbers';
import { MentorName } from '@/components/common/mentor-name';
import { RoundDots } from '@/components/common/round-dots';
import { ContactLinks } from '@/components/common/contact-links';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/utils/format';
import { menteeLabel } from '@/lib/utils/labels';
import { CASE_STEP_ORDER, CASE_STATUS_META } from '@/types/case-status';
import type { Branding } from '@/lib/programs/branding';

/** 7단계가 무엇인지 표 상단 범례 (P25-14) */
export function CaseStepLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span className="font-semibold text-foreground">단계 :</span>
      {CASE_STEP_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-semibold tabular-nums">{CASE_STATUS_META[s].step}</span>
          {CASE_STATUS_META[s].short}
        </span>
      ))}
    </p>
  );
}

/** 케이스 목록 표 (스태프·멘토 공용). 행 클릭 → 상세. */
export function CaseTable({
  items,
  basePath,
  branding,
  showMentor = true,
  showGroup = true,
  emptyText = '케이스가 없습니다.',
  showLegend = false,
  caption,
}: {
  items: CaseListItem[];
  basePath: string;
  branding?: Branding;
  showMentor?: boolean;
  showGroup?: boolean;
  emptyText?: string;
  showLegend?: boolean;
  /** 표 위 안내 (예: "필터 결과 12건 / 전체 80건", P30) */
  caption?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      {showLegend && <CaseStepLegend />}
      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>멘티 (이름/연락처)</TableHead>
              {showGroup && <TableHead className="hidden md:table-cell">라운드</TableHead>}
              {showMentor && <TableHead>담당 멘토</TableHead>}
              <TableHead>회차</TableHead>
              <TableHead>단계</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="hidden text-right md:table-cell">등록일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`${basePath}/${c.id}`} className="font-medium hover:underline">
                    {menteeLabel(c.owner_name, c.business_name)}
                  </Link>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{c.phone || '-'}</span>
                    {/* (P31) 목록에서 바로 전화·문자 */}
                    <ContactLinks phone={c.phone} name={c.owner_name} size="xs" />
                  </div>
                </TableCell>
                {showGroup && <TableCell className="hidden text-sm md:table-cell">{c.supportTypeName ?? '-'}</TableCell>}
                {showMentor && (
                  <TableCell className="text-sm">
                    {c.mentorId && c.mentorName ? <MentorName id={c.mentorId} name={c.mentorName} count={c.mentorActiveCount} caseHrefBase={basePath} /> : <span className="text-muted-foreground">미배정</span>}
                  </TableCell>
                )}
                <TableCell>
                  <RoundDots done={c.roundsDone} required={c.requiredRounds} />
                </TableCell>
                <TableCell>
                  <CaseStepNumbers status={c.status} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} branding={branding} short />
                </TableCell>
                <TableCell className="hidden text-right text-xs text-muted-foreground md:table-cell">{formatDate(c.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
