'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, FileDown, FilePlus2, Pencil, Undo2 } from 'lucide-react';

import type { SnapshotListItem } from '@/lib/reports/summary-types';
import { createSummarySnapshotAction, hideSummarySnapshotAction, renameSummarySnapshotAction } from '@/lib/reports/summary-actions';
import { SUMMARY_FORMATS } from '@/lib/reports/summary-formats';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

const AUDIENCE_LABELS = { internal: '내부용', client: '발주처 공유용' } as const;

/**
 * 종합결과리포트 목록·생성·내보내기 (운영사) / 목록·내보내기만 (발주처, readOnly).
 * (P31) 대상(내부용/발주처 공유용) 선택 · PL 이면 제목 변경·숨김/복원(canManage) · 숨긴 리포트 보기 토글은 페이지 링크(showHidden)
 */
export function SummarySnapshotsPanel({ snapshots, canManage = false, readOnly = false, showHidden = false, periodLabel = null }: { snapshots: SnapshotListItem[]; canManage?: boolean; readOnly?: boolean; showHidden?: boolean; periodLabel?: string | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState<'internal' | 'client'>('internal');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const { confirm, dialog } = useConfirm();

  const rename = (s: SnapshotListItem) => {
    if (!editing || editing.id !== s.id) return;
    start(async () => {
      const r = await renameSummarySnapshotAction(s.id, editing.title);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: '제목을 변경했습니다.' });
      setEditing(null);
      router.refresh();
    });
  };
  const toggleHidden = async (s: SnapshotListItem) => {
    const ok = await confirm(
      s.hidden
        ? { title: '리포트 복원', description: `"${s.title}" 을(를) 목록에 다시 표시합니다.`, confirmLabel: '복원' }
        : { title: '리포트 숨김', description: `"${s.title}" 을(를) 목록에서 숨깁니다. 데이터는 삭제되지 않으며 기존 링크로는 열립니다.`, impact: ['발주처 공유용이면 발주처 목록에서도 사라집니다.', 'PL 이 [숨긴 리포트 보기]에서 복원할 수 있습니다.'], confirmLabel: '숨김', severity: 'danger' },
    );
    if (!ok) return;
    start(async () => {
      const r = await hideSummarySnapshotAction(s.id, !s.hidden);
      toast(r.ok ? { title: s.hidden ? '복원했습니다.' : '숨겼습니다.' } : { title: r.error, variant: 'destructive' });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-4">
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <label htmlFor="snap-title" className="text-sm font-medium">리포트 제목 (비우면 자동)</label>
            <Input id="snap-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 상반기 중간 결과보고" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="snap-audience" className="text-sm font-medium">대상</label>
            <select id="snap-audience" value={audience} onChange={(e) => setAudience(e.target.value as 'internal' | 'client')} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
              <option value="internal">내부용 (운영사 평가 포함)</option>
              <option value="client">발주처 공유용 (운영사 평가 제외)</option>
            </select>
          </div>
          <Button
            className="gap-1"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createSummarySnapshotAction(title, null, audience);
                if (!r.ok) {
                  toast({ title: r.error, variant: 'destructive' });
                  return;
                }
                setTitle('');
                toast({ title: '종합결과리포트를 생성했습니다 (지금 시점의 데이터로 고정).' });
                router.refresh();
              })
            }
          >
            <FilePlus2 className="h-4 w-4" /> {pending ? '생성 중…' : '지금 기준으로 생성'}
          </Button>
          {periodLabel && <p className="w-full text-xs text-muted-foreground">기간 스냅샷은 리포트 화면의 기간 칩에서 [이 기간으로 리포트 생성]을 사용하세요. ({periodLabel})</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">제목</th>
              <th className="px-3 py-2">범위 · 대상</th>
              <th className="px-3 py-2">생성</th>
              <th className="px-3 py-2 text-right">케이스 / 종결</th>
              <th className="px-3 py-2 text-right">보기 · 저장</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{showHidden ? '숨긴 리포트가 없습니다.' : readOnly ? '공유된 리포트가 아직 없습니다.' : '아직 생성된 리포트가 없습니다. 위에서 첫 리포트를 생성하세요.'}</td></tr>
            )}
            {snapshots.map((s) => (
              <tr key={s.id} className={`border-b align-top last:border-0 ${s.hidden ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2 font-medium">
                  {editing?.id === s.id ? (
                    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); rename(s); }}>
                      <Input value={editing.title} onChange={(e) => setEditing({ id: s.id, title: e.target.value })} className="h-8 text-sm" autoFocus />
                      <Button type="submit" size="sm" className="h-8" disabled={pending}>저장</Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>취소</Button>
                    </form>
                  ) : (
                    <>
                      {s.title}
                      {s.hidden && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">숨김</span>}
                      {canManage && !readOnly && (
                        <button type="button" className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground" title="제목 변경" onClick={() => setEditing({ id: s.id, title: s.title })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {s.groupName ?? '행사 전체'}
                  <br />
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${s.audience === 'client' ? 'bg-sky-100 text-sky-800' : 'bg-muted text-muted-foreground'}`}>{AUDIENCE_LABELS[s.audience]}</span>
                  {s.period && <span className="ml-1 text-[10px] text-muted-foreground">{s.period}</span>}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{formatDateTime(s.generatedAt)}{s.generatedByName ? ` · ${s.generatedByName}` : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.cases} / {s.closed}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
                      <a href={`/api/reports/summary/${s.id}/export?format=html&inline=1`} target="_blank" rel="noreferrer"><Eye className="h-3.5 w-3.5" /> 보기</a>
                    </Button>
                    {SUMMARY_FORMATS.map((f) => (
                      <Button key={f.key} asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title={`${f.label} 로 저장`}>
                        <a href={`/api/reports/summary/${s.id}/export?format=${f.key}`}><FileDown className="h-3 w-3" /> {f.label}</a>
                      </Button>
                    ))}
                    {canManage && !readOnly && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground" disabled={pending} onClick={() => void toggleHidden(s)} title={s.hidden ? '복원' : '숨김'}>
                        {s.hidden ? <Undo2 className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} {s.hidden ? '복원' : '숨김'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">PDF 첫 생성은 10~20초 걸릴 수 있습니다. {readOnly ? '리포트는 생성 시점의 데이터로 고정된 스냅샷입니다.' : '발주처 담당자는 [발주처 공유용] 리포트를 발주처 › 리포트 › 종합결과리포트에서 열람·저장합니다.'}</p>
    </div>
  );
}
