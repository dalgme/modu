'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Search, Trash2, Upload, X, XCircle } from 'lucide-react';

import { FileActions } from '@/components/files/file-preview';
import { DropZone } from '@/components/files/drop-zone';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ContactLinks } from '@/components/common/contact-links';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { stageUpload } from '@/lib/storage/browser-upload';
import { cn } from '@/lib/utils';
import { BUSINESS_DOC_LABELS, type BusinessDocKey } from '@/lib/files/business-plan-shared';
import { BUSINESS_DOC_MAX_BYTES, BUSINESS_DOC_MAX_FILES, businessDocExtAllowed, businessDocAccept, businessDocExtLabel, matchMenteeFile, type MenteeMatchCandidate } from '@/lib/files/business-plan-match';
import { formatBytes } from '@/lib/files/mentor-payment-shared';
import { deleteBusinessDocAction, uploadBusinessDocsAction, type BusinessUploadItemResult } from '@/lib/files/business-plan-actions';

/** 서버에서 받는 표 행 (직렬화 가능한 값만) */
export interface BusinessPlanRowView {
  caseId: string;
  menteeName: string;
  nickname: string;
  externalNo: string | null;
  mentorName: string | null;
  phone: string | null;
  email: string | null;
  withdrawn: boolean;
  files: { id: string; docKey: BusinessDocKey; name: string; mime: string | null; size: number | null; createdAt: string }[];
}

/** 업로드 대기 파일 한 건 — 화면에서 미리 매칭해 보여 주고, 서버가 같은 함수로 최종 판정한다 */
interface Pending {
  key: string;
  file: File;
  /** 귀속 멘티 이름 (행별 업로드면 고정) */
  target: string | null;
  error: string | null;
}

const ACTION_CHUNK = 10;
const STAGE_CONCURRENCY = 3;

function validate(docKey: BusinessDocKey, f: File): string | null {
  if (!businessDocExtAllowed(docKey, f.name)) return `${BUSINESS_DOC_LABELS[docKey]}는 ${businessDocExtLabel(docKey)} 형식만 올릴 수 있습니다`;
  if (f.size > BUSINESS_DOC_MAX_BYTES) return '파일은 30MB 이하여야 합니다';
  if (f.size === 0) return '빈 파일입니다';
  return null;
}

/**
 * 파일 여러 개를 스테이징(브라우저 → 스토리지 직접) 후 서버 액션으로 귀속. 스테이징은 3개씩 동시에, 액션은 10개씩.
 * 스테이징에 실패한 파일은 서버로 보내지 않고 결과에 실패로 남긴다.
 */
async function uploadAll(docKey: BusinessDocKey, items: Pending[], caseId: string | null, onProgress: (done: number) => void): Promise<BusinessUploadItemResult[]> {
  const results: BusinessUploadItemResult[] = [];
  let done = 0;
  for (let i = 0; i < items.length; i += ACTION_CHUNK) {
    const chunk = items.slice(i, i + ACTION_CHUNK);
    const staged: { stagingPath: string; fileName: string; mimeType: string }[] = [];
    for (let j = 0; j < chunk.length; j += STAGE_CONCURRENCY) {
      const part = chunk.slice(j, j + STAGE_CONCURRENCY);
      const settled = await Promise.allSettled(part.map((p) => stageUpload(p.file)));
      settled.forEach((s, k) => {
        const p = part[k]!;
        if (s.status === 'fulfilled') staged.push({ stagingPath: s.value.stagingPath, fileName: p.file.name, mimeType: s.value.mimeType });
        else {
          results.push({ fileName: p.file.name, ok: false, error: s.reason instanceof Error ? s.reason.message : '업로드 실패' });
          done++;
          onProgress(done);
        }
      });
    }
    if (staged.length === 0) continue;
    const r = await uploadBusinessDocsAction({ docKey, files: staged, caseId });
    if (!r.ok) {
      for (const s of staged) results.push({ fileName: s.fileName, ok: false, error: r.error });
    } else {
      results.push(...r.results);
    }
    done += staged.length;
    onProgress(done);
  }
  return results;
}

