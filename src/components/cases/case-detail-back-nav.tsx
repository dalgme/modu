'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, LayoutDashboard, List } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * 안전한 되돌아갈 경로 — 상대 경로(`/…`)만 허용. `//host` 같은 외부 이동은 막는다.
 * 목록 화면이 케이스 링크에 `?from=/nextlab/roster?tab=mentee-match&filter=unassigned` 처럼 붙여 주면 "← 목록으로"가 그곳으로 간다.
 */
export function safeFromPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (/[\r\n]/.test(raw)) return null;
  return raw;
}

/** 케이스 세부정보 화면 하단 이동 버튼 (목록으로 / 대시보드로 이동 / 이전으로) */
export function CaseDetailBackNav({ dashboardHref }: { dashboardHref: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const from = safeFromPath(params.get('from'));
  return (
    <div className="flex flex-wrap gap-2">
      {from && (
        <Button asChild variant="outline" className="gap-1.5">
          <Link href={from}>
            <List className="h-4 w-4" />
            목록으로
          </Link>
        </Button>
      )}
      <Button type="button" variant={from ? 'ghost' : 'outline'} onClick={() => router.push(dashboardHref)} className="gap-1.5">
        <LayoutDashboard className="h-4 w-4" />
        대시보드로 이동
      </Button>
      {!from && (
        <Button type="button" variant="ghost" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          이전으로
        </Button>
      )}
    </div>
  );
}
