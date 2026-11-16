'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Laptop, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { formatDateTime } from '@/lib/utils/format';
import { MAX_CONVERTER_TIMES } from '@/lib/converter/schedule-rule';
import { registerConverterAction, requestConverterRunAction, retryConversionAction, revokeConverterAction, saveConverterScheduleAction } from '@/lib/converter/actions';

const AGENT_FILES = ['install.cmd', 'install.ps1', 'converter.ps1', 'run-now.cmd', 'uninstall.cmd', 'uninstall.ps1', 'README.txt'];

export interface HwpConverterPanelProps {
  schedule: { enabled: boolean; times: string[] };
  lastRunAt: string | null;
  requestedAt: string | null;
  nextRunAt: string | null;
  converters: { id: string; name: string; createdAt: string; lastSeenAt: string | null; lastRunAt: string | null; lastResult: { converted?: number; failed?: number } | null; revokedAt: string | null; agentVersion: string | null }[];
  counts: { total: number; done: number; pending: number; failed: number };
  failures: { docId: string; caseId: string; name: string; error: string | null; attempts: number }[];
  pendingSamples: { docId: string; caseId: string; name: string }[];
  canEdit: boolean;
}

/** 설치 ZIP 만들기 — 사이트의 /converter/* 파일 + 이 PC 전용 config.json(주소·연결 키). 키는 서버에 남지 않는다 */
async function buildAgentZip(token: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const folder = zip.folder('modu-hwp-converter')!;
  for (const f of AGENT_FILES) {
    const res = await fetch(`/converter/${f}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${f} 를 받지 못했습니다.`);
    folder.file(f, await res.arrayBuffer());
  }
  folder.file('config.json', JSON.stringify({ baseUrl: window.location.origin, token }, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * 운영 설정 > [한글 PDF 변환] (2026-11-16) — 정품 한글이 설치된 운영사 PC 가 정해진 시각에 한글 보고서를 PDF 로 바꿔 올린다.
 * 점검 시각·사용 여부 / 변환 PC 등록(연결 키 1회 표시 + 설치 ZIP) · 해제 / 현황(대기·완료·실패) · 지금 변환 요청 · 실패 다시 시도.
 */
export function HwpConverterPanel(p: HwpConverterPanelProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const [enabled, setEnabled] = useState(p.schedule.enabled);
  const [times, setTimes] = useState<string[]>(p.schedule.times);
  const [pcName, setPcName] = useState('');
  const [issued, setIssued] = useState<{ token: string; name: string } | null>(null);
  const [zipping, setZipping] = useState(false);

  const done = (r: { ok: true; message?: string } | { ok: false; error: string }) => {
    toast(r.ok ? { title: r.message ?? '저장했습니다.' } : { title: r.error, variant: 'destructive' });
    if (r.ok) router.refresh();
  };

  const activePcs = p.converters.filter((c) => !c.revokedAt);
  const pct = p.counts.total ? Math.round((p.counts.done / p.counts.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      {dialog}
      <section className="rounded-xl border border-sky-300 bg-sky-50/60 p-4 text-sm dark:border-sky-800 dark:bg-sky-950/30">
        <h3 className="text-base font-bold">한글(HWP·HWPX) 보고서 → 정품 한글 PDF 자동 변환</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          정품 한글이 설치된 운영사 Windows PC 에 변환 프로그램을 한 번 설치해 두면, 아래 점검 시각마다 아직 PDF 가 없는 한글 회차 보고서·관찰의견서를 한글로 열어 &lsquo;PDF로 저장&rsquo;한 뒤 플랫폼에 자동으로 올립니다.
          한글 원본은 그대로 두고, 합본 PDF·제출용 묶음은 이 PDF 를 씁니다(브라우저 자동 변환보다 원본과 똑같습니다). PC 가 켜져 있고 Windows 에 로그인돼 있어야 하며, 꺼져 있던 동안 놓친 시각은 켤 때 1회 실행합니다.
        </p>
      </section>

      {/* 현황 */}
      <section className="grid gap-2 sm:grid-cols-4">
        {[
          { label: '한글 보고서', value: p.counts.total, tone: '' },
          { label: 'PDF 변환 완료', value: p.counts.done, tone: 'text-emerald-700' },
          { label: '변환 대기', value: p.counts.pending, tone: 'text-sky-700' },
          { label: '변환 실패(멈춤)', value: p.counts.failed, tone: p.counts.failed ? 'text-destructive' : '' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border-2 bg-background p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </section>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`변환율 ${pct}%`}>
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>

      {/* 점검 시각 */}
      <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">자동 실행 시각 (한국 시간)</h3>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={enabled} disabled={!p.canEdit} onChange={(e) => setEnabled(e.target.checked)} />
            자동 변환 사용
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {times.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">
              <Input type="time" step={600} value={t} disabled={!p.canEdit} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} className="h-8 w-28" aria-label={`점검 시각 ${i + 1}`} />
              {p.canEdit && times.length > 1 && (
                <button type="button" className="text-muted-foreground hover:text-destructive" aria-label="시각 삭제" onClick={() => setTimes(times.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </span>
          ))}
          {p.canEdit && times.length < MAX_CONVERTER_TIMES && (
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setTimes([...times, '15:00'])}>
              <Plus className="h-4 w-4" /> 시각 추가
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          변환 PC 는 이 시각에만 파일을 확인합니다(그 사이에는 최대 1시간마다 이 설정만 다시 읽어 바뀐 시각을 반영). 마지막 실행 {p.lastRunAt ? formatDateTime(p.lastRunAt) : '없음'}
          {p.nextRunAt ? ` · 다음 실행 ${formatDateTime(p.nextRunAt)}` : ''}
        </p>
        {p.canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => start(async () => done(await saveConverterScheduleAction({ enabled, times })))}>
              시각 저장
            </Button>
            <Button size="sm" variant="outline" className="gap-1" disabled={pending || activePcs.length === 0} onClick={() => start(async () => done(await requestConverterRunAction()))}>
              <Play className="h-4 w-4" /> 지금 변환 요청
            </Button>
          </div>
        )}
      </section>

      {/* 변환 PC */}
      <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
        <h3 className="text-base font-semibold">변환 PC</h3>
        {p.converters.length === 0 && <p className="text-sm text-muted-foreground">등록된 변환 PC 가 없습니다. 정품 한글이 설치된 Windows PC 에서 아래 [변환 PC 등록]을 눌러 설치 파일을 받으세요.</p>}
        {p.converters.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">마지막 접속</th>
                  <th className="hidden px-3 py-2 md:table-cell">마지막 실행 · 결과</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {p.converters.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium"><Laptop className="mr-1 inline h-4 w-4 text-muted-foreground" />{c.name}</td>
                    <td className="px-3 py-2 text-xs">{c.lastSeenAt ? formatDateTime(c.lastSeenAt) : '아직 접속 안 함'}</td>
                    <td className="hidden px-3 py-2 text-xs md:table-cell">
                      {c.lastRunAt ? formatDateTime(c.lastRunAt) : '-'}
                      {c.lastResult && ` · 변환 ${c.lastResult.converted ?? 0} · 실패 ${c.lastResult.failed ?? 0}`}
                    </td>
                    <td className="px-3 py-2 text-xs">{c.revokedAt ? <span className="text-muted-foreground">해제됨</span> : <span className="text-emerald-700">연결됨</span>}</td>
                    <td className="px-3 py-2 text-right">
                      {!c.revokedAt && p.canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-destructive"
                          disabled={pending}
                          onClick={() =>
                            void (async () => {
                              const ok = await confirm({ title: `${c.name} 연결 해제`, description: '이 PC 의 변환 프로그램이 더 이상 플랫폼에 접속하지 못합니다. PC 에서는 uninstall.cmd 로 프로그램을 지워 주세요.', confirmLabel: '연결 해제', severity: 'danger' });
                              if (ok) start(async () => done(await revokeConverterAction(c.id)));
                            })()
                          }
                        >
                          <Trash2 className="h-4 w-4" /> 연결 해제
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {p.canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={pcName} onChange={(e) => setPcName(e.target.value)} placeholder="PC 이름 (예: 운영팀 데스크톱)" className="h-9 max-w-xs" />
            <Button
              size="sm"
              className="gap-1"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await registerConverterAction(pcName);
                  if (!r.ok) return void toast({ title: r.error, variant: 'destructive' });
                  setIssued({ token: r.token, name: pcName.trim() || '운영사 PC' });
                  setPcName('');
                  router.refresh();
                })
              }
            >
              <Plus className="h-4 w-4" /> 변환 PC 등록
            </Button>
          </div>
        )}
        {issued && (
          <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p className="font-semibold">{issued.name} 등록 완료 — 설치 파일을 지금 받으세요 (연결 키는 이 화면에서 한 번만 보입니다)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
              <li>아래 [설치 파일 받기]로 ZIP 을 받아 <b>정품 한글이 설치된 그 Windows PC</b> 에서 압축을 풉니다.</li>
              <li><b>install.cmd</b> 를 더블클릭합니다(관리자 권한 필요 없음). 한글 확인 → 자동 시작 등록 → 바로 실행됩니다.</li>
              <li>처음 변환 때 한글이 &lsquo;파일 접근 허용&rsquo; 창을 띄우면 [모두 허용]을 누릅니다.</li>
              <li>바로 확인하려면 설치 폴더(%LOCALAPPDATA%\ModuHwpConverter)의 <b>run-now.cmd</b> 를 실행하세요. 이 화면의 &lsquo;마지막 접속&rsquo;이 바뀌면 연결된 것입니다.</li>
            </ol>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="gap-1"
                disabled={zipping}
                onClick={() =>
                  void (async () => {
                    setZipping(true);
                    try {
                      saveBlob(await buildAgentZip(issued.token), 'modu-hwp-converter.zip');
                    } catch (e) {
                      toast({ title: e instanceof Error ? e.message : '설치 파일을 만들지 못했습니다.', variant: 'destructive' });
                    } finally {
                      setZipping(false);
                    }
                  })()
                }
              >
                <Download className="h-4 w-4" /> {zipping ? '만드는 중…' : '설치 파일 받기 (ZIP)'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>닫기</Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">ZIP 안의 config.json 에 이 PC 전용 연결 키가 들어 있습니다. 다른 사람에게 보내지 마세요. 잃어버리면 이 PC 를 [연결 해제]하고 새로 등록하세요.</p>
          </div>
        )}
      </section>

      {/* 실패·대기 목록 */}
      {p.failures.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-background p-4">
          <h3 className="text-base font-semibold text-destructive">변환 실패 — 자동 재시도 멈춤 ({p.failures.length})</h3>
          <p className="text-xs text-muted-foreground">3번 연속 실패한 파일입니다. 암호·배포용 문서이거나 파일이 손상됐을 수 있습니다. 멘토에게 PDF 로 다시 올려 달라고 하거나, 원인을 해결한 뒤 [다시 시도]를 누르세요.</p>
          <ul className="flex flex-col divide-y text-sm">
            {p.failures.map((f) => (
              <li key={f.docId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  <a href={`/nextlab/cases/${f.caseId}#rounds`} className="font-medium hover:underline">{f.name}</a>
                  <span className="ml-2 text-xs text-muted-foreground">{f.error ?? ''}</span>
                </span>
                {p.canEdit && (
                  <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={pending} onClick={() => start(async () => done(await retryConversionAction(f.docId)))}>
                    <RotateCcw className="h-3.5 w-3.5" /> 다시 시도
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {p.pendingSamples.length > 0 && (
        <details className="rounded-xl border bg-background p-4 text-sm">
          <summary className="cursor-pointer font-semibold">변환 대기 파일 {p.counts.pending}건{p.counts.pending > p.pendingSamples.length ? ` (앞 ${p.pendingSamples.length}건 표시)` : ''}</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
            {p.pendingSamples.map((s) => (
              <li key={s.docId}><a href={`/nextlab/cases/${s.caseId}#rounds`} className="hover:underline">{s.name}</a></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
