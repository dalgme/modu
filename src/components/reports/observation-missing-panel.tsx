'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Loader2, MessageSquareText, Search } from 'lucide-react';

import {
  DEFAULT_OBS_REQUEST_TEMPLATE,
  OBS_REQUEST_FIELDS,
  validateObservationRequest,
  type ObsMissingData,
  type ObsMissingRow,
} from '@/lib/reports/observation-missing-shared';
import { previewObservationRequestAction, sendObservationRequestAction, type ObsRequestPreview } from '@/lib/reports/observation-request-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * 관찰의견서 미제출 확인 · 요청 문자 (2026-11-22) — 리포트 › 보고서 파일 › 관찰의견서 카드의 오른쪽 탭.
 * 멘토별로 미제출 멘티를 모아 보여 주고, 명단을 엑셀로 받거나 선택한 멘토에게 요청 문자를 보낸다(운영사 문자 권한자).
 */
const TEMPLATE_KEY = 'modu.obsRequestTemplate';

interface MentorGroup {
  mentorId: string;
  name: string;
  phone: string | null;
  rows: ObsMissingRow[];
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function ObservationMissingPanel({ data, canSms, groupId, caseHrefBase }: { data: ObsMissingData; canSms: boolean; groupId: string | null; caseHrefBase: string }) {
  const { toast } = useToast();
  const [includeMarked, setIncludeMarked] = useState(false);
  const [q, setQ] = useState('');
  const [round, setRound] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_OBS_REQUEST_TEMPLATE);
  const [preview, setPreview] = useState<ObsRequestPreview[] | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  const requiredGroups = data.groups.filter((g) => g.required);
  const markedCount = data.rows.filter((r) => r.outcomeLabel).length;
  const rows = useMemo(() => {
    const s = q.trim();
    return data.rows.filter(
      (r) => (includeMarked || !r.outcomeLabel) && (round === 'all' || r.groupId === round) && (!s || r.menteeName.includes(s) || (r.mentorName ?? '').includes(s)),
    );
  }, [data.rows, includeMarked, q, round]);
  const mentors = useMemo(() => {
    const m = new Map<string, MentorGroup>();
    for (const r of rows) {
      if (!r.mentorId) continue;
      const g = m.get(r.mentorId) ?? m.set(r.mentorId, { mentorId: r.mentorId, name: r.mentorName ?? '(이름 없음)', phone: r.mentorPhone, rows: [] }).get(r.mentorId)!;
      g.rows.push(r);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [rows]);
  const noMentor = rows.filter((r) => !r.mentorId);
  const sendable = mentors.filter((m) => (m.phone ?? '').replace(/\D/g, '').length >= 10);
  const selectedIds = Array.from(selected).filter((id) => mentors.some((m) => m.mentorId === id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOn = sendable.length > 0 && sendable.every((m) => selected.has(m.mentorId));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(sendable.map((m) => m.mentorId)));

  const downloadExcel = async () => {
    const XLSX = await import('xlsx');
    const header = ['연번', '라운드', '멘티', '담당 멘토', '멘토 연락처', '단계', '보고서 등록', '구분', '최근 요청 문자'];
    const body = rows.map((r, i) => [
      i + 1,
      r.groupName,
      r.menteeName,
      r.mentorName ?? '담당 멘토 없음',
      r.mentorPhone ?? '',
      r.statusLabel,
      `${r.reportsDone}/${r.requiredRounds}회`,
      r.outcomeLabel ?? '',
      r.mentorId && data.lastRequested[r.mentorId] ? fmtDay(data.lastRequested[r.mentorId]!) : '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = [6, 18, 14, 12, 15, 12, 11, 10, 16].map((w) => ({ wch: w }));
    ws['!autofilter'] = { ref: `A1:I${body.length + 1}` };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '관찰의견서 미제출');
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    XLSX.writeFile(wb, `관찰의견서 미제출 명단_${day}.xlsx`);
  };

  const openDialog = () => {
    try {
      const saved = window.localStorage.getItem(TEMPLATE_KEY);
      if (saved && !validateObservationRequest(saved)) setTemplate(saved);
    } catch {
      /* 저장소 없음 */
    }
    setPreview(null);
    setLastBatch(null);
    setOpen(true);
  };

  const insertField = (key: string) => {
    const el = ta.current;
    if (!el) return setTemplate((t) => t + key);
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    setTemplate(template.slice(0, start) + key + template.slice(end));
    setPreview(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + key.length, start + key.length);
    });
  };

  const input = () => ({ groupId, mentorIds: selectedIds, template, includeMarked });
  const runPreview = async () => {
    const err = validateObservationRequest(template);
    if (err) return toast({ title: err, variant: 'destructive' });
    setBusy('preview');
    try {
      const r = await previewObservationRequestAction(input());
      if (!r.ok) toast({ title: r.error, variant: 'destructive' });
      else setPreview(r.mentors);
    } finally {
      setBusy(null);
    }
  };
  const runSend = async () => {
    setBusy('send');
    try {
      const r = await sendObservationRequestAction(input());
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      try {
        window.localStorage.setItem(TEMPLATE_KEY, template);
      } catch {
        /* 저장소 없음 */
      }
      setLastBatch(r.batchId);
      setSelected(new Set());
      toast({ title: `요청 문자 ${r.sent}명 접수${r.rejected ? ` · 접수 실패 ${r.rejected}명` : ''}${r.skipped ? ` · 번호 없음 ${r.skipped}명` : ''}. 수신 결과는 문자 발송 › 발송 현황에서 확인하세요.` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {requiredGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">이 범위에는 관찰의견서를 내는 라운드가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1.5">라운드(사업그룹)</th><th>대상 멘티</th><th>제출</th><th>미제출</th></tr>
            </thead>
            <tbody>
              {requiredGroups.map((g) => (
                <tr key={g.groupId} className="border-t">
                  <td className="py-1.5 font-medium">{g.groupName}</td>
                  <td className="tabular-nums">{g.target}명</td>
                  <td className="tabular-nums text-emerald-700 dark:text-emerald-400">{g.submitted}명</td>
                  <td className={`tabular-nums font-semibold ${g.missing > 0 ? 'text-red-600' : ''}`}>{g.missing}명</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted-foreground">대상 = 관찰의견서를 내는 라운드에서 회차를 1회 이상 진행했거나 진행 중인 멘티(중도 종결 승인 멘티는 면제). 미제출 = 검수 승인 전인데 관찰의견서 파일이 없는 멘티.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="멘토·멘티 이름" className="h-9 w-44 pl-7" />
        </div>
        {requiredGroups.length > 1 && (
          <select value={round} onChange={(e) => setRound(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="all">라운드 전체</option>
            {requiredGroups.map((g) => (
              <option key={g.groupId} value={g.groupId}>{g.groupName}</option>
            ))}
          </select>
        )}
        {markedCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={includeMarked} onChange={(e) => setIncludeMarked(e.target.checked)} />
            중도 포기·중도 종료 표시 멘티도 포함 ({markedCount}명)
          </label>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={downloadExcel} disabled={rows.length === 0} className="gap-1 border-lime-500 bg-lime-400 font-bold text-lime-950 hover:bg-lime-500">
            <Download className="h-4 w-4" /> 미제출 명단 엑셀
          </Button>
          {canSms && (
            <Button type="button" size="sm" onClick={openDialog} disabled={selectedIds.length === 0} className="gap-1">
              <MessageSquareText className="h-4 w-4" /> 선택 멘토에게 요청 문자 ({selectedIds.length}명)
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm">
        미제출 <b className="text-red-600">{rows.length}명</b> · 담당 멘토 <b>{mentors.length}명</b>
        {noMentor.length > 0 ? ` · 담당 멘토 없음 ${noMentor.length}명` : ''}
      </p>

      {mentors.length === 0 ? (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">미제출 멘티가 없습니다.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
              <tr className="border-b">
                {canSms && (
                  <th className="w-8 py-2 pl-2">
                    <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="문자 가능한 멘토 전체 선택" />
                  </th>
                )}
                <th className="py-2 pl-2">멘토</th>
                <th>미제출 멘티</th>
                <th className="pr-2 text-right">최근 요청 문자</th>
              </tr>
            </thead>
            <tbody>
              {mentors.map((m) => {
                const hasPhone = (m.phone ?? '').replace(/\D/g, '').length >= 10;
                const last = data.lastRequested[m.mentorId];
                return (
                  <tr key={m.mentorId} className="border-t align-top">
                    {canSms && (
                      <td className="py-2 pl-2">
                        <input type="checkbox" checked={selected.has(m.mentorId)} disabled={!hasPhone} onChange={() => toggle(m.mentorId)} aria-label={`${m.name} 선택`} />
                      </td>
                    )}
                    <td className="py-2 pl-2">
                      <p className="font-medium">{m.name} <span className="text-xs font-semibold text-red-600">({m.rows.length}명)</span></p>
                      <p className="text-[11px] text-muted-foreground">{hasPhone ? m.phone : '휴대폰 번호 없음 — 문자 불가'}</p>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {m.rows.map((r) => (
                          <Link key={r.caseId} href={`${caseHrefBase}/${r.caseId}`} className="rounded-md border px-1.5 py-0.5 text-xs hover:bg-accent" title={`${r.groupName} · ${r.statusLabel} · 보고서 ${r.reportsDone}/${r.requiredRounds}회`}>
                            {r.menteeName}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {requiredGroups.length > 1 ? `${r.groupName} · ` : ''}보고서 {r.reportsDone}/{r.requiredRounds}
                            </span>
                            {r.outcomeLabel && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900">{r.outcomeLabel}</span>}
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right text-xs text-muted-foreground">{last ? fmtDay(last) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {noMentor.length > 0 && (
        <p className="text-xs text-muted-foreground">
          담당 멘토 없음(재배정 대기 등): {noMentor.map((r) => `${r.menteeName}(${r.groupName})`).join(', ')} — 멘토를 배정한 뒤 요청할 수 있습니다.
        </p>
      )}

      <Dialog open={open} onOpenChange={(o) => busy === null && setOpen(o)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>관찰의견서 제출 요청 문자 — 멘토 {selectedIds.length}명</DialogTitle>
            <DialogDescription>멘토 1명당 문자 1건으로, 그 멘토의 미제출 멘티만 {'{mentees}'} 에 들어갑니다. [미리보기]로 실제 문자를 확인한 뒤 보내세요.</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-3 overflow-auto">
            <div className="flex flex-wrap gap-1">
              {OBS_REQUEST_FIELDS.map((f) => (
                <button key={f.key} type="button" onClick={() => insertField(f.key)} className="rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-accent" title={`예: ${f.example}`}>
                  {f.label} : <code>{f.key}</code>
                </button>
              ))}
              <button type="button" onClick={() => { setTemplate(DEFAULT_OBS_REQUEST_TEMPLATE); setPreview(null); }} className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                기본 문구로
              </button>
            </div>
            <Textarea ref={ta} value={template} onChange={(e) => { setTemplate(e.target.value); setPreview(null); }} rows={6} className="font-mono text-sm" />
            <p className="text-[11px] text-muted-foreground">기한 날짜(예: “11월 24일(월) 오전까지”)는 문구에 직접 적어 주세요. 고친 문구는 이 브라우저에 기억됩니다.</p>
            {preview && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">미리보기 — {preview.length}명{preview.some((p) => !p.phoneMasked) ? ` (번호 없음 ${preview.filter((p) => !p.phoneMasked).length}명은 보내지 않음)` : ''}</p>
                {preview.map((p) => (
                  <div key={p.mentorId} className="rounded-md border p-2">
                    <p className="text-xs font-semibold">{p.name} · {p.phoneMasked ?? '번호 없음'} · 미제출 {p.mentees.length}명</p>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">{p.text}</pre>
                  </div>
                ))}
              </div>
            )}
            {lastBatch && (
              <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                보냈습니다. <Link href={`/admin/settings/sms?tab=history&batch=${lastBatch}`} className="font-semibold underline">발송 현황에서 수신 결과 보기</Link>
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy !== null}>닫기</Button>
            <Button type="button" variant="outline" onClick={runPreview} disabled={busy !== null || selectedIds.length === 0} className="gap-1">
              {busy === 'preview' && <Loader2 className="h-4 w-4 animate-spin" />} 미리보기
            </Button>
            <Button type="button" onClick={runSend} disabled={busy !== null || !preview || !!lastBatch} className="gap-1" title={!preview ? '먼저 미리보기를 확인하세요' : undefined}>
              {busy === 'send' && <Loader2 className="h-4 w-4 animate-spin" />} {preview ? `${preview.filter((p) => p.phoneMasked).length}명에게 보내기` : '보내기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
