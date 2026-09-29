'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { ArrowUpRight, BellOff, BellRing, ChevronDown, Eye, Hand, Lock, ShieldCheck } from 'lucide-react';

import { AUTO_SEND_STAGES } from '@/lib/notifications/templates';
import { updateNotificationSettingsAction } from '@/lib/settings/notification-actions';
import type { AutoSendChannel, AutoSendRow } from '@/components/admin/auto-send-catalog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { cn } from '@/lib/utils';

/**
 * (P36) 문자 발송 › 자동발송 탭 — 플랫폼이 업무 단계마다 자동으로 보내는 문자를 한곳에서 보고 켜고 끈다.
 * 운영 설정 [알림] 탭(P32)을 이리로 옮겼다. 저장은 `updateNotificationSettingsAction` 하나('settings' 권한).
 * `settings` = programs.notification_settings ({ key: false } 만 저장됨). 키 없음 = 켬(기본).
 */
export function AutoSendSettings({
  rows,
  settings,
  canEdit,
  channelLabels,
  scopeNote,
  readOnlyReason,
}: {
  rows: AutoSendRow[];
  settings: Record<string, boolean>;
  canEdit: boolean;
  /** 채널 표기 — 서버가 알림톡 연동 여부를 반영해 넘긴다 */
  channelLabels: Record<AutoSendChannel, string>;
  /** 범위 스위처가 그룹일 때 안내 */
  scopeNote: string | null;
  /** 편집 불가 사유 (열람 전용일 때) */
  readOnlyReason: string | null;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const toggles = useMemo(() => rows.flatMap((r) => (r.control.kind === 'toggle' ? [{ key: r.control.key, lockable: !!r.control.lockable }] : [])), [rows]);
  const initial = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const t of toggles) m[t.key] = t.lockable ? true : settings[t.key] !== false;
    return m;
  }, [settings, toggles]);
  const [state, setState] = useState<Record<string, boolean>>(initial);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [offOnly, setOffOnly] = useState(false);
  const dirty = toggles.some((t) => state[t.key] !== initial[t.key]);
  useUnsavedGuard(dirty);
  const offCount = toggles.filter((t) => !state[t.key]).length;
  const onCount = toggles.length - offCount;

  const toggle = (key: string, on: boolean) => setState((s) => ({ ...s, [key]: on }));
  const setStage = (stage: string, on: boolean) =>
    setState((s) => {
      const n = { ...s };
      for (const r of rows) if (r.stage === stage && r.control.kind === 'toggle' && !r.control.lockable) n[r.control.key] = on;
      return n;
    });

  const save = () =>
    start(async () => {
      const r = await updateNotificationSettingsAction(state);
      toast(r.ok ? { title: '자동발송 설정을 저장했습니다.', description: r.message } : { title: r.error, variant: 'destructive' });
    });

  const editable = canEdit && !pending;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="font-semibold">
          업무 단계마다 플랫폼이 자동으로 보내는 문자입니다. 끄면 그 단계에서 문자·알림톡이 나가지 않고, 화면 안 알림·할 일 카드는 그대로입니다.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          켬 <b className="text-foreground">{onCount}</b> · 끔 <b className="text-foreground">{offCount}</b> (전체 {toggles.length}개 항목). 담당자가 직접 보내는 문자는 &lsquo;수동&rsquo;, 보안·시스템 문자는 &lsquo;항상 발송&rsquo;으로 표시되며 끌 수 없습니다.
        </p>
        {scopeNote && <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">{scopeNote}</p>}
        {readOnlyReason && <p className="mt-2 text-xs font-medium text-muted-foreground">{readOnlyReason}</p>}
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={offOnly} onChange={(e) => setOffOnly(e.target.checked)} />
        꺼진 항목만 보기
      </label>

      {AUTO_SEND_STAGES.map((stage, idx) => {
        const items = rows.filter((r) => r.stage === stage.key && (!offOnly || (r.control.kind === 'toggle' && !state[r.control.key])));
        if (items.length === 0) return null;
        const stageToggles = items.filter((r) => r.control.kind === 'toggle' && !r.control.lockable);
        const stageOn = stageToggles.filter((r) => r.control.kind === 'toggle' && state[r.control.key]).length;
        return (
          <section key={stage.key} className="overflow-hidden rounded-xl border bg-background">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
              <h3 className="text-sm font-semibold">
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-midnight text-[11px] font-bold text-white">{idx + 1}</span>
                {stage.label}
                {stageToggles.length > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({stageOn}/{stageToggles.length} 켬)</span>}
              </h3>
              {canEdit && stageToggles.length > 0 && (
                <div className="flex gap-1">
                  <button type="button" className="rounded-md border px-2 py-0.5 text-[11px] font-semibold hover:bg-accent disabled:opacity-40" disabled={!editable || stageOn === stageToggles.length} onClick={() => setStage(stage.key, true)}>
                    모두 켬
                  </button>
                  <button type="button" className="rounded-md border px-2 py-0.5 text-[11px] font-semibold hover:bg-accent disabled:opacity-40" disabled={!editable || stageOn === 0} onClick={() => setStage(stage.key, false)}>
                    모두 끔
                  </button>
                </div>
              )}
            </header>
            <ul className="divide-y">
              {items.map((r) => {
                const c = r.control;
                const on = c.kind === 'toggle' ? state[c.key] : c.kind !== 'manual';
                const isOpen = !!open[r.id];
                return (
                  <li key={r.id} className={cn('flex flex-col gap-2 px-4 py-3', c.kind === 'toggle' && !on && 'bg-amber-50/40 dark:bg-amber-950/10')}>
                    <div className="flex items-start gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                          {r.label}
                          {c.kind === 'toggle' && c.lockable && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground" title="정산·품의 게이트 알림은 끌 수 없습니다">
                              <Lock className="h-3 w-3" /> 항상 켬
                            </span>
                          )}
                          {c.kind === 'always' && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                              <ShieldCheck className="h-3 w-3" /> 항상 발송
                            </span>
                          )}
                          {c.kind === 'manual' && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              <Hand className="h-3 w-3" /> 수동 (자동 아님)
                            </span>
                          )}
                          {c.kind === 'toggle' && !on && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">끔</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <b className="font-semibold text-foreground/80">발송 시점</b> {r.trigger}
                        </span>
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>
                            <b className="font-semibold">수신</b> {r.recipients}
                          </span>
                          <span>
                            <b className="font-semibold">채널</b> {channelLabels[r.channel]}
                          </span>
                        </span>
                        {c.kind === 'link' && <span className="text-[11px] font-medium text-primary">{c.status}</span>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {c.kind === 'toggle' && (
                          <label className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', editable && !c.lockable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70')}>
                            {on ? <BellRing className="h-4 w-4 text-emerald-600" aria-hidden /> : <BellOff className="h-4 w-4 text-amber-600" aria-hidden />}
                            <input
                              type="checkbox"
                              role="switch"
                              aria-checked={on}
                              aria-label={`${r.label} 자동발송`}
                              className="h-5 w-5 accent-primary"
                              checked={on}
                              disabled={!editable || !!c.lockable}
                              onChange={(e) => toggle(c.key, e.target.checked)}
                            />
                            <span className="w-5">{on ? '켬' : '끔'}</span>
                          </label>
                        )}
                        {(c.kind === 'link' || c.kind === 'manual') && (
                          <Link href={c.href} className="inline-flex items-center gap-0.5 rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-accent">
                            {c.linkLabel} <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        )}
                        {(r.preview || r.previewNote) && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-0.5 rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-accent"
                            aria-expanded={isOpen}
                            onClick={() => setOpen((s) => ({ ...s, [r.id]: !s[r.id] }))}
                          >
                            <Eye className="h-3 w-3" /> 문구 보기 <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
                          </button>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="rounded-lg border bg-muted/30 p-3">
                        {r.preview ? <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">{r.preview}</pre> : null}
                        {r.previewNote && <p className={cn('text-[11px] text-muted-foreground', r.preview && 'mt-2')}>{r.previewNote}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {canEdit && (
        <div className="sticky bottom-0 flex items-center justify-between gap-2 rounded-xl border bg-background/95 p-3 backdrop-blur">
          <p className="text-xs text-muted-foreground">{dirty ? '저장하지 않은 변경이 있습니다.' : '변경 사항이 없습니다.'}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!dirty || pending} onClick={() => setState(initial)}>
              되돌리기
            </Button>
            <Button type="button" size="sm" disabled={!dirty || pending} onClick={save}>
              {pending ? '저장 중…' : '저장'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
