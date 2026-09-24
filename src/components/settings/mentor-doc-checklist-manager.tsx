'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { clearMentorDocGroupChecklistAction, saveMentorDocChecklistAction } from '@/lib/mentor-docs/actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/** 설정 화면에 내려주는 스코프별 체크리스트 (P32) */
export interface MentorDocChecklistScope {
  /** null = 행사 공통 */
  id: string | null;
  name: string;
  enabled: boolean;
  items: { key: string; name: string }[];
  /** 이 스코프에 직접 저장된 행이 있는지 (그룹에서 false = 행사 공통을 따르는 중) */
  defined: boolean;
}

const MAX_ITEMS = 20;

type Draft = { key: string | null; name: string; tmp: string };

function ScopeEditor({ scope }: { scope: MentorDocChecklistScope }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(scope.enabled);
  const [items, setItems] = useState<Draft[]>(scope.items.map((i, idx) => ({ key: i.key, name: i.name, tmp: `k${idx}` })));
  const [dirty, setDirty] = useState(false);
  const isGroup = scope.id !== null;
  const inheriting = isGroup && !scope.defined;

  const update = (fn: (prev: Draft[]) => Draft[]) => {
    setItems(fn);
    setDirty(true);
  };
  const move = (idx: number, dir: -1 | 1) =>
    update((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j]!, next[idx]!];
      return next;
    });
  const remove = async (idx: number) => {
    const it = items[idx]!;
    if (it.key && it.name.trim()) {
      const ok = await confirm({
        title: `'${it.name}' 서류를 목록에서 뺄까요?`,
        description: '저장하면 이 서류는 수령 현황에서 사라집니다. (이미 기록된 수령 사실은 삭제되지 않지만 표시되지 않습니다)',
        severity: 'danger',
        confirmLabel: '빼기',
      });
      if (!ok) return;
    }
    update((prev) => prev.filter((_, i) => i !== idx));
  };
  const add = () => {
    if (items.length >= MAX_ITEMS) return toast({ title: `서류는 최대 ${MAX_ITEMS}개까지 등록할 수 있습니다.`, variant: 'destructive' });
    update((prev) => [...prev, { key: null, name: '', tmp: `n${Date.now()}-${prev.length}` }]);
  };

  const save = () => {
    start(async () => {
      const r = await saveMentorDocChecklistAction({
        supportTypeId: scope.id,
        enabled,
        items: items.map((i) => ({ key: i.key, name: i.name })),
      });
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: r.message ?? '저장했습니다.' });
      setDirty(false);
      router.refresh();
    });
  };
  const clearGroup = async () => {
    if (!scope.id) return;
    const ok = await confirm({
      title: `${scope.name} 의 별도 서류 목록을 해제할까요?`,
      description: '이 그룹은 행사 공통 서류 목록을 따르게 됩니다. 그룹 스코프로 기록된 수령 사실은 보관되지만 화면에서는 공통 목록 기준으로 표시됩니다.',
      severity: 'danger',
      confirmLabel: '해제',
    });
    if (!ok) return;
    start(async () => {
      const r = await clearMentorDocGroupChecklistAction(scope.id!);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: r.message ?? '해제했습니다.' });
      router.refresh();
    });
  };

  return (
    <Card className={enabled ? 'border-primary/40' : ''}>
      {dialog}
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {scope.name} 서류 목록
          {enabled ? <Badge>사용</Badge> : <Badge variant="outline">미사용</Badge>}
          {inheriting && <Badge variant="secondary" className="font-normal">행사 공통 따름</Badge>}
          {isGroup && scope.defined && <Badge variant="secondary" className="font-normal">{scope.name} 전용</Badge>}
        </CardTitle>
        <CardDescription className="text-xs">
          {inheriting
            ? <>현재 이 그룹은 행사 공통 목록을 따릅니다. 아래를 수정해 저장하면 <b>{scope.name} 전용 목록</b>이 만들어집니다.</>
            : isGroup
              ? '이 그룹 멘토에게는 행사 공통 대신 이 목록이 적용됩니다.'
              : '그룹에 별도 설정이 없으면 이 행사 공통 목록이 적용됩니다.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }} />
          이 범위에서 서류 수령 체크 사용
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">수령 체크할 서류명 ({items.length}/{MAX_ITEMS})</p>
          {items.length === 0 && <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">등록된 서류가 없습니다. [서류 추가]로 서류명을 등록하세요.</p>}
          <ul className="flex flex-col gap-1.5">
            {items.map((it, idx) => (
              <li key={it.tmp} className="flex items-center gap-1.5">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{idx + 1}.</span>
                <Input
                  value={it.name}
                  maxLength={60}
                  placeholder="서류명 (예: 위촉 동의서)"
                  onChange={(e) => update((prev) => prev.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p)))}
                  className="h-9 text-sm sm:h-8"
                />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="위로">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label="아래로">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8" onClick={() => remove(idx)} aria-label="삭제">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={add} disabled={items.length >= MAX_ITEMS} className="gap-1">
              <Plus className="h-4 w-4" /> 서류 추가
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? '저장 중…' : '저장'}
          </Button>
          {isGroup && scope.defined && (
            <button type="button" onClick={clearGroup} disabled={pending} className="text-xs text-muted-foreground underline hover:text-destructive">
              그룹 설정 해제 (공통 따르기)
            </button>
          )}
          {dirty && <span className="text-xs text-amber-700">저장하지 않은 변경이 있습니다.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 멘토 서류 수령 체크 — 서류명 목록·사용 여부를 행사 공통 + 사업그룹별로 설정 (P32).
 * 그룹 탭에서 저장하면 그 그룹 전용 목록이 되고, 해제하면 행사 공통을 따른다. 수령 체크는 회원 명단 → 멘토 명단에서.
 */
export function MentorDocChecklistManager({ scopes }: { scopes: MentorDocChecklistScope[] }) {
  const [scopeIdx, setScopeIdx] = useState(0);
  const scope = scopes[scopeIdx] ?? scopes[0]!;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        멘토에게 <b>오프라인(이메일·서면 등)으로 받은 서류</b>의 수령 사실을 체크하는 기능입니다. 서류를 플랫폼에 올리게 하지 않습니다.
        수령 체크할 <b>서류명</b>과 <b>사용 여부</b>를 행사 공통 또는 사업그룹별로 정하고, 수령 체크는 <b>회원 명단 → 멘토 명단</b> 상단 카드에서 합니다. 그룹에 설정이 없으면 행사 공통을 따릅니다.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {scopes.map((s, i) => (
          <button
            key={s.id ?? 'common'}
            type="button"
            onClick={() => setScopeIdx(i)}
            className={cn('rounded-full px-3 py-1 text-xs font-semibold', i === scopeIdx ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent')}
          >
            {s.name}
            {s.id && s.defined && <span className="ml-1 opacity-70">·전용</span>}
          </button>
        ))}
      </div>
      <ScopeEditor key={scope.id ?? 'common'} scope={scope} />
    </div>
  );
}