function ResultList({ results, onClose }: { results: BusinessUploadItemResult[]; onClose: () => void }) {
  const okCount = results.filter((r) => r.ok).length;
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          업로드 결과 — <span className="text-emerald-700 dark:text-emerald-400">귀속 {okCount}건</span>
          {results.length - okCount > 0 && <span className="text-status-rejected"> · 실패 {results.length - okCount}건 (저장하지 않음)</span>}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-7 px-2">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ul className="flex max-h-72 flex-col divide-y overflow-y-auto text-sm">
        {results.map((r, i) => (
          <li key={`${r.fileName}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
            {r.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-status-rejected" />}
            <span className="min-w-0 break-all">{r.fileName}</span>
            <span className={cn('text-xs', r.ok ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-status-rejected')}>{r.ok ? `→ ${r.menteeName}` : r.error}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 사업계획서 / 참고파일 선택 버튼 */
function DocKeyPicker({ value, onChange, disabled }: { value: BusinessDocKey; onChange: (v: BusinessDocKey) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="파일 종류" className="inline-flex rounded-lg border bg-muted/40 p-1">
      {(['business_plan', 'business_ref'] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          disabled={disabled}
          onClick={() => onChange(k)}
          className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', value === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {BUSINESS_DOC_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

/** 행별 [업로드] — 파일명 규칙과 관계없이 이 멘티에 올린다 */
function RowUploadDialog({ row, open, onOpenChange }: { row: BusinessPlanRowView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [docKey, setDocKey] = useState<BusinessDocKey>('business_plan');
  const [items, setItems] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<BusinessUploadItemResult[] | null>(null);

  const add = (files: File[]) => {
    setResults(null);
    setItems((prev) => [...prev, ...files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, target: row.menteeName, error: validate(docKey, f) }))]);
  };
  const changeKey = (k: BusinessDocKey) => {
    setDocKey(k);
    setItems((prev) => prev.map((p) => ({ ...p, error: validate(k, p.file) })));
  };
  const valid = items.filter((p) => !p.error);
  const run = async () => {
    setBusy(true);
    setDone(0);
    try {
      const r = await uploadAll(docKey, valid, row.caseId, setDone);
      setResults(r);
      setItems([]);
      const n = r.filter((x) => x.ok).length;
      toast({ title: `${row.menteeName} 멘티에 ${n}개를 올렸습니다.`, variant: n === r.length ? 'default' : 'destructive' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.menteeName} 멘티 파일 올리기</DialogTitle>
          <DialogDescription>파일명과 관계없이 이 멘티에게 귀속됩니다.</DialogDescription>
        </DialogHeader>
        <DocKeyPicker value={docKey} onChange={changeKey} disabled={busy} />
        <DropZone onFiles={add} disabled={busy} accept={businessDocAccept(docKey)} hint={`${businessDocExtLabel(docKey)} · 파일당 30MB`} />
        {items.length > 0 && (
          <ul className="flex max-h-48 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
            {items.map((p) => (
              <li key={p.key} className="flex items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 break-all">{p.file.name}</span>
                {p.error ? <span className="text-xs text-status-rejected">{p.error}</span> : <span className="text-xs text-muted-foreground">{formatBytes(p.file.size)}</span>}
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setItems((prev) => prev.filter((x) => x.key !== p.key))} aria-label="목록에서 빼기" disabled={busy}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {busy && <ProgressBar done={done} total={valid.length} />}
        {results && <ResultList results={results} onClose={() => setResults(null)} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            닫기
          </Button>
          <Button type="button" onClick={run} disabled={busy || valid.length === 0} className="gap-1">
            <Upload className="h-4 w-4" /> {busy ? '올리는 중…' : `${valid.length}개 올리기`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {done} / {total}개 처리됨 — 창을 닫지 마세요
      </p>
    </div>
  );
}

/**
 * 파일 관리 › 멘티 사업계획서 (2026-09-30) — 라운드 일괄 업로드(파일명 맨 앞 멘티명으로 자동 귀속) + 멘티별 표.
 */
export function BusinessPlanManager({ rows, candidates, canEdit, roundName }: { rows: BusinessPlanRowView[]; candidates: MenteeMatchCandidate[]; canEdit: boolean; roundName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [docKey, setDocKey] = useState<BusinessDocKey>('business_plan');
  const [items, setItems] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<BusinessUploadItemResult[] | null>(null);
  const [q, setQ] = useState('');
  const [rowUpload, setRowUpload] = useState<BusinessPlanRowView | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const evaluate = (k: BusinessDocKey, f: File): Pick<Pending, 'target' | 'error'> => {
    const bad = validate(k, f);
    if (bad) return { target: null, error: bad };
    const m = matchMenteeFile(f.name, candidates);
    return m.ok ? { target: m.name, error: null } : { target: null, error: m.message };
  };
  const add = (files: File[]) => {
    setResults(null);
    setItems((prev) => {
      const room = BUSINESS_DOC_MAX_FILES - prev.length;
      if (files.length > room) toast({ title: `한 번에 최대 ${BUSINESS_DOC_MAX_FILES}개까지 올릴 수 있습니다. 나머지는 다음에 올려 주세요.`, variant: 'destructive' });
      return [...prev, ...files.slice(0, Math.max(0, room)).map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, ...evaluate(docKey, f) }))];
    });
  };
  const changeKey = (k: BusinessDocKey) => {
    setDocKey(k);
    setItems((prev) => prev.map((p) => ({ ...p, ...evaluate(k, p.file) })));
  };
  const ready = items.filter((p) => !p.error);
  const blocked = items.filter((p) => p.error);

  const run = async () => {
    setBusy(true);
    setDone(0);
    try {
      const r = await uploadAll(docKey, ready, null, setDone);
      // 화면 단계에서 걸러진 파일도 결과에 함께 보여 준다(저장하지 않음)
      const all = [...r, ...blocked.map((p) => ({ fileName: p.file.name, ok: false, error: p.error ?? '' }))];
      setResults(all);
      setItems([]);
      const n = r.filter((x) => x.ok).length;
      toast({ title: `${n}개 파일을 멘티에게 귀속했습니다.${all.length - n > 0 ? ` 실패 ${all.length - n}개는 저장하지 않았습니다.` : ''}` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (docId: string, name: string, mentee: string) => {
    const ok = await confirm({ title: '파일을 삭제할까요?', description: `${mentee} 멘티의 "${name}" 파일을 삭제합니다. 멘토 화면에서도 사라지며 되돌릴 수 없습니다.`, severity: 'danger', confirmLabel: '삭제' });
    if (!ok) return;
    setDeleting(docId);
    const r = await deleteBusinessDocAction(docId);
    setDeleting(null);
    if (!r.ok) {
      toast({ title: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: '삭제했습니다.' });
    router.refresh();
  };

  const filtered = useMemo(() => {
    const k = q.trim().replace(/\s+/g, '').toLowerCase();
    if (!k) return rows;
    return rows.filter((r) => [r.menteeName, r.nickname, r.mentorName ?? '', r.externalNo ?? '', r.email ?? '', (r.phone ?? '').replace(/\D/g, '')].some((v) => v.replace(/\s+/g, '').toLowerCase().includes(k)));
  }, [rows, q]);
  const withFiles = rows.filter((r) => r.files.some((f) => f.docKey === 'business_plan')).length;

  const fileChips = (r: BusinessPlanRowView) =>
    r.files.length === 0 ? (
      <span className="text-xs text-muted-foreground">없음</span>
    ) : (
      <ul className="flex flex-col gap-1.5">
        {r.files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', f.docKey === 'business_plan' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{BUSINESS_DOC_LABELS[f.docKey]}</span>
            <span className="min-w-0 max-w-[16rem] truncate text-xs" title={f.name}>
              {f.name}
            </span>
            <FileActions docId={f.id} name={f.name} mime={f.mime} size="xs" />
            {canEdit && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-status-rejected" onClick={() => remove(f.id, f.name, r.menteeName)} disabled={deleting === f.id} title="삭제">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {canEdit ? (
        <section className="flex flex-col gap-3 rounded-2xl border bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{roundName} 일괄 업로드</h2>
            <DocKeyPicker value={docKey} onChange={changeKey} disabled={busy} />
          </div>
          <DropZone onFiles={add} disabled={busy} accept={businessDocAccept(docKey)} hint={`${BUSINESS_DOC_LABELS[docKey]}: ${businessDocExtLabel(docKey)} · 파일당 30MB · 한 번에 최대 ${BUSINESS_DOC_MAX_FILES}개`} />
          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                선택 {items.length}개 — <b className="text-emerald-700 dark:text-emerald-400">귀속 가능 {ready.length}개</b>
                {blocked.length > 0 && <span className="text-status-rejected"> · 올리지 않음 {blocked.length}개</span>}
              </p>
              <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
                {items.map((p) => (
                  <li key={p.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5">
                    {p.error ? <XCircle className="h-4 w-4 shrink-0 text-status-rejected" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                    <span className="min-w-0 flex-1 break-all">{p.file.name}</span>
                    <span className={cn('text-xs', p.error ? 'text-status-rejected' : 'font-semibold text-emerald-700 dark:text-emerald-400')}>{p.error ?? `→ ${p.target}`}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(p.file.size)}</span>
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setItems((prev) => prev.filter((x) => x.key !== p.key))} aria-label="목록에서 빼기" disabled={busy}>
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {busy && <ProgressBar done={done} total={ready.length} />}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setItems([])} disabled={busy}>
                  모두 비우기
                </Button>
                <Button type="button" onClick={run} disabled={busy || ready.length === 0} className="gap-1">
                  <Upload className="h-4 w-4" /> {busy ? '올리는 중…' : `${ready.length}개 올리기 (${BUSINESS_DOC_LABELS[docKey]})`}
                </Button>
              </div>
            </div>
          )}
          {results && <ResultList results={results} onClose={() => setResults(null)} />}
        </section>
      ) : (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">현재 등급에는 &apos;멘티 등록·승계·서류&apos; 권한이 없어 열람만 가능합니다.</p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            멘티 {rows.length}명 · 사업계획서 등록 <span className="text-primary">{withFiles}</span>명
          </p>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="멘티·멘토 이름, 연락처 검색" className="pl-8" aria-label="검색" />
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">이 라운드에 등록된 멘티가 없습니다.</div>
        ) : (
          <>
            {/* 데스크톱: 표 */}
            <div className="hidden overflow-x-auto rounded-xl border bg-background md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">멘티명</th>
                    <th className="px-3 py-2.5 font-medium">담당멘토</th>
                    <th className="px-3 py-2.5 font-medium">멘티연락처</th>
                    <th className="px-3 py-2.5 font-medium">멘티이메일</th>
                    <th className="px-3 py-2.5 font-medium">첨부파일</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.caseId} className={cn('border-b align-top last:border-0', r.withdrawn && 'bg-muted/30 text-muted-foreground')}>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <p className="font-semibold">{r.menteeName}</p>
                        {(r.nickname || r.externalNo) && <p className="text-[11px] text-muted-foreground">{[r.nickname, r.externalNo].filter(Boolean).join(' · ')}</p>}
                        {r.withdrawn && <span className="mt-0.5 inline-block rounded bg-muted px-1.5 text-[10px] font-semibold">중도 종료</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{r.mentorName ?? <span className="text-muted-foreground">미배정</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {r.phone ?? '-'}
                          <ContactLinks phone={r.phone} name={r.menteeName} size="xs" />
                        </span>
                      </td>
                      <td className="break-all px-3 py-2.5 text-muted-foreground">{r.email ?? '-'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-2">
                          {fileChips(r)}
                          {canEdit && (
                            <Button type="button" variant="outline" size="sm" className="h-7 w-fit gap-1 px-2 text-xs" onClick={() => setRowUpload(r)}>
                              <Upload className="h-3.5 w-3.5" /> 업로드
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 폰: 카드 */}
            <ul className="flex flex-col gap-2 md:hidden">
              {filtered.map((r) => (
                <li key={r.caseId} className={cn('flex flex-col gap-2 rounded-xl border bg-background p-3', r.withdrawn && 'opacity-70')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {r.menteeName}
                        {r.withdrawn && <span className="ml-1 rounded bg-muted px-1.5 text-[10px] font-semibold">중도 종료</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">담당멘토 {r.mentorName ?? '미배정'}</p>
                      <p className="break-all text-xs text-muted-foreground">{[r.phone, r.email].filter(Boolean).join(' · ') || '-'}</p>
                    </div>
                    <ContactLinks phone={r.phone} name={r.menteeName} size="xs" />
                  </div>
                  {fileChips(r)}
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" className="w-fit gap-1" onClick={() => setRowUpload(r)}>
                      <Upload className="h-3.5 w-3.5" /> 업로드
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>}
          </>
        )}
      </section>
      {rowUpload && <RowUploadDialog key={rowUpload.caseId} row={rowUpload} open onOpenChange={(o) => !o && setRowUpload(null)} />}
    </div>
  );
}
