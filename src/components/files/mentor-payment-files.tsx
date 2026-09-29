'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Download, ExternalLink, FileWarning, Loader2, Lock, Paperclip, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';

import { FilePreviewButton } from '@/components/files/file-preview';
import { DropZone } from '@/components/files/drop-zone';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ContactLinks } from '@/components/common/contact-links';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { stageUpload } from '@/lib/storage/browser-upload';
import { cn } from '@/lib/utils';
import {
  formatBytes,
  MENTOR_PAYMENT_EXTS,
  MENTOR_PAYMENT_MAX_BYTES,
  MENTOR_PAYMENT_MAX_FILES,
  mentorPaymentExtAllowed,
  mentorPaymentFileHref,
  mentorPaymentMergedHref,
  type MentorPaymentFileItem,
} from '@/lib/files/mentor-payment-shared';
import { deleteMentorPaymentFileAction, reorderMentorPaymentFilesAction, uploadMentorPaymentFilesAction } from '@/lib/files/mentor-payment-actions';

const ACCEPT = MENTOR_PAYMENT_EXTS.map((e) => `.${e}`).join(',');
const EXT_LABEL = 'PDF·JPG·PNG·HWP·HWPX·DOC·DOCX';

function checkFile(f: File): string | null {
  if (!mentorPaymentExtAllowed(f.name)) return `${EXT_LABEL} 형식만 올릴 수 있습니다`;
  if (f.size > MENTOR_PAYMENT_MAX_BYTES) return '파일은 20MB 이하여야 합니다';
  if (f.size === 0) return '빈 파일입니다';
  return null;
}

/** 스테이징(3개씩 동시) 후 서버 액션 1회 — 멘토 1명 파일은 최대 10개라 한 번에 보낸다 */
async function stageAndSave(mentorId: string, files: File[], replaceFileId: string | null): Promise<{ ok: boolean; message: string }> {
  const staged: { stagingPath: string; fileName: string; mimeType: string }[] = [];
  const stageErrors: string[] = [];
  for (let i = 0; i < files.length; i += 3) {
    const part = files.slice(i, i + 3);
    const settled = await Promise.allSettled(part.map((f) => stageUpload(f)));
    settled.forEach((s, k) => {
      if (s.status === 'fulfilled') staged.push({ stagingPath: s.value.stagingPath, fileName: part[k]!.name, mimeType: s.value.mimeType });
      else stageErrors.push(`${part[k]!.name}: 업로드 실패`);
    });
  }
  if (staged.length === 0) return { ok: false, message: stageErrors.join(' / ') || '업로드 실패' };
  const r = await uploadMentorPaymentFilesAction({ mentorId, files: staged, replaceFileId });
  if (!r.ok) return { ok: false, message: r.error };
  const fails = [...stageErrors, ...r.failed.map((f) => `${f.fileName}: ${f.error}`)];
  return { ok: fails.length === 0, message: fails.length ? `${r.added}개 등록 · 실패: ${fails.join(' / ')}` : replaceFileId ? '파일을 교체했습니다.' : `${r.added}개 파일을 등록했습니다.` };
}

