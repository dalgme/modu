'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * 공용 확인 다이얼로그 — `window.confirm` 대체.
 *  - severity 'normal'  : 일반 확인
 *  - severity 'danger'  : 되돌릴 수 없는 작업(빨간 버튼)
 *  - severity 'typed'   : `typedWord` 를 그대로 입력해야 확인 버튼이 열린다(삭제 등)
 * `impact` 는 "이 작업으로 무엇이 바뀌는지"를 항목으로 보여준다. `children` 으로 미리보기 등을 덧붙일 수 있다.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  impact?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: 'normal' | 'danger' | 'typed';
  typedWord?: string;
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
  children?: ReactNode;
  className?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  impact,
  confirmLabel = '확인',
  cancelLabel = '취소',
  severity = 'normal',
  typedWord = '확인',
  onConfirm,
  pending = false,
  children,
  className,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const typedOk = severity !== 'typed' || typed.trim() === typedWord;
  const danger = severity === 'danger' || severity === 'typed';

  const handleOpenChange = (o: boolean) => {
    if (pending && !o) return;
    if (!o) setTyped('');
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn('max-w-md', className)} onOpenAutoFocus={(e) => { if (severity === 'typed') e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {danger ? <ShieldAlert className="h-5 w-5 text-status-rejected" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription className="whitespace-pre-line text-left">{description}</DialogDescription>}
        </DialogHeader>
        {impact && impact.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            {impact.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
        {children}
        {severity === 'typed' && (
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="confirm-typed" className="text-xs text-muted-foreground">
              계속하려면 <b className="text-foreground">{typedWord}</b> 을(를) 입력하세요.
            </label>
            <Input id="confirm-typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={typedWord} autoComplete="off" disabled={pending} />
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            disabled={pending || !typedOk}
            onClick={() => {
              void onConfirm();
            }}
          >
            {pending ? '처리 중…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm' | 'pending'>;

/**
 * 명령형 확인 훅 — `const ok = await confirm({ title: '…' })`.
 * 반환된 `dialog` 를 컴포넌트 트리 어딘가에 한 번 렌더링한다.
 */
export function useConfirm(): { confirm: (opts: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setOpts(o);
    });
  }, []);

  const settle = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = opts ? (
    <ConfirmDialog
      {...opts}
      open
      onOpenChange={(o) => {
        if (!o) settle(false);
      }}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return { confirm, dialog };
}
