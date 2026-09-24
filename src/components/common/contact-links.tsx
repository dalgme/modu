'use client';

import { useState } from 'react';
import { Check, Copy, MessageSquare, Phone } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 연락처 액션 — 전화(tel:) · 문자(sms:) · 복사. 휴대폰 옆에 작은 아이콘 3개로 붙는다.
 * 번호가 없으면 아무것도 그리지 않는다.
 */
export function ContactLinks({ phone, name, className, size = 'sm' }: { phone: string | null | undefined; name?: string; className?: string; size?: 'sm' | 'xs' }) {
  const [copied, setCopied] = useState(false);
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  const who = name ? `${name} ` : '';
  // (P31) 폰에서는 탭 타깃을 키운다 (xs 32px / sm 40px), sm 이상은 기존 소형 아이콘
  const btn = cn('inline-flex items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground', size === 'xs' ? 'h-8 w-8 sm:h-5 sm:w-5' : 'h-10 w-10 sm:h-6 sm:w-6');
  const icon = size === 'xs' ? 'h-4 w-4 sm:h-3 sm:w-3' : 'h-4 w-4 sm:h-3.5 sm:w-3.5';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phone ?? digits);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 미지원 환경 — 조용히 무시 */
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 sm:gap-0.5', className)} onClick={(e) => e.stopPropagation()}>
      <a href={`tel:${digits}`} className={btn} aria-label={`${who}전화 걸기`} title="전화">
        <Phone className={icon} />
      </a>
      <a href={`sms:${digits}`} className={btn} aria-label={`${who}문자 보내기`} title="문자">
        <MessageSquare className={icon} />
      </a>
      <button type="button" onClick={() => void copy()} className={cn(btn, copied && 'text-emerald-600')} aria-label={`${who}번호 복사`} title={copied ? '복사됨' : '번호 복사'}>
        {copied ? <Check className={icon} /> : <Copy className={icon} />}
      </button>
    </span>
  );
}
