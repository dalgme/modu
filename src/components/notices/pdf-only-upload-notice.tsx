'use client';

import { useState, useTransition } from 'react';
import { FileText } from 'lucide-react';

import { ackNoticeAction } from '@/lib/notices/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * (2026-11-16) 멘토 첫 로그인 안내 — 멘토링 보고서·관찰의견서는 PDF 파일만 업로드.
 * 닫거나 [확인했습니다] 를 누르면 읽음으로 기록하고 다시 띄우지 않는다(대행 중에는 서버가 기록하지 않음).
 */
export function PdfOnlyUploadNotice({ noticeKey }: { noticeKey: string }) {
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  const close = () => {
    setOpen(false);
    start(async () => {
      await ackNoticeAction(noticeKey);
    });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-red-600" /> 보고서 업로드 규칙이 바뀌었습니다
          </DialogTitle>
          <DialogDescription>멘토링 보고서 · 관찰의견서 파일 형식 안내</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-base font-bold text-red-700">
            이제부터 멘토링 보고서와 관찰의견서는 PDF 파일만 업로드할 수 있습니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              한글(HWP·HWPX)·Word 파일은 그대로 올릴 수 없습니다. 작성한 프로그램에서 <b>[파일] → [PDF로 저장]</b>(또는 [다른 이름으로 저장] → PDF)으로 저장한 뒤 그 <b>PDF 파일</b>을 올려 주세요.
            </li>
            <li>이미 올린 보고서·관찰의견서는 그대로 인정됩니다. 다시 올리지 않아도 됩니다.</li>
            <li>이미 올린 파일을 고쳐서 [보고서 수정 업로드]·[수정 업로드] 할 때도 PDF 파일만 올릴 수 있습니다.</li>
          </ul>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={close}>확인했습니다</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
