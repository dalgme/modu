'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Layers } from 'lucide-react';

import { bulkSetMemberActiveAction, bulkSetMentorGroupsAction, bulkSetNoteAction, bulkSetWithholdingAction, type BulkResult } from '@/lib/roster/bulk-actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type RosterBulkKind = 'mentee' | 'mentor' | 'staff';

const WH_OPTIONS: { value: 'other_income' | 'business_income' | 'none' | ''; label: string; hint: string }[] = [
  { value: '', label: '그룹 기본', hint: '그룹 설정을 따름 (override 해제)' },
  { value: 'other_income', label: '기타소득', hint: '필요경비 60% · 8.8%' },
  { value: 'business_income', label: '사업소득', hint: '3.3%' },
  { value: 'none', label: '원천징수 없음', hint: '사업자 세금계산서 등' },
];

type Step =
  | { kind: 'groups'; mode: 'add' | 'remove'; groupIds: string[] }
  | { kind: 'withholding'; groupId: string | null; method: 'other_income' | 'business_income' | 'none' | '' }
  | { kind: 'note'; text: string; append: boolean }
  | null;

/**
 * 회원 명단 일괄 작업 드롭다운 (P31) — 선택된 회원 id 에 활성/비활성·계정 잠금·그룹 지정·원천징수·비고를 일괄 적용한다.
 * 파라미터가 필요한 작업은 작은 다이얼로그 → 공용 확인창(영향 목록) → 서버 액션 → 결과 토스트 + router.refresh().
 *
 * props:
 *  - selectedIds: 선택된 회원 user id (빈 배열이면 버튼 비활성)
 *  - kind: 'mentee' | 'mentor' | 'staff' — 메뉴 구성 (그룹 지정·원천징수는 멘토만, 비고는 멘토·발주처·운영사)
 *  - groups: 이 행사의 그룹 목록 (그룹 지정·원천징수 선택지)
 *  - onDone: 작업 완료 후 콜백 (선택 해제 등)
 */
