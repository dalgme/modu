'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** 케이스 세부정보 화면 하단 이동 버튼 (대시보드로 이동 / 이전으로) */
export function CaseDetailBackNav({ dashboardHref }: { dashboardHref: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => router.push(dashboardHref)} className="gap-1.5">
        <LayoutDashboard className="h-4 w-4" />
        대시보드로 이동
      </Button>
      <Button type="button" variant="ghost" onClick={() => router.back()} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        이전으로
      </Button>
    </div>
  );
}
