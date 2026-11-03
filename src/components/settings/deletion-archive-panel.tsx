'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { kstHm, kstYmd } from '@/lib/utils/kst';
import { formatKRW } from '@/lib/utils/format';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { restoreDeletionArchiveAction } from '@/lib/archive/actions';

export interface ArchiveRow {
  id: string;
  label: string;
  createdAt: string;
  createdByName: string | null;
  reason: string | null;
  summary: Record<string, unknown>;
  restoredAt: string | null;
  restoredByName: string | null;
  deleteFailed: boolean;
}

const n = (v: unknown) => (typeof v === 'number' ? v : 0);

/** 운영 설정 > 삭제 보관함 (2026-11-03) — 완전 삭제한 테스트 계정 기록·복원 */
export function DeletionArchivePanel({ rows, canRestore }: { rows: ArchiveRow[]; canRestore: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        회원 명단에서 [테스트 계정 완전 삭제]로 지운 계정과 연결 데이터(케이스·멘토 배정·회차·보고서·정산·파일 등)가 여기에 보관됩니다. [복원]하면 같은 계정으로 되살리고, 로그인 비밀번호는 휴대폰 번호 숫자(임시)로 바뀌어 첫 로그인 때 변경을 요구합니다.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">보관된 삭제 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">삭제 시각</th>
                <th className="px-3 py-2">계정</th>
                <th className="px-3 py-2">함께 삭제</th>
                <th className="px-3 py-2">메모</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {kstYmd(r.createdAt)} {kstHm(r.createdAt)}
                    {r.createdByName && <div className="text-[11px] text-muted-foreground">{r.createdByName}</div>}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    케이스 {n(r.summary.cases)} · 회차 {n(r.summary.rounds)}(보고서 {n(r.summary.reports)}) · 정산 {n(r.summary.settlements)}건 {formatKRW(n(r.summary.settlement_net))} · 파일 {n(r.summary.files)}
                    {n(r.summary.batches_removed) > 0 && ` · 품의 ${n(r.summary.batches_removed)}건`}
                  </td>
                  <td className="max-w-[200px] px-3 py-2 text-xs">{r.reason ?? ''}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.restoredAt ? (
                      <Badge variant="outline" className="border-emerald-400 text-emerald-700">복원됨 {kstYmd(r.restoredAt)}{r.restoredByName ? ` · ${r.restoredByName}` : ''}</Badge>
                    ) : r.deleteFailed ? (
                      <Badge variant="destructive">삭제 중단 — 복원 권장</Badge>
                    ) : (
                      <Badge variant="secondary">보관 중</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{!r.restoredAt && canRestore && <RestoreButton row={r} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RestoreButton({ row }: { row: ArchiveRow }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tempPassword: string; email: string | null; warnings: string[] } | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await restoreDeletionArchiveAction({ archiveId: row.id, password });
      if (r.ok) {
        setDone({ tempPassword: r.tempPassword, email: r.email, warnings: r.warnings });
        toast({ title: r.message });
        router.refresh();
      } else setError(r.error);
    });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setOpen(true); setPassword(''); setError(null); setDone(null); }}>복원</Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>보관 기록 복원 · {row.label}</DialogTitle>
            <DialogDescription>계정과 연결 데이터를 삭제 전 상태로 되돌립니다. 정산·품의도 다시 집계에 들어갑니다.</DialogDescription>
          </DialogHeader>
          {done ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>복원했습니다. 아래 임시 비밀번호는 지금 한 번만 보입니다.</p>
              <div className="rounded-md border bg-muted/40 p-3 font-mono">
                아이디(이메일): {done.email ?? '-'}
                <br />
                임시 비밀번호: {done.tempPassword}
              </div>
              {done.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-300">
                  {done.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <Button onClick={() => setOpen(false)}>닫기</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor={`restore-pw-${row.id}`}>내 로그인 비밀번호</label>
              <Input id={`restore-pw-${row.id}`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>취소</Button>
                <Button disabled={pending || !password} onClick={submit}>{pending ? '복원 중…' : '복원'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
