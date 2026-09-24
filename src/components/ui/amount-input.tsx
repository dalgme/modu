'use client';

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** 문자열에서 숫자만 추출 */
function toDigits(value: string): string {
  return value.replace(/[^\d]/g, '');
}

/** 숫자 문자열 → 천 단위 콤마 (빈 값이면 '') */
function withCommas(digits: string): string {
  return digits ? Number(digits).toLocaleString('ko-KR') : '';
}

interface AmountInputProps {
  /** FormData 방식 폼: 이 name 으로 콤마 없는 원시 숫자를 hidden 으로 제출 */
  name?: string;
  /** 제어형: 콤마 없는 원시 숫자 문자열 */
  value?: string;
  /** 제어형 변경 콜백 — 콤마 없는 원시 숫자 문자열 전달 */
  onValueChange?: (raw: string) => void;
  /** 비제어형 초기값 */
  defaultValue?: string | number | null;
  id?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** 오른쪽 단위 표시 (기본 '원'). 빈 문자열이면 표시하지 않음 */
  suffix?: string;
}

/**
 * 금액 입력 필드. 화면에는 천 단위 콤마를 자동 표시하고,
 * 실제 값(폼 제출·콜백)은 콤마 없는 숫자 문자열로 전달한다.
 * - 제어형: value / onValueChange (원시 숫자 문자열)
 * - 비제어형(FormData): name → 콤마 없는 값이 hidden input 으로 제출됨
 */
export function AmountInput({
  name,
  value,
  onValueChange,
  defaultValue,
  className,
  suffix = '원',
  ...rest
}: AmountInputProps) {
  const controlled = value !== undefined;
  const [raw, setRaw] = useState(() => toDigits(String(defaultValue ?? '')));
  const current = controlled ? toDigits(value ?? '') : raw;

  return (
    <span className="relative block">
      <Input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={cn('text-right tabular-nums', suffix && 'pr-8', className)}
        value={withCommas(current)}
        onChange={(e) => {
          const digits = toDigits(e.target.value);
          if (!controlled) setRaw(digits);
          onValueChange?.(digits);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      {name && <input type="hidden" name={name} value={current} />}
    </span>
  );
}
