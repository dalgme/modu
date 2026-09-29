'use client';

import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** 파일 선택(여러 개) + 드래그앤드롭 영역 — 파일 관리 화면 공용 (2026-09-30) */
export function DropZone({ onFiles, disabled, hint, accept, multiple = true, label = '여러 파일 선택' }: { onFiles: (files: File[]) => void; disabled?: boolean; hint: string; accept?: string; multiple?: boolean; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files ?? []));
      }}
      className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors', over ? 'border-primary bg-primary/5' : 'border-border bg-muted/20', disabled && 'opacity-60')}
    >
      <FileUp className="h-7 w-7 text-muted-foreground" />
      <p className="text-sm font-semibold">파일을 여기로 끌어다 놓거나</p>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {label}
      </Button>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </div>
  );
}

