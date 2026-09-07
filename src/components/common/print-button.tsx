'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** 현재 화면 인쇄(출력) 버튼. print:hidden 요소는 인쇄 시 숨겨진다. */
export function PrintButton({ label = '인쇄' }: { label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  );
}
