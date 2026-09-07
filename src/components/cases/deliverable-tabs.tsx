'use client';

import { useState, type ReactNode } from 'react';
import { Paperclip, PenLine } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 제출물(멘토링 보고서·지원신청서 등)의 제출 방식 선택 탭.
 * 기본 = '파일 첨부', 선택 = '웹에서 작성'. 두 슬롯 모두 마운트해 두고 표시만 토글한다.
 */
export function DeliverableTabs({
  attach,
  web,
  attachLabel = '파일 첨부',
  webLabel = '웹에서 작성하기',
  attachHint = '완성본을 올리면 바로 제출됩니다 (기본)',
  webHint = '플랫폼에서 직접 작성',
  defaultMode = 'attach',
}: {
  attach: ReactNode;
  web: ReactNode;
  attachLabel?: string;
  webLabel?: string;
  attachHint?: string;
  webHint?: string;
  defaultMode?: 'attach' | 'web';
}) {
  const [mode, setMode] = useState<'attach' | 'web'>(defaultMode);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            { key: 'attach', label: attachLabel, hint: attachHint, Icon: Paperclip },
            { key: 'web', label: webLabel, hint: webHint, Icon: PenLine },
          ] as const
        ).map(({ key, label, hint, Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              aria-pressed={active}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-muted hover:border-primary/40 hover:bg-muted/40',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className={cn('block text-sm font-semibold', active && 'text-primary')}>
                  {label}
                </span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div hidden={mode !== 'attach'}>{attach}</div>
      <div hidden={mode !== 'web'}>{web}</div>
    </div>
  );
}
