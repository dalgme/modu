'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Download, Eye, FileLock2, ShieldCheck } from 'lucide-react';

import { updateBusinessPlanDownloadAction } from '@/lib/files/policy-actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * 운영 설정 › 파일 보안 (2026-09-30) — "멘티 사업계획서 다운로드 허용" 큰 스위치.
 * 꺼짐(기본) = 멘토는 웹 미리보기만(인쇄·다운로드 차단) / 켜짐 = 멘토도 내려받기·인쇄 가능. 운영사·발주처는 항상 내려받을 수 있다.
 */
export function FilePolicyForm({ businessPlanDownload, canEdit }: { businessPlanDownload: boolean; canEdit: boolean }) {
  const { toast } = useToast();
  const [on, setOn] = useState(businessPlanDownload);
  const [pending, start] = useTransition();

  const toggle = () => {
    if (!canEdit || pending) return;
    const next = !on;
    start(async () => {
      const r = await updateBusinessPlanDownloadAction(next);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setOn(next);
      toast({ title: next ? '멘토의 사업계획서 다운로드를 허용했습니다.' : '멘토는 이제 사업계획서를 미리보기로만 볼 수 있습니다.' });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className={cn('rounded-2xl border-2 p-5 shadow-sm transition-colors sm:p-6', on ? 'border-amber-400 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/30' : 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', on ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100' : 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100')}>
              {on ? <Download className="h-6 w-6" /> : <FileLock2 className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <h2 id="bp-download-label" className="text-lg font-bold sm:text-xl">멘티 사업계획서 다운로드 허용</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                [파일 관리 › 멘티 사업계획서]에 올린 사업계획서·참고파일을 <b className="text-foreground">멘토</b>가 내려받거나 인쇄할 수 있는지 정합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="bp-download-label"
            onClick={toggle}
            disabled={!canEdit || pending}
            className={cn(
              'relative inline-flex h-11 w-[132px] shrink-0 items-center rounded-full border-2 px-1 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
              on ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100',
            )}
          >
            <span className={cn('absolute h-8 w-8 rounded-full bg-white shadow transition-all', on ? 'left-[calc(100%-2.25rem)]' : 'left-1')} aria-hidden />
            <span className={cn('w-full', on ? 'pr-9 text-left pl-3' : 'pl-10 text-left')}>{pending ? '저장 중…' : on ? '허용' : '비허용'}</span>
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className={cn('rounded-xl border bg-background p-3', !on && 'ring-2 ring-emerald-500')}>
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Eye className="h-4 w-4 text-emerald-600" /> 비허용 (기본값)
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">멘토는 웹 <b>미리보기만</b> 할 수 있고, 인쇄·다운로드 버튼이 보이지 않습니다. 사업 아이디어 유출을 막을 때 권장합니다.</p>
          </div>
          <div className={cn('rounded-xl border bg-background p-3', on && 'ring-2 ring-amber-500')}>
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Download className="h-4 w-4 text-amber-600" /> 허용
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">멘토도 파일을 <b>내려받고 인쇄</b>할 수 있습니다. 멘티에게 동의를 받은 경우에만 켜 주세요.</p>
          </div>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          운영사·발주처 담당자는 이 설정과 관계없이 항상 내려받을 수 있습니다. 바꾸면 멘토 화면에 바로 반영되고 감사 로그에 남습니다.
        </p>
        {!canEdit && <p className="mt-2 text-xs font-semibold text-status-rejected">현재 등급에는 운영 설정(일반) 변경 권한이 없어 열람만 가능합니다.</p>}
      </section>
      <p className="text-xs text-muted-foreground">
        사업계획서 업로드는 <Link href="/nextlab/files?menu=plans" className="font-semibold underline underline-offset-2">파일 관리 › 멘티 사업계획서</Link>에서 합니다.
      </p>
    </div>
  );
}
