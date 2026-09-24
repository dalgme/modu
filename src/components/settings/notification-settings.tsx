'use client';

import { useMemo, useState, useTransition } from 'react';
import { BellOff, BellRing, Lock } from 'lucide-react';

import { NOTIFICATION_EVENT_DEFS, type NotificationEventDef } from '@/lib/notifications/templates';
import { updateNotificationSettingsAction } from '@/lib/settings/notification-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const AUDIENCES: NotificationEventDef['audience'][] = ['멘티', '멘토', '운영사', '발주처'];

/**
 * (P32) 운영 설정 [알림] 탭 — 이벤트별 문자·알림톡 on/off.
 * `settings` = programs.notification_settings ({ event: false } 만 저장됨). 키 없음 = 켬(기본).
 * 잠긴(lockable) 이벤트는 정산·품의 게이트라 항상 켬으로 고정한다.
 */
export function NotificationSettings({ settings }: { settings: Record<string, boolean> }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const initial = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const d of NOTIFICATION_EVENT_DEFS) m[d.key] = d.lockable ? true : settings[d.key] !== false;
    return m;
  }, [settings]);
  const [state, setState] = useState<Record<string, boolean>>(initial);
  const dirty = NOTIFICATION_EVENT_DEFS.some((d) => state[d.key] !== initial[d.key]);
  const offCount = NOTIFICATION_EVENT_DEFS.filter((d) => !state[d.key]).length;

  const toggle = (key: string, on: boolean) => setState((s) => ({ ...s, [key]: on }));
  const setAudience = (audience: NotificationEventDef['audience'], on: boolean) =>
    setState((s) => {
      const n = { ...s };
      for (const d of NOTIFICATION_EVENT_DEFS) if (d.audience === audience && !d.lockable) n[d.key] = on;
      return n;
    });

  const save = () =>
    start(async () => {
      const r = await updateNotificationSettingsAction(state);
      toast(r.ok ? { title: '알림 설정을 저장했습니다.', description: r.message } : { title: r.error, variant: 'destructive' });
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="font-semibold">끄면 그 이벤트의 문자·알림톡이 큐에 들어가지 않습니다. 화면 안 알림 카드는 그대로입니다.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          로그인 안내·리마인더·독려 문자처럼 담당자가 직접 보내는 문자는 이 설정과 무관합니다. 잠금 표시된 정산·품의 게이트 알림은 끌 수 없습니다.
          {offCount > 0 && <> 현재 <b className="text-foreground">{offCount}개</b> 이벤트가 꺼져 있습니다.</>}
        </p>
      </div>

      {AUDIENCES.map((audience) => {
        const items = NOTIFICATION_EVENT_DEFS.filter((d) => d.audience === audience);
        if (items.length === 0) return null;
        const allOn = items.every((d) => state[d.key]);
        return (
          <section key={audience} className="overflow-hidden rounded-xl border bg-background">
            <header className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
              <h3 className="text-sm font-semibold">{audience} 수신 알림 <span className="text-xs font-normal text-muted-foreground">({items.filter((d) => state[d.key]).length}/{items.length} 켬)</span></h3>
              <div className="flex gap-1">
                <button type="button" className="rounded-md border px-2 py-0.5 text-[11px] font-semibold hover:bg-accent disabled:opacity-40" disabled={allOn || pending} onClick={() => setAudience(audience, true)}>
                  모두 켬
                </button>
                <button type="button" className="rounded-md border px-2 py-0.5 text-[11px] font-semibold hover:bg-accent disabled:opacity-40" disabled={pending} onClick={() => setAudience(audience, false)}>
                  모두 끔
                </button>
              </div>
            </header>
            <ul className="divide-y">
              {items.map((d) => {
                const on = state[d.key];
                return (
                  <li key={d.key} className={cn('flex items-start gap-3 px-4 py-2.5', !on && 'bg-amber-50/40 dark:bg-amber-950/10')}>
                    <label className="flex flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-checked={on}
                        className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        checked={on}
                        disabled={!!d.lockable || pending}
                        onChange={(e) => toggle(d.key, e.target.checked)}
                      />
                      <span className="flex flex-col">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                          {d.label}
                          {d.lockable && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground" title="정산·품의 게이트 알림은 끌 수 없습니다">
                              <Lock className="h-3 w-3" /> 항상 켬
                            </span>
                          )}
                          {!on && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">끔</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">{d.desc}</span>
                        <span className="text-[10px] text-muted-foreground/70">{d.key}</span>
                      </span>
                    </label>
                    {on ? <BellRing className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <BellOff className="mt-1 h-4 w-4 shrink-0 text-amber-600" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

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
    </div>
  );
}
