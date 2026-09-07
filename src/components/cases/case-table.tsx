import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/cases/status-badge';
import { CaseStepNumbers } from '@/components/cases/case-step-numbers';
import { CaseRowActions } from '@/components/cases/case-row-actions';
import { CaseWithdrawButton } from '@/components/cases/case-withdraw-button';
import { EditGrantBadge } from '@/components/cases/edit-grant-badge';
import { formatDate } from '@/lib/utils/format';
import type { CaseListItem } from '@/lib/data/cases';

interface CaseTableProps {
  items: CaseListItem[];
  /** 상세 링크 기준 경로 (예: '/institution/cases', '/nextlab/cases') */
  basePath: string;
  /** 지원신청서 수동 접수 처리된 케이스ID 집합 (버튼 자리에 완료 표시용) */
  manuallyReceivedIds?: Set<string>;
  /** 임시 수정권한이 열려 있는 케이스ID 집합 */
  editGrantCaseIds?: Set<string>;
  /** 케이스ID → 멘토링 회차 수(일지 웹작성 + 업로드 보고서) */
  roundCounts?: Map<string, number>;
}

/** 진흥원·넥스트랩 전체 케이스 테이블 */
export function CaseTable({
  items,
  basePath,
  manuallyReceivedIds,
  editGrantCaseIds,
  roundCounts,
}: CaseTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        조건에 맞는 케이스가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>업체명 / 대표자</TableHead>
            <TableHead>지원유형</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>컨설팅</TableHead>
            <TableHead>담당 멘토</TableHead>
            <TableHead>등록일</TableHead>
            <TableHead>수동 처리</TableHead>
            <TableHead>종료/포기</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id} className="cursor-pointer">
              <TableCell>
                <Link href={`${basePath}/${c.id}`} className="block font-medium hover:underline">
                  {c.business_name}
                </Link>
                <span className="text-xs text-muted-foreground">{c.owner_name}</span>
              </TableCell>
              <TableCell className="text-sm">{c.supportTypeName ?? '-'}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1.5">
                  <CaseStepNumbers status={c.status} />
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={c.status} showStep />
                    {editGrantCaseIds?.has(c.id) && <EditGrantBadge />}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {(() => {
                  const n = roundCounts?.get(c.id) ?? 0;
                  return (
                    <span
                      className={
                        n > 0
                          ? 'inline-flex items-center rounded-full bg-status-approved/15 px-2 py-0.5 text-xs font-semibold text-status-approved'
                          : 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {n > 0 ? `${n}회차` : '미진행'}
                    </span>
                  );
                })()}
              </TableCell>
              <TableCell className="text-sm">{c.mentorName ?? '미배정'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(c.created_at)}
              </TableCell>
              <TableCell>
                <CaseRowActions
                  caseId={c.id}
                  status={c.status}
                  manuallyReceived={manuallyReceivedIds?.has(c.id) ?? false}
                />
              </TableCell>
              <TableCell>
                <CaseWithdrawButton caseId={c.id} status={c.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
