import Link from 'next/link';

import { ContactLinks } from '@/components/common/contact-links';
import { formatPhone } from '@/lib/utils/phone';

/** 멘티명(연락처) 셀 — 이름은 케이스 상세 링크, 연락처 아이콘은 링크 밖(중첩 앵커 금지). 서버·클라이언트 공용. */
export function MenteeCell({ caseId, label, phone, sub }: { caseId: string; label: string; phone: string | null; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Link href={`/nextlab/cases/${caseId}`} className="font-semibold text-primary hover:underline">{label}</Link>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      {phone && (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <a href={`tel:${phone.replace(/\D/g, '')}`} className="tabular-nums hover:underline">{formatPhone(phone) ?? phone}</a>
          <ContactLinks phone={phone} name={label} size="xs" />
        </span>
      )}
    </div>
  );
}

/** 멘토명(연락처) 셀 */
export function MentorCell({ name, phone }: { name: string; phone: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold">{name}</span>
      {phone && (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <a href={`tel:${phone.replace(/\D/g, '')}`} className="tabular-nums hover:underline">{formatPhone(phone) ?? phone}</a>
          <ContactLinks phone={phone} name={name} size="xs" />
        </span>
      )}
    </div>
  );
}
