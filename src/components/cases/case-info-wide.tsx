import { Mail } from 'lucide-react';

import { menteeOrg } from '@/lib/utils/labels';
import type { CaseListItem } from '@/lib/data/cases';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils/format';
import { ContactLinks } from '@/components/common/contact-links';

/**
 * 멘티 정보 — 가로형 (2026-09-30, 멘토 케이스 화면).
 * 세로로 길던 14줄 목록을 ① 연락 ② 소속·그룹 ③ 진행 ④ 등록일 네 칸 타일 한 줄로 모으고,
 * 아이템(아이디어)은 전체 폭 한 줄, 값이 있는 사업 정보만 칩으로 덧붙인다(빈 '-' 줄 제거).
 * 진행 단계는 위 색깔 단계 막대가 보여 주므로 이 화면에서는 진행 이력 카드를 두지 않는다.
 */
export function CaseInfoWide({ item }: { item: CaseListItem }) {
  const org = menteeOrg(item.owner_name, item.business_name);
  const extras: { label: string; value: string }[] = [
    item.business_type ? { label: '업종', value: item.business_type } : null,
    item.business_reg_no ? { label: '사업자등록번호', value: item.business_reg_no } : null,
    item.opened_at ? { label: '창업일', value: formatDate(item.opened_at) } : null,
    item.employee_count != null ? { label: '직원 수', value: `${item.employee_count}명` } : null,
    item.address ? { label: '주소', value: item.address } : null,
  ].filter((x): x is { label: string; value: string } => !!x);
  const pct = item.requiredRounds > 0 ? Math.min(100, Math.round((item.roundsDone / item.requiredRounds) * 100)) : 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">멘티 정보</h2>
          <span className="text-[11px] text-muted-foreground">등록일 {formatDate(item.created_at)}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* ① 연락 */}
          <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
            <span className="text-[11px] font-medium text-muted-foreground">연락처</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums">{item.phone || '-'}</span>
              <ContactLinks phone={item.phone} name={item.owner_name} size="xs" />
            </div>
            {item.email ? (
              <a href={`mailto:${item.email}`} className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{item.email}</span>
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">이메일 없음</span>
            )}
          </div>

          {/* ② 멘티 · 소속 · 그룹 */}
          <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
            <span className="text-[11px] font-medium text-muted-foreground">멘티 · 소속</span>
            <span className="text-sm font-semibold">
              {item.owner_name}
              {org && <span className="ml-1 font-normal text-muted-foreground">/ {org}</span>}
            </span>
            <span className="inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{item.supportTypeName ?? '그룹 미지정'}</span>
          </div>

          {/* ③ 진행 (보고서 등록 기준) */}
          <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3">
            <span className="text-[11px] font-medium text-muted-foreground">컨설팅 진행 (보고서 등록)</span>
            <span className="text-sm font-semibold tabular-nums">
              {item.roundsDone} / {item.requiredRounds}회
            </span>
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </span>
          </div>

          {/* ④ 담당 멘토 */}
          <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
            <span className="text-[11px] font-medium text-muted-foreground">담당 멘토</span>
            <span className="text-sm font-semibold">{item.mentorName ?? '미배정'}</span>
          </div>
        </div>

        {item.item && (
          <p className="flex gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
            <span className="shrink-0 text-[11px] font-medium leading-5 text-muted-foreground">아이템</span>
            <span className="min-w-0 break-words">{item.item}</span>
          </p>
        )}

        {extras.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {extras.map((x) => (
              <div key={x.label} className="flex gap-1.5">
                <dt className="text-muted-foreground">{x.label}</dt>
                <dd className="font-medium">{x.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
