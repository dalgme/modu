'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ExternalLink, Download } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ViewerState {
  url: string;
  title: string;
}

interface FileViewerContextValue {
  /** 파일(서식·이미지·PDF)을 팝업 레이어로 연다. */
  openUrl: (url: string, opts?: { title?: string }) => void;
}

const FileViewerContext = createContext<FileViewerContextValue | null>(null);

export function useFileViewer(): FileViewerContextValue {
  const ctx = useContext(FileViewerContext);
  if (!ctx) throw new Error('useFileViewer 는 FileViewerProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}

function isImageUrl(url: string): boolean {
  const path = (url.split('?')[0] ?? '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(path);
}

/**
 * 서식·그림·첨부파일을 새 탭이 아니라 팝업 레이어(모달)로 띄운다.
 * 이미지: object-contain 으로 표시, 그 외(PDF 등): iframe 인라인 렌더.
 * 상단에 '새 창에서 열기'·'저장' 대체 동선을 제공한다. 앱 최상단에 1개만 마운트한다.
 */
export function FileViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewerState | null>(null);
  const openUrl = useCallback((url: string, opts?: { title?: string }) => {
    setState({ url, title: opts?.title ?? '미리보기' });
  }, []);
  const value = useMemo(() => ({ openUrl }), [openUrl]);

  return (
    <FileViewerContext.Provider value={value}>
      {children}
      <Dialog
        open={!!state}
        onOpenChange={(open) => {
          if (!open) setState(null);
        }}
      >
        {state && (
          <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-0 p-0">
            <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b p-3 pr-12">
              <DialogTitle className="truncate text-base">{state.title}</DialogTitle>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <a href={state.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />새 창
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <a href={state.url} download>
                    <Download className="h-3.5 w-3.5" />저장
                  </a>
                </Button>
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 bg-muted/30">
              {isImageUrl(state.url) ? (
                <div className="flex h-full items-center justify-center overflow-auto p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={state.url}
                    alt={state.title}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <iframe src={state.url} title={state.title} className="h-full w-full border-0" />
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </FileViewerContext.Provider>
  );
}