/** 업로드 영역 — 처음 등록·[파일 추가] 공용 */
function PaymentUploader({ mentorId, existing, onDone }: { mentorId: string; existing: number; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [picked, setPicked] = useState<{ key: string; file: File; error: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const room = MENTOR_PAYMENT_MAX_FILES - existing;
  const valid = picked.filter((p) => !p.error);

  const add = (files: File[]) => setPicked((prev) => [...prev, ...files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, error: checkFile(f) }))]);
  const run = async () => {
    if (valid.length > room) {
      toast({ title: `멘토 1명당 최대 ${MENTOR_PAYMENT_MAX_FILES}개입니다. ${room}개까지 더 올릴 수 있습니다.`, variant: 'destructive' });
      return;
    }
    setBusy(true);
    const r = await stageAndSave(mentorId, valid.map((p) => p.file), null);
    setBusy(false);
    toast({ title: r.message, variant: r.ok ? 'default' : 'destructive' });
    setPicked([]);
    router.refresh();
    if (r.ok) onDone();
  };

  return (
    <div className="flex flex-col gap-2">
      <DropZone onFiles={add} disabled={busy} accept={ACCEPT} hint={`지급증빙 서류 2~4종 (이력서·통장사본·신분증사본 등) · ${EXT_LABEL} · 파일당 20MB · 멘토당 최대 ${MENTOR_PAYMENT_MAX_FILES}개 (남은 ${room}개)`} />
      {picked.length > 0 && (
        <>
          <ul className="flex max-h-44 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
            {picked.map((p) => (
              <li key={p.key} className="flex items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 break-all">{p.file.name}</span>
                {p.error ? <span className="text-xs text-status-rejected">{p.error}</span> : <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(p.file.size)}</span>}
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setPicked((prev) => prev.filter((x) => x.key !== p.key))} aria-label="목록에서 빼기" disabled={busy}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button type="button" onClick={run} disabled={busy || valid.length === 0} className="gap-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy ? '올리는 중…' : `${valid.length}개 등록`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

type MergedMeta = { name: string; mime: string | null; url: string; downloadUrl: string | null; skipped?: string[] };

/** 합본 PDF 미리보기 — 파일 구성이 바뀌면(fingerprint) 다시 받는다 */
function MergedPreview({ mentorId, fingerprint, hasMergeable }: { mentorId: string; fingerprint: string; hasMergeable: boolean }) {
  const [state, setState] = useState<{ loading: boolean; meta: MergedMeta | null; error: string | null }>({ loading: hasMergeable, meta: null, error: null });
  useEffect(() => {
    if (!hasMergeable) {
      setState({ loading: false, meta: null, error: null });
      return;
    }
    let alive = true;
    setState({ loading: true, meta: null, error: null });
    fetch(mentorPaymentMergedHref(mentorId, 'meta'), { cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Partial<MergedMeta> & { error?: string };
        if (!alive) return;
        if (!res.ok || !body.url) setState({ loading: false, meta: null, error: body.error ?? '합본 PDF 를 만들지 못했습니다.' });
        else setState({ loading: false, meta: body as MergedMeta, error: null });
      })
      .catch(() => alive && setState({ loading: false, meta: null, error: '합본 PDF 를 불러오지 못했습니다.' }));
    return () => {
      alive = false;
    };
  }, [mentorId, fingerprint, hasMergeable]);

  if (!hasMergeable) {
    return <div className="flex h-full min-h-[240px] items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">PDF·JPG·PNG 파일이 없어 합본 미리보기가 없습니다. 오른쪽 목록에서 파일별로 미리 보세요.</div>;
  }
  if (state.loading) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border bg-muted/20 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" /> 파일을 하나의 PDF 로 합치는 중…
      </div>
    );
  }
  if (state.error || !state.meta) return <div className="flex h-full min-h-[240px] items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-status-rejected">{state.error}</div>;
  return (
    <div className="flex h-full min-h-[320px] flex-col gap-1">
      <iframe key={state.meta.url} src={state.meta.url} title="지급서류 합본 PDF" className="h-full min-h-[320px] w-full flex-1 rounded-lg border bg-white" />
      {state.meta.skipped && state.meta.skipped.length > 0 && <p className="text-[11px] text-status-rejected">읽지 못해 합본에서 빠진 파일: {state.meta.skipped.join(', ')}</p>}
    </div>
  );
}

/**
 * 멘토 지급서류 버튼 (2026-09-30) — 파일 없음: [업로드] / 있음: [첨부 파일(N개)] → 레이어 팝업(합본 PDF 미리보기 + 파일 목록).
 * canEdit: 운영사(`mentors.docs`) — 추가·교체·삭제·순서 변경. canView=false 면 개수만 보인다(권한 없음).
 * 발주처는 canEdit=false·canView=true(확인·저장).
 */
export function MentorPaymentFilesButton({ mentorId, mentorName, files, canEdit, canView }: { mentorId: string; mentorName: string; files: MentorPaymentFileItem[]; canEdit: boolean; canView: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<MentorPaymentFileItem | null>(null);

  const fingerprint = useMemo(() => files.map((f) => f.id).join(','), [files]);
  const mergeable = files.filter((f) => f.mergeable);
  const others = files.filter((f) => !f.mergeable);

  if (files.length === 0) {
    if (!canEdit) return <span className="text-xs text-muted-foreground">미등록</span>;
    return (
      <>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => setOpen(true)}>
          <Upload className="h-3.5 w-3.5" /> 업로드
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{mentorName} 지급증빙 서류 등록</DialogTitle>
              <DialogDescription>여러 파일을 한 번에 올릴 수 있습니다. 등록한 서류는 모든 라운드에서 함께 쓰입니다.</DialogDescription>
            </DialogHeader>
            <PaymentUploader mentorId={mentorId} existing={0} onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!canView) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="멘토 지급서류 권한이 있는 담당자만 열람할 수 있습니다">
        <Lock className="h-3.5 w-3.5" /> 첨부 {files.length}개
      </span>
    );
  }

  const move = async (idx: number, dir: -1 | 1) => {
    const ids = files.map((f) => f.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    setBusyId(files[idx]!.id);
    const r = await reorderMentorPaymentFilesAction(mentorId, ids);
    setBusyId(null);
    if (!r.ok) toast({ title: r.error, variant: 'destructive' });
    router.refresh();
  };
  const remove = async (f: MentorPaymentFileItem) => {
    const ok = await confirm({ title: '파일을 삭제할까요?', description: `${mentorName} 멘토의 "${f.name}" 를 삭제합니다. 모든 라운드에서 사라지며 되돌릴 수 없습니다.`, severity: 'danger', confirmLabel: '삭제' });
    if (!ok) return;
    setBusyId(f.id);
    const r = await deleteMentorPaymentFileAction(f.id);
    setBusyId(null);
    toast({ title: r.ok ? '삭제했습니다.' : r.error, variant: r.ok ? 'default' : 'destructive' });
    router.refresh();
  };
  const onReplacePicked = async (file: File | undefined) => {
    const target = replaceTarget;
    setReplaceTarget(null);
    if (!file || !target) return;
    const bad = checkFile(file);
    if (bad) {
      toast({ title: bad, variant: 'destructive' });
      return;
    }
    setBusyId(target.id);
    const r = await stageAndSave(mentorId, [file], target.id);
    setBusyId(null);
    toast({ title: r.message, variant: r.ok ? 'default' : 'destructive' });
    router.refresh();
  };

  const fileRow = (f: MentorPaymentFileItem) => {
    const idx = files.findIndex((x) => x.id === f.id);
    return (
      <li key={f.id} className="flex flex-col gap-1.5 py-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-medium">{f.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatBytes(f.size)}
              {!f.mergeable && ' · PDF 합본에서 제외(개별 미리보기)'}
            </p>
          </div>
          {busyId === f.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-1 pl-7">
          <FilePreviewButton metaUrl={mentorPaymentFileHref(f.id, 'meta')} name={f.name} mime={f.mime} size="xs" allowDownload />
          <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
            <a href={mentorPaymentFileHref(f.id, 'download')} title={`${f.name} 다운로드`}>
              <Download className="h-3.5 w-3.5" /> 저장
            </a>
          </Button>
          {canEdit && (
            <>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => move(idx, -1)} disabled={idx === 0 || !!busyId} title="위로">
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => move(idx, 1)} disabled={idx === files.length - 1 || !!busyId} title="아래로">
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={!!busyId}
                onClick={() => {
                  setReplaceTarget(f);
                  replaceRef.current?.click();
                }}
                title="이 파일을 새 파일로 교체"
              >
                <RefreshCw className="h-3.5 w-3.5" /> 교체
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-status-rejected" onClick={() => remove(f)} disabled={!!busyId} title="삭제">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      {dialog}
      <Button type="button" size="sm" variant="secondary" className="h-8 gap-1 border border-primary/30 bg-primary/10 font-semibold text-primary hover:bg-primary/15" onClick={() => setOpen(true)}>
        <Paperclip className="h-3.5 w-3.5" /> 첨부 파일({files.length}개)
      </Button>
      <input ref={replaceRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { void onReplacePicked(e.target.files?.[0]); e.target.value = ''; }} />
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAdding(false); }}>
        <DialogContent className="flex h-[90dvh] max-w-6xl flex-col gap-3 p-4 sm:h-[88vh]">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pr-10">
            <div className="min-w-0">
              <DialogTitle className="truncate">{mentorName} 지급증빙 서류 ({files.length}개)</DialogTitle>
              <DialogDescription>모든 라운드에서 함께 쓰는 서류입니다. PDF·이미지는 하나의 PDF 로 합쳐 보여 줍니다.</DialogDescription>
            </div>
            {mergeable.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <a href={mentorPaymentMergedHref(mentorId, 'inline')} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> 새 창
                  </a>
                </Button>
                <Button asChild size="sm" className="gap-1">
                  <a href={mentorPaymentMergedHref(mentorId, 'download')}>
                    <Download className="h-3.5 w-3.5" /> 전체 PDF 다운로드
                  </a>
                </Button>
              </div>
            )}
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto lg:grid-cols-[1fr_340px] lg:overflow-hidden">
            <div className="min-h-[50dvh] lg:min-h-0">
              {open && <MergedPreview mentorId={mentorId} fingerprint={fingerprint} hasMergeable={mergeable.length > 0} />}
            </div>
            <div className="flex min-h-0 flex-col gap-2 lg:overflow-y-auto">
              <p className="text-sm font-semibold">파일 목록{canEdit && <span className="font-normal text-muted-foreground"> · 순서가 합본 PDF 쪽 순서입니다</span>}</p>
              <ul className="flex flex-col divide-y rounded-lg border px-2">{mergeable.map(fileRow)}</ul>
              {others.length > 0 && (
                <>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
                    <FileWarning className="h-4 w-4" /> PDF로 합칠 수 없는 파일 ({others.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">한글·워드 파일은 합본에 넣을 수 없어 [미리보기]로 따로 봅니다.</p>
                  <ul className="flex flex-col divide-y rounded-lg border border-amber-300 px-2 dark:border-amber-800">{others.map(fileRow)}</ul>
                </>
              )}
              {canEdit &&
                (adding ? (
                  <div className="flex flex-col gap-2 rounded-lg border p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">파일 추가</p>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAdding(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <PaymentUploader mentorId={mentorId} existing={files.length} onDone={() => setAdding(false)} />
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="gap-1" onClick={() => setAdding(true)} disabled={files.length >= MENTOR_PAYMENT_MAX_FILES}>
                    <Plus className="h-4 w-4" /> 파일 추가
                  </Button>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface MentorPaymentRowView {
  mentorId: string;
  name: string;
  /** 현재 라운드 활성 배정 멘티 수 */
  assignedCount: number;
  organization: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  files: MentorPaymentFileItem[];
}

/**
 * 파일 관리 › 멘토 지급서류 (2026-09-30) — 라운드 멘토 표 + 멘토별 [업로드]/[첨부 파일(N개)].
 */
export function MentorPaymentManager({ rows, canEdit, canView }: { rows: MentorPaymentRowView[]; canEdit: boolean; canView: boolean }) {
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const filtered = useMemo(() => {
    const k = q.trim().replace(/\s+/g, '').toLowerCase();
    return rows.filter((r) => (!onlyMissing || r.files.length === 0) && (!k || [r.name, r.organization ?? '', r.email ?? '', (r.phone ?? '').replace(/\D/g, '')].some((v) => v.replace(/\s+/g, '').toLowerCase().includes(k))));
  }, [rows, q, onlyMissing]);
  const registered = rows.filter((r) => r.files.length > 0).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          멘토 {rows.length}명 · 서류 등록 <span className="text-primary">{registered}</span>명
          {rows.length - registered > 0 && <span className="text-status-rejected"> · 미등록 {rows.length - registered}명</span>}
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4" /> 미등록만
          </label>
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="멘토 이름·소속·연락처 검색" className="pl-8" aria-label="검색" />
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">이 라운드에서 활동할 수 있는 멘토가 없습니다.</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-background md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">멘토명</th>
                  <th className="px-3 py-2.5 text-right font-medium">배정 멘티</th>
                  <th className="px-3 py-2.5 font-medium">소속</th>
                  <th className="px-3 py-2.5 font-medium">직위</th>
                  <th className="px-3 py-2.5 font-medium">연락처</th>
                  <th className="px-3 py-2.5 font-medium">이메일</th>
                  <th className="px-3 py-2.5 font-medium">지급증빙 서류</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.mentorId} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{r.name}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn('inline-flex min-w-8 items-center justify-center rounded-full px-2 py-0.5 font-semibold tabular-nums', r.assignedCount > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{r.assignedCount}명</span>
                    </td>
                    <td className="px-3 py-2.5">{r.organization ?? '-'}</td>
                    <td className="px-3 py-2.5">{r.position ?? '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {r.phone ?? '-'}
                        <ContactLinks phone={r.phone} name={r.name} size="xs" />
                      </span>
                    </td>
                    <td className="break-all px-3 py-2.5 text-muted-foreground">{r.email ?? '-'}</td>
                    <td className="px-3 py-2.5">
                      <MentorPaymentFilesButton mentorId={r.mentorId} mentorName={r.name} files={r.files} canEdit={canEdit} canView={canView} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((r) => (
              <li key={r.mentorId} className="flex flex-col gap-2 rounded-xl border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {r.name} <span className="text-xs font-normal text-muted-foreground">· 배정 멘티 {r.assignedCount}명</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{[r.organization, r.position].filter(Boolean).join(' · ') || '-'}</p>
                    <p className="break-all text-xs text-muted-foreground">{[r.phone, r.email].filter(Boolean).join(' · ') || '-'}</p>
                  </div>
                  <ContactLinks phone={r.phone} name={r.name} size="xs" />
                </div>
                <MentorPaymentFilesButton mentorId={r.mentorId} mentorName={r.name} files={r.files} canEdit={canEdit} canView={canView} />
              </li>
            ))}
          </ul>
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground">조건에 맞는 멘토가 없습니다.</p>}
        </>
      )}
    </section>
  );
}
