import type { CaseListItem } from '@/lib/data/cases';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils/format';

/** 멘티(케이스) 기본 정보 카드 */
export function CaseDetailCard({ item, showLoginId = false }: { item: CaseListItem; showLoginId?: boolean }) {
  const rows: { label: string; value: string | null }[] = [
    { label: '멘티(대표자)', value: item.owner_name },
    { label: '기업·팀명', value: item.business_name },
    { label: '사업그룹', value: item.supportTypeName },
    { label: '연락처', value: item.phone },
    { label: '이메일', value: item.email },
    { label: '사업자등록번호', value: item.business_reg_no },
    { label: '주소', value: item.address },
    { label: '업종', value: item.business_type },
    { label: '아이템', value: item.item },
    { label: '창업(개업)일', value: item.opened_at ? formatDate(item.opened_at) : null },
    { label: '직원 수', value: item.employee_count != null ? `${item.employee_count}명` : null },
    { label: '담당 멘토', value: item.mentorName ?? '미배정' },
    { label: '회차', value: `${item.roundsDone} / ${item.requiredRounds}` },
    { label: '등록일', value: formatDate(item.created_at) },
  ];
  if (showLoginId) rows.push({ label: '멘티 로그인 아이디', value: item.menteeLoginId ?? '(계정 미발급)' });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">멘티 정보</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted-foreground">{r.label}</dt>
              <dd className="min-w-0 break-words">{r.value ?? '-'}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
