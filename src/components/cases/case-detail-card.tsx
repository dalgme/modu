import { Building2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatKRW } from '@/lib/utils/format';
import type { CaseListItem } from '@/lib/data/cases';
import { cn } from '@/lib/utils';
import {
  ACCENT_BADGE,
  ACCENT_CARD,
  ACCENT_TITLE,
  type SectionAccent,
} from '@/components/cases/section-accent';
import { NaverMapLink } from '@/components/cases/naver-map-link';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '-'}</dd>
    </div>
  );
}

/**
 * 이메일이 시스템 자동발급(합성) 주소인지 판별. 접수 시 이메일 미입력이면
 * 멘티 로그인용으로 `m-xxxx@mentee.local` 를 만드는데, 이는 실제 연락 이메일이 아니므로
 * 상세 화면에는 표시하지 않는다.
 */
function displayEmail(email: string | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase().endsWith('@mentee.local') ? null : email;
}

/** 케이스 기본정보 상세 (접수신청서 필드). action = 우측 상단 액션(예: 운영사 요청 등록) */
export function CaseDetailCard({
  item,
  accent,
  action,
}: {
  item: CaseListItem;
  accent?: SectionAccent;
  action?: React.ReactNode;
}) {
  const isClosure = item.supportTypeCode === 'closure';
  return (
    <Card className={accent && ACCENT_CARD[accent]}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle
            className={cn('flex items-center gap-2 text-base', accent && ACCENT_TITLE[accent])}
          >
            {accent && (
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', ACCENT_BADGE[accent])}>
                <Building2 className="h-3.5 w-3.5" />
              </span>
            )}
            신청 정보
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          <Row label="지원유형" value={item.supportTypeName} />
          <Row label="업체명" value={item.business_name} />
          <Row label="대표자" value={item.owner_name} />
          <Row label="사업자등록번호" value={item.business_reg_no} />
          <Row label="연락처" value={item.phone} />
          <Row label="이메일" value={displayEmail(item.email)} />
          <Row label="사업장 주소" value={<NaverMapLink address={item.address} />} />
          <Row
            label="업태 / 종목"
            value={[item.business_type, item.item].filter(Boolean).join(' / ')}
          />
          <Row label="개업연월일" value={formatDate(item.opened_at)} />
          <Row label="상시근로자수" value={item.employee_count ?? '-'} />
          {isClosure && (
            <>
              <Row
                label="폐업 구분"
                value={
                  item.closure_status === 'closed'
                    ? '폐업'
                    : item.closure_status === 'pending'
                      ? '폐업예정'
                      : '-'
                }
              />
              <Row label="폐업(예정)연월일" value={formatDate(item.closed_at)} />
              <Row label="전용면적(평)" value={item.exclusive_area_pyeong ?? '-'} />
              <Row label="전년 매출액" value={formatKRW(item.revenue_last_year)} />
              <Row label="임대차보증금" value={formatKRW(item.lease_deposit)} />
              <Row label="월세금액" value={formatKRW(item.monthly_rent)} />
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
