'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { UserRole } from '@/lib/auth/roles';
import type { ImportKind } from '@/lib/import/bulk-import';
import { AddExistingMemberForm, CreateMemberForm } from '@/components/nextlab/members-manager';
import { BulkImportPanel } from '@/components/nextlab/bulk-import-panel';
import { Button } from '@/components/ui/button';

export const REG_ROLES = [
  { key: 'mentee', label: '멘티' },
  { key: 'mentor', label: '멘토' },
  { key: 'nextlab', label: '운영사' },
  { key: 'institution', label: '발주처' },
] as const;
export type RegKey = (typeof REG_ROLES)[number]['key'];

/**
 * 회원 등록 미니탭 (P26-08) — 자격별 좌측 메뉴를 클라이언트 상태로 전환한다.
 * 한 번에 한 자격의 등록 화면만 그리고(key 로 완전 재마운트), 이전 자격의 폼·미리보기가 화면에 누적되지 않는다.
 * URL 의 reg 는 공유용으로만 동기화한다(페이지 이동 없음).
 */
export function RegisterPanel({
  groups,
  counts,
  initialReg,
}: {
  groups: { id: string; code: string; name: string }[];
  counts: Record<RegKey, number>;
  initialReg: RegKey;
}) {
  const [reg, setReg] = useState<RegKey>(initialReg);

  const pick = (key: RegKey) => {
    setReg(key);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'register');
      url.searchParams.set('reg', key);
      window.history.replaceState(null, '', url.toString());
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
      <nav className="flex h-fit flex-row gap-1 overflow-x-auto rounded-xl border bg-background p-2 lg:flex-col" aria-label="등록 자격">
        {REG_ROLES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => pick(r.key)}
            aria-current={reg === r.key ? 'page' : undefined}
            className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-semibold ${reg === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
          >
            <span>{r.label} 등록</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${reg === r.key ? 'bg-primary-foreground/20' : 'bg-muted'}`}>{counts[r.key]}</span>
          </button>
        ))}
      </nav>
      {/* key={reg}: 자격이 바뀌면 오른쪽 전체를 새로 마운트 — 이전 자격의 폼 상태·검증 미리보기가 남지 않는다 */}
      <div key={reg} className="flex flex-col gap-5">
        {reg === 'mentee' ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-background p-4">
            <p className="text-sm">
              멘티 개별 등록은 <b>멘티 등록 폼</b>(케이스 생성)에서 합니다 — 이름·닉네임·고유번호·권역·유형·아이디어·희망분야·재배치 희망·비고를 입력하고, 계정이 자동 발급·연결됩니다.
            </p>
            <div>
              <Button asChild>
                <Link href="/nextlab/cases/new">멘티 개별 등록 폼 열기</Link>
              </Button>
            </div>
          </div>
        ) : (
          <CreateMemberForm fixedRole={reg as UserRole} />
        )}
        <BulkImportPanel groups={groups} fixedKind={reg as ImportKind} />
        <AddExistingMemberForm />
      </div>
    </div>
  );
}
