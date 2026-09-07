'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import { CASE_STEP_ORDER, CASE_STATUS_META, APPROVAL_STEP, type CaseStatus } from '@/types/case-status';
import { StatusBadge } from '@/components/cases/status-badge';
import { EditGrantBadge } from '@/components/cases/edit-grant-badge';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const TONE_DOT: Record<string, string> = {
  pending: 'bg-status-pending',
  progress: 'bg-status-progress',
  approved: 'bg-status-approved',
  rejected: 'bg-status-rejected',
};

/** 세로 메뉴 한 칸이 대표하는 단계 정의 */
interface StageDef {
  key: string;
  step: number; // 0 = 종결(포기)
  label: string;
  tone: string;
  /** 이 메뉴에 속하는지 판정 */
  match: (c: CaseListItem) => boolean;
}

// 정규 11단계 (승인 단계는 승인/반려 두 상태를 함께 수용) + 종결(포기) 메뉴
const STAGES: StageDef[] = CASE_STEP_ORDER.map((canonical) => {
  const meta = CASE_STATUS_META[canonical];
  return {
    key: canonical,
    step: meta.step,
    label: meta.step === APPROVAL_STEP ? '진흥원 승인·반려' : meta.label,
    tone: meta.tone,
    match: (c: CaseListItem) => CASE_STATUS_META[c.status].step === meta.step,
  };
});
STAGES.push({
  key: 'withdrawn',
  step: 0,
  label: CASE_STATUS_META.withdrawn.label,
  tone: 'rejected',
  match: (c) => CASE_STATUS_META[c.status].step === 0,
});

/**
 * 진행단계별 현황판 (세로 메뉴형).
 * 왼쪽 세로 메뉴에서 단계를 고르면, 오른쪽 상단에 해당 단계 통계,
 * 하단에 그 단계 업체 리스트(등록일·기업정보·현황 요약)를 표시한다.
 * 가로 스크롤 없이 단계별로 집중해서 볼 수 있다.
 */
export function StageBoard({
  items,
  basePath,
  editGrantIds = [],
}: {
  items: CaseListItem[];
  basePath: string;
  /** 임시 수정권한이 열린 케이스ID 목록 (클라이언트 직렬화를 위해 배열) */
  editGrantIds?: string[];
}) {
  const editGrantSet = useMemo(() => new Set(editGrantIds), [editGrantIds]);
  // 단계별 케이스 사전 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, CaseListItem[]>();
    for (const s of STAGES) map.set(s.key, items.filter(s.match));
    return map;
  }, [items]);

  // 기본 선택: 케이스가 있는 첫 단계, 없으면 1단계
  const fallback = STAGES[0]!;
  const firstWithCases = STAGES.find((s) => (grouped.get(s.key)?.length ?? 0) > 0);
  const [activeKey, setActiveKey] = useState<string>(firstWithCases?.key ?? fallback.key);

  const active = STAGES.find((s) => s.key === activeKey) ?? fallback;
  const activeItems = useMemo(() => grouped.get(active.key) ?? [], [grouped, active.key]);
  const total = items.length;

  // 선택 단계의 지원유형별 분포
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of activeItems) {
      const name = c.supportTypeName ?? '미지정';
      m.set(name, (m.get(name) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [activeItems]);

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      {/* 세로 단계 메뉴 */}
      <nav className="flex flex-col gap-1 rounded-lg border bg-card p-2">
        {STAGES.map((s) => {
          const count = grouped.get(s.key)?.length ?? 0;
          const isActive = s.key === activeKey;
          if (s.step === 0 && count === 0) return null; // 종결 건 없으면 메뉴 숨김
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setActiveKey(s.key)}
              aria-current={isActive}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
                  isActive ? 'bg-white/25 text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {s.step === 0 ? '×' : s.step}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 text-xs tabular-nums',
                  isActive
                    ? 'bg-white/20 text-primary-foreground'
                    : count > 0
                      ? 'bg-status-progress text-white'
                      : 'bg-muted text-muted-foreground/70',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 선택 단계 상세 */}
      <div className="flex flex-col gap-4">
        {/* 상단 통계 */}
        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', TONE_DOT[active.tone])} />
              <h2 className="text-lg font-semibold">
                {active.step > 0 && (
                  <span className="tabular-nums text-muted-foreground">{active.step}. </span>
                )}
                {active.label}
              </h2>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums leading-none">{activeItems.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                전체 {total}건 중 {total > 0 ? Math.round((activeItems.length / total) * 100) : 0}%
              </div>
            </div>
          </div>
          {byType.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {byType.map(([name, n]) => (
                <span
                  key={name}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {name} <span className="font-semibold tabular-nums text-foreground">{n}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 하단 업체 리스트 */}
        {activeItems.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            이 단계에 머물러 있는 업체가 없습니다.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeItems.map((c) => (
              <li key={c.id}>
                <Link
                  href={`${basePath}/${c.id}`}
                  className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.business_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.supportTypeName ?? '-'}
                        {c.mentorName ? ` · 멘토 ${c.mentorName}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={c.status as CaseStatus} showStep />
                      {editGrantSet.has(c.id) && <EditGrantBadge />}
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    대표 {c.owner_name} · 업종 {c.business_type ?? '-'}
                    {c.item ? ` / ${c.item}` : ''} · ☎ {c.phone} · {c.address}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    등록일 {formatDate(c.created_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
