'use client';

import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';

/**
 * 멘토 대시보드 "지금 할 일" 카드 안의 멘티 연락 링크(전화·문자·메일·메시지).
 * 카드 전체가 링크라 클릭 전파를 막아야 하는데, 서버 컴포넌트(mentor-dashboard-v2)에서는 onClick 을 붙일 수 없어
 * ("Event handlers cannot be passed to Client Component props" → 페이지 500) 이 부분만 클라이언트로 분리했다.
 */
export function MenteeContactLinks({ phone, email, caseId }: { phone: string | null; email: string | null; caseId: string }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const digits = (phone ?? '').replace(/\D/g, '');
  return (
    <span className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
      {phone && (
        <a href={`tel:${digits}`} onClick={stop} className="inline-flex items-center gap-1 text-primary hover:underline">
          <Phone className="h-3 w-3" />
          {phone}
        </a>
      )}
      {phone && (
        <a href={`sms:${digits}`} onClick={stop} className="inline-flex items-center gap-1 text-primary hover:underline">
          문자
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} onClick={stop} className="inline-flex items-center gap-1 hover:underline">
          <Mail className="h-3 w-3" />
          {email}
        </a>
      )}
      <Link href={`/mentor/qna?tab=messages&case=${caseId}`} onClick={stop} className="inline-flex items-center gap-1 text-primary hover:underline">
        메시지
      </Link>
    </span>
  );
}
