'use client';

import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SignaturePadProps {
  label: string;
  /** 서명 확정 시 PNG data URL 전달, 지우면 null */
  onChange: (dataUrl: string | null) => void;
  /**
   * 지정 시 '저장된 서명 불러오기' 버튼 노출.
   * DB에 저장된 케이스 서명을 data:URI 로 반환(없으면 null). ※ 브라우저 저장이 아니라 서버 조회.
   */
  loadSaved?: () => Promise<string | null>;
}

type Mode = 'draw' | 'upload';

/**
 * 서명 캡처 컴포넌트.
 *  - 직접 서명(react-signature-canvas · 터치 지원) 또는 파일 업로드 중 선택
 *  - 서명은 항상 그 자리에서 새로 받는다(브라우저 저장·재사용 없음).
 *    ※ 예전 버전은 서명을 localStorage 에 저장해 '불러오기'로 재사용했으나, 같은 브라우저에서
 *      다른 케이스·다른 사용자의 서명(테스트 서명 포함)이 잘못 불려오는 문제가 있어 제거했다.
 */
export function SignaturePad({ label, onChange, loadSaved }: SignaturePadProps) {
  const ref = useRef<SignatureCanvas>(null);
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('draw');
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 과거 버전이 남긴 저장 서명(sig:*) 정리 — 잘못 불려오는 서명 잔재 제거
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stale: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sig:')) stale.push(k);
      }
      stale.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* 접근 불가 무시 */
    }
  }, []);

  function apply(dataUrl: string | null) {
    setValue(dataUrl);
    onChange(dataUrl);
  }

  function handleEnd() {
    const pad = ref.current;
    if (!pad || pad.isEmpty()) return;
    let dataUrl: string;
    try {
      const canvas =
        typeof pad.getTrimmedCanvas === 'function' ? pad.getTrimmedCanvas() : pad.getCanvas();
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      dataUrl = pad.getCanvas().toDataURL('image/png');
    }
    apply(dataUrl);
  }

  function handleClear() {
    ref.current?.clear();
    apply(null);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => apply(String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function onLoadSaved() {
    if (!loadSaved) return;
    setLoading(true);
    let dataUrl: string | null = null;
    try {
      dataUrl = await loadSaved();
    } catch {
      dataUrl = null;
    }
    setLoading(false);
    if (dataUrl) {
      setMode('upload');
      apply(dataUrl);
      toast({ title: '저장된 서명을 불러왔습니다.' });
    } else {
      toast({
        title: '저장된 서명이 없습니다.',
        description: '직접 서명하거나 서명 이미지를 올려 주세요.',
        variant: 'destructive',
      });
    }
  }

  const tabCls = (active: boolean) =>
    cn(
      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
      active
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted text-muted-foreground hover:bg-accent',
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {value && <span className="text-xs font-medium text-status-approved">서명 완료</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => setMode('draw')} className={tabCls(mode === 'draw')}>
          직접 서명
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={tabCls(mode === 'upload')}
        >
          파일 업로드
        </button>
        {loadSaved && (
          <button
            type="button"
            onClick={onLoadSaved}
            disabled={loading}
            className="ml-auto rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
          >
            {loading ? '불러오는 중…' : '저장된 서명 불러오기'}
          </button>
        )}
      </div>

      {value && mode === 'upload' ? (
        <div className="flex items-center justify-center rounded-md border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="서명 미리보기" className="h-24 object-contain" />
        </div>
      ) : mode === 'draw' ? (
        <div className="overflow-hidden rounded-md border bg-white">
          <SignatureCanvas
            ref={ref}
            penColor="#111827"
            onEnd={handleEnd}
            canvasProps={{ className: 'h-40 w-full touch-none' }}
          />
        </div>
      ) : (
        <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 text-center text-sm text-muted-foreground hover:bg-muted/50">
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <span className="font-medium text-foreground">서명 이미지 선택</span>
          <span className="text-xs">PNG · JPG (스캔·촬영 파일 가능)</span>
        </label>
      )}

      {value && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          className="self-start"
        >
          다시 서명
        </Button>
      )}
    </div>
  );
}