export function RosterBulkActions({ selectedIds, kind, groups, onDone, className }: { selectedIds: string[]; kind: RosterBulkKind; groups: { id: string; name: string }[]; onDone?: (r: BulkResult) => void; className?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>(null);
  const n = selectedIds.length;
  const disabled = n === 0 || pending;

  const run = async (label: string, impact: string[], fn: () => Promise<BulkResult>, severity: 'normal' | 'danger' = 'normal') => {
    const ok = await confirm({ title: `${label} — 선택 ${n}명`, impact, confirmLabel: '실행', severity });
    if (!ok) return;
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
        const failedLines = r.failed.filter((f) => !f.ok).slice(0, 5).map((f) => f.error).join(' / ');
        toast({ title: r.message, description: failedLines || undefined, variant: r.done === 0 ? 'destructive' : undefined });
        setStep(null);
        router.refresh();
        onDone?.(r);
      } catch (err) {
        toast({ title: `실패: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
      }
    });
  };

  const setActive = (active: boolean, lockAccount: boolean) =>
    run(
      active ? (lockAccount ? '활성화 + 계정 잠금 해제' : '이 행사에서 활성화') : lockAccount ? '비활성화 + 계정 잠금' : '이 행사에서 비활성화',
      [
        active ? '행사 소속을 활성으로 되돌립니다 (명단·배정·문자 대상에 포함)' : '이 행사에서 비활성 처리합니다 (명단·배정·문자·조사 대상에서 제외, 진행현황에 비활성화 표시)',
        lockAccount ? (active ? '계정 잠금도 해제해 로그인이 다시 가능해집니다' : '계정도 잠가 모든 행사에서 로그인이 차단됩니다') : '로그인과 다른 행사 활동에는 영향이 없습니다',
        '본인·마지막 메인 담당(PL)·다른 행사 소속이 아닌 계정은 건너뜁니다',
      ],
      () => bulkSetMemberActiveAction(selectedIds, active, { lockAccount }),
      active ? 'normal' : 'danger',
    );

  const submitStep = () => {
    if (!step) return;
    if (step.kind === 'groups') {
      if (step.groupIds.length === 0) return toast({ title: '그룹을 선택하세요.', variant: 'destructive' });
      const names = groups.filter((g) => step.groupIds.includes(g.id)).map((g) => g.name).join(', ');
      void run(step.mode === 'add' ? '그룹 지정 추가' : '그룹 지정 해제', [`그룹: ${names}`, step.mode === 'add' ? '지정이 하나라도 생기면 그 멘토는 지정 그룹에서만 배정 후보가 됩니다' : '그 그룹에 담당 멘티가 있는 멘토는 건너뜁니다'], () => bulkSetMentorGroupsAction(selectedIds, step.groupIds, step.mode));
    } else if (step.kind === 'withholding') {
      const opt = WH_OPTIONS.find((o) => o.value === step.method)!;
      const gname = step.groupId ? (groups.find((g) => g.id === step.groupId)?.name ?? '') : '행사의 모든 그룹';
      void run('원천징수 방식 일괄 변경', [`대상 그룹: ${gname}`, `방식: ${opt.label} (${opt.hint})`, '이미 확정된 정산에는 영향이 없습니다 (스냅샷)', '그룹 지정(is_active)은 바뀌지 않습니다'], () => bulkSetWithholdingAction(selectedIds, step.groupId, step.method));
    } else if (step.kind === 'note') {
      if (!step.text.trim() && step.append) return toast({ title: '내용을 입력하세요.', variant: 'destructive' });
      void run(step.append ? '비고 덧붙이기' : '비고 덮어쓰기', [step.append ? '기존 비고 뒤에 줄바꿈으로 덧붙입니다' : step.text.trim() ? '기존 비고를 지우고 이 내용으로 바꿉니다' : '기존 비고를 지웁니다', '멘티는 케이스별 비고라 대상에서 제외됩니다'], () => bulkSetNoteAction(selectedIds, step.text, { append: step.append }), step.append ? 'normal' : 'danger');
    }
  };

  return (
    <>
      {dialog}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className={cn('h-9 gap-1 bg-background', className)} disabled={disabled} title={n === 0 ? '회원을 먼저 선택하세요' : undefined}>
            <Layers className="h-4 w-4" /> 일괄 작업{n > 0 ? ` (${n})` : ''} <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>선택 {n}명에게</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void setActive(true, false)}>이 행사에서 활성화</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void setActive(false, false)}>이 행사에서 비활성화</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void setActive(false, true)} className="text-destructive">비활성화 + 계정 잠금(로그인 차단)</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void setActive(true, true)}>활성화 + 계정 잠금 해제</DropdownMenuItem>
          {kind === 'mentor' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setStep({ kind: 'groups', mode: 'add', groupIds: [] })}>그룹 지정 추가…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setStep({ kind: 'groups', mode: 'remove', groupIds: [] })}>그룹 지정 해제…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setStep({ kind: 'withholding', groupId: null, method: '' })}>원천징수 방식…</DropdownMenuItem>
            </>
          )}
          {kind !== 'mentee' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setStep({ kind: 'note', text: '', append: true })}>비고 일괄 입력…</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!step} onOpenChange={(o) => !o && !pending && setStep(null)}>
        <DialogContent className="max-w-md">
          {step?.kind === 'groups' && (
            <>
              <DialogHeader>
                <DialogTitle>그룹 지정 {step.mode === 'add' ? '추가' : '해제'} — 선택 {n}명</DialogTitle>
                <DialogDescription>{step.mode === 'add' ? '체크한 그룹에 멘토를 지정합니다. 지정이 하나라도 있으면 그 그룹에서만 배정 후보가 됩니다.' : '체크한 그룹의 지정을 해제합니다. 담당 멘티가 있는 그룹은 건너뜁니다.'}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const on = step.groupIds.includes(g.id);
                  return (
                    <button key={g.id} type="button" aria-pressed={on} onClick={() => setStep({ ...step, groupIds: on ? step.groupIds.filter((x) => x !== g.id) : [...step.groupIds, g.id] })} className={cn('rounded-full border px-3 py-1 text-sm', on ? 'border-primary bg-primary/10 font-semibold' : 'text-muted-foreground')}>
                      {g.name}
                    </button>
                  );
                })}
                {groups.length === 0 && <p className="text-sm text-muted-foreground">그룹이 없습니다.</p>}
              </div>
            </>
          )}
          {step?.kind === 'withholding' && (
            <>
              <DialogHeader>
                <DialogTitle>원천징수 방식 — 선택 {n}명</DialogTitle>
                <DialogDescription>그룹별 override 를 일괄 저장합니다. 확정된 정산 스냅샷은 바뀌지 않습니다.</DialogDescription>
              </DialogHeader>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">대상 그룹</span>
                <select value={step.groupId ?? ''} onChange={(e) => setStep({ ...step, groupId: e.target.value || null })} className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">행사의 모든 그룹</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="원천징수 방식">
                {WH_OPTIONS.map((o) => (
                  <label key={o.value || 'default'} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm', step.method === o.value && 'border-primary bg-primary/10')}>
                    <input type="radio" name="wh" checked={step.method === o.value} onChange={() => setStep({ ...step, method: o.value })} className="accent-primary" />
                    <span className="font-medium">{o.label}</span>
                    <span className="text-xs text-muted-foreground">{o.hint}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          {step?.kind === 'note' && (
            <>
              <DialogHeader>
                <DialogTitle>비고 일괄 입력 — 선택 {n}명</DialogTitle>
                <DialogDescription>발주처·운영사는 행사 비고, 멘토는 멘토 프로필 비고에 저장됩니다. 멘티는 케이스 상세에서 입력하세요.</DialogDescription>
              </DialogHeader>
              <Textarea rows={3} value={step.text} onChange={(e) => setStep({ ...step, text: e.target.value })} placeholder="비고 내용" maxLength={500} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={step.append} onChange={(e) => setStep({ ...step, append: e.target.checked })} className="h-4 w-4 accent-primary" />
                기존 비고 뒤에 덧붙이기 (끄면 덮어쓰기)
              </label>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStep(null)} disabled={pending}>취소</Button>
            <Button type="button" onClick={submitStep} disabled={pending}>{pending ? '처리 중…' : '다음'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 임의 컬럼 엑셀 업로드 버튼 (P31) — 순위 업로드와 같은 팝업 방식. 멘티/멘토 명단 툴바에 놓는다 */
export function RosterValuesUploadButton({ target }: { target: 'mentee' | 'mentor' }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ updated: number; cleared: number; matchedColumns: string[]; unknownColumns: string[]; notFound: string[]; ambiguous: string[] } | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('target', target);
    setBusy(true);
    try {
      const { uploadRosterValuesAction } = await import('@/lib/import/roster-values-actions');
      const r = await uploadRosterValuesAction(fd);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setResult(r);
      toast({ title: `임의 컬럼 값 ${r.updated}건 저장${r.cleared ? ` · ${r.cleared}건 지움` : ''}` });
      router.refresh();
    } catch (err) {
      toast({ title: `업로드 실패: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-9 gap-1 bg-background" onClick={() => { setResult(null); setOpen(true); }} title="이름/휴대폰 + 임의 컬럼 이름 헤더의 엑셀로 마크 값을 일괄 입력합니다">
        <Layers className="h-4 w-4" /> 임의 컬럼 업로드
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>임의 컬럼 업로드 ({target === 'mentee' ? '멘티' : '멘토'})</DialogTitle>
            <DialogDescription>
              &ldquo;이름, 휴대폰&rdquo; + 임의 컬럼 이름을 헤더로 둔 엑셀을 올리면 회원별 마크 값이 저장됩니다. 값을 비우면 그 셀은 건드리지 않고 &ldquo;-&rdquo; 는 지웁니다. 현재 범위의 {target === 'mentee' ? '멘티' : '멘토'}만 대상입니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <a href={`/api/nextlab/roster-values-template?target=${target}`} className="text-xs text-primary underline underline-offset-2">템플릿 다운로드 (현재 명단·컬럼이 채워진 파일)</a>
            <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
            {result && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                <p className="font-semibold">저장 {result.updated}건 · 지움 {result.cleared}건 · 컬럼 {result.matchedColumns.join(', ')}</p>
                {result.unknownColumns.length > 0 && <p className="mt-1 text-muted-foreground">무시한 헤더: {result.unknownColumns.join(', ')}</p>}
                {result.notFound.length > 0 && <p className="mt-1 text-destructive">찾지 못함 {result.notFound.length}: {result.notFound.join(', ')}</p>}
                {result.ambiguous.length > 0 && <p className="mt-1 text-amber-700">동명이인 {result.ambiguous.length}: {result.ambiguous.join(', ')}</p>}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>닫기</Button>
              <Button type="submit" disabled={busy}>{busy ? '업로드 중…' : '업로드'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
