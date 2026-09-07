import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import { ProcessStepBar } from '@/components/cases/process-step-bar';
import { StatusBadge } from '@/components/cases/status-badge';
import { ApplicationPdfButton } from '@/components/cases/application-pdf-button';
import { MentorElapsedBadge } from '@/components/cases/mentor-elapsed-card';
import { MenteeGuideSmsButton } from '@/components/nextlab/mentee-guide-sms-button';
import { EditGrantBadge } from '@/components/cases/edit-grant-badge';

/**
 * 업체별 프로세스 진행단계 시각화 리스트.
 * 각 행 = 업체명 + 지원유형 + 상태배지 + 11단계 진행막대.
 * @param showMenteeGuideSms 각 bar 하단에 '멘티 안내 문자보내기' 버튼 노출(넥스트랩 전용)
 * @param menteeGuideSentAt  케이스ID → 안내문자 발송일시(ISO). 있으면 버튼 대신 발송일시 표시
 */
export function CaseProgressList({
  items,
  basePath,
  emptyText = '표시할 케이스가 없습니다.',
  showMenteeGuideSms = false,
  menteeGuideSentAt,
  editGrantCaseIds,
}: {
  items: CaseListItem[];
  basePath: string;
  emptyText?: string;
  showMenteeGuideSms?: boolean;
  menteeGuideSentAt?: Map<string, string>;
  /** 임시 수정권한이 열려 있는 케이스ID 집합 */
  editGrantCaseIds?: Set<string>;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((c) => (
        <div
          key={c.id}
          className="relative rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
        >
          {/* 카드 전체 클릭 → 케이스 상세 (stretched link, 비대화형 영역 위) */}
          <Link
            href={`${basePath}/${c.id}`}
            aria-label={`${c.business_name} 상세`}
            className="absolute inset-0 z-0 rounded-lg"
          />
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.business_name}</span>
              {c.menteeLoginId && (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <span className="text-primary/70">멘티 ID</span>
                  <span className="font-mono">{c.menteeLoginId}</span>
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {c.supportTypeName ?? '-'}
                {c.mentorName ? ` · 멘토 ${c.mentorName}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {c.hasApplicationPdf && <ApplicationPdfButton caseId={c.id} />}
              {c.regeneratedFormCount > 0 && (
                <span
                  className="rounded-full bg-status-progress/10 px-2 py-0.5 text-[11px] font-semibold text-status-progress"
                  title="일부 붙임서식이 재생성되었습니다"
                >
                  서식 재생성 {c.regeneratedFormCount}
                </span>
              )}
              <MentorElapsedBadge assignedAt={c.mentorAssignedAt} />
              <StatusBadge status={c.status} showStep />
              {editGrantCaseIds?.has(c.id) && <EditGrantBadge />}
            </div>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            대표 {c.owner_name} · 업종 {c.business_type ?? '-'}
            {c.item ? ` / ${c.item}` : ''} · ☎ {c.phone} · {c.address}
          </p>
          <ProcessStepBar status={c.status} />

          {showMenteeGuideSms && (
            <div className="relative z-10 mt-2.5 flex justify-end border-t pt-2.5">
              <MenteeGuideSmsButton caseId={c.id} sentAt={menteeGuideSentAt?.get(c.id) ?? null} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
