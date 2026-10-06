'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, ImagePlus } from 'lucide-react';

import { registerRoundReportAction, replaceRoundReportAction, updateRoundAction } from '@/lib/workflow/mentor-actions';
import { stageUpload, type StagedFile } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fileExtension } from '@/lib/workflow/round-report-name';
import { useToast } from '@/hooks/use-toast';

/** 등록된 보고서의 내용·사진 추가 편집 (P31) — 일시·유형·보고서 파일은 바꾸지 않는다(updateRound) */
export interface RoundReportEdit {
  kind: 'web' | 'file';
  topic: string;
  content: string;
  result: string;
  place: string;
}

/** 회차 2단계 — 실서류(멘토링 보고서) 등록. 웹 작성 또는 파일 업로드 + 사진. `edit` 가 있으면 등록본 내용·사진 추가 모드 */
export function RoundReportForm({
  caseId,
  logId,
  roundNo,
  edit = null,
  dialog = false,
  triggerLabel,
  savedNameBase,
  replace = false,
}: {
  caseId: string;
  logId: string;
  roundNo: number;
  edit?: RoundReportEdit | null;
  /** 회차 행의 버튼으로 레이어 팝업을 연다 (2026-09-29 멘토 회차 행) — false 면 기존처럼 제자리에서 펼친다 */
  dialog?: boolean;
  triggerLabel?: string;
  /** 저장 파일명 안내 — "책임멘토 멘토링 보고서 및 결과보고서(멘토 멘토-멘티 멘티)_N회차" (확장자는 고른 파일에서). 실제 이름은 서버가 같은 규칙(roundReportFileName)으로 붙인다 */
  savedNameBase?: string;
  /** 등록된 보고서 파일 교체(수정 등록, 2026-09-30) — 파일 하나만 받아 replaceRoundReportAction 으로 바꾼다 */
  replace?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  // 기본은 파일 업로드 (P20 결정 — 웹 작성은 보조 수단). 편집 모드는 등록된 방식 고정
  const [kind, setKind] = useState<'web' | 'file'>(edit?.kind ?? 'file');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [topic, setTopic] = useState(edit?.topic ?? '');
  const [content, setContent] = useState(edit?.content ?? '');
  const [result, setResult] = useState(edit?.result ?? '');
  const reportRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  // 회차 행의 [보고서 업로드] 팝업(2026-09-30)은 파일 하나만 받는다 — 주제·결과·사진·웹 작성 없음
  const fileOnly = dialog && !edit;

  const submit = () => {
    start(async () => {
      try {
        let reportFile: StagedFile | null = null;
        const MB = 1024 * 1024;
        if (kind === 'file' && !edit) {
          const f = reportRef.current?.files?.[0];
          if (!f) {
            toast({ title: '보고서 파일을 선택하세요.', variant: 'destructive' });
            return;
          }
          if (f.size > 20 * MB) {
            toast({ title: '보고서 파일은 20MB 이하만 올릴 수 있습니다.', description: `${f.name} (${(f.size / MB).toFixed(1)}MB)`, variant: 'destructive' });
            return;
          }
          reportFile = await stageUpload(f, 'documents');
        }
        const picked = Array.from(photosRef.current?.files ?? []);
        if (picked.length > 10) {
          toast({ title: '사진은 최대 10장까지 첨부할 수 있습니다.', description: `${picked.length}장을 선택했습니다.`, variant: 'destructive' });
          return;
        }
        const tooBig = picked.find((f) => f.size > 10 * MB);
        if (tooBig) {
          toast({ title: '사진 한 장은 10MB 이하여야 합니다.', description: `${tooBig.name} (${(tooBig.size / MB).toFixed(1)}MB)`, variant: 'destructive' });
          return;
        }
        const photos = (await Promise.all(picked.map((f) => stageUpload(f, 'photos')))).map((s) => s.stagingPath);
        const r = replace
          ? await replaceRoundReportAction({ caseId, logId, reportFile: reportFile! })
          : edit
          ? await updateRoundAction({ caseId, logId, place: edit.place, topic, content: kind === 'web' ? content : undefined, result, photoPaths: photos })
          : await registerRoundReportAction({
              caseId,
              logId,
              topic,
              content: kind === 'web' ? content : undefined,
              result,
              reportFile,
              photoPaths: photos,
            });
        if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
        toast({ title: replace ? `${roundNo}회차 보고서를 새 파일로 바꿨습니다.` : edit ? `${roundNo}회차 보고서 내용을 수정했습니다.` : `${roundNo}회차 보고서를 등록했습니다.` });
        setOpen(false);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        toast({ title: '보고서 등록에 실패했습니다.', description: /network|fetch|Failed/i.test(msg) ? '네트워크 연결을 확인한 뒤 다시 시도하세요.' : msg || undefined, variant: 'destructive' });
      }
    });
  };

  const trigger = replace ? (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1">
      <FileUp className="h-4 w-4" /> {triggerLabel ?? '보고서 수정 업로드'}
    </Button>
  ) : edit ? (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1">
      <ImagePlus className="h-4 w-4" /> 내용·사진 추가
    </Button>
  ) : (
    <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
      <FileUp className="h-4 w-4" /> {triggerLabel ?? '보고서 등록 (2단계)'}
    </Button>
  );
  if (!open && !dialog) return trigger;

  const body = (
    <div className={dialog ? 'flex flex-col gap-3' : 'mt-2 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3'}>
      {dialog ? (
        <DialogHeader>
          <DialogTitle className="text-base">{replace ? `${roundNo}회차 보고서 수정 업로드` : edit ? `${roundNo}회차 — 보고서 내용·사진 추가` : `${roundNo}회차 보고서 업로드`}</DialogTitle>
          <DialogDescription className="sr-only">회차 보고서 파일과 사진을 올립니다.</DialogDescription>
        </DialogHeader>
      ) : (
        <p className="text-sm font-semibold">{edit ? `${roundNo}회차 — 보고서 내용·사진 추가` : `${roundNo}회차 — 2단계 · 실서류(보고서) 등록`}</p>
      )}
      {fileOnly ? (
        <p className="text-xs text-muted-foreground">{replace ? '고친 보고서 파일을 올리면 기존 파일과 바뀝니다. 최초 등록일은 그대로 두고 수정 등록일이 기록됩니다.' : '이 회차의 보고서 파일 하나만 올리면 됩니다. 올린 뒤 이 회차는 이행으로 인정되어 정산에 포함됩니다.'}</p>
      ) : edit ? (
        <p className="text-[11px] text-muted-foreground">주제·{edit.kind === 'web' ? '내용·' : ''}결과를 고치고 사진을 더 올릴 수 있습니다. 일시·방법·보고서 파일은 바꿀 수 없습니다(멘티 서명·정산 전까지).</p>
      ) : (
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={() => setKind('file')} className={`rounded-lg border px-3 py-1.5 ${kind === 'file' ? 'border-primary bg-background font-semibold' : ''}`}>
          보고서 파일 업로드 <span className="text-[10px] text-primary">(기본)</span>
        </button>
        <button type="button" onClick={() => setKind('web')} className={`rounded-lg border px-3 py-1.5 ${kind === 'web' ? 'border-primary bg-background font-semibold' : ''}`}>
          보고서 웹 작성
        </button>
      </div>
      )}
      {!fileOnly && (
      <div className="flex flex-col gap-1">
        <Label htmlFor={`rr-topic-${logId}`}>주제</Label>
        <Input id={`rr-topic-${logId}`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="이번 회차 주제" />
      </div>
      )}
      {kind === 'web' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`rr-content-${logId}`}>컨설팅 내용 *</Label>
          <Textarea id={`rr-content-${logId}`} rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="진행 내용, 논의 사항, 멘티 상황" />
        </div>
      ) : edit ? null : (
        <div className="flex flex-col gap-1">
          <Label>보고서 파일 *</Label>
          {/* 첨부 버튼 + 파일 드래그 공용 드롭존 (P20 — 파일 등록 우선) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (!f || !reportRef.current) return;
              const dt = new DataTransfer();
              dt.items.add(f);
              reportRef.current.files = dt.files;
              setFileName(f.name);
            }}
            onClick={() => reportRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${dragOver ? 'border-primary bg-primary/10' : 'border-input bg-background hover:border-primary/50'}`}
          >
            <FileUp className="h-6 w-6 text-primary" />
            {fileName ? (
              <span className="font-medium text-primary">{fileName}</span>
            ) : (
              <>
                <span className="font-medium">여기를 눌러 파일을 선택하거나, 파일을 끌어다 놓으세요</span>
                <span className="text-xs text-muted-foreground">PDF · HWP · Word · 이미지</span>
              </>
            )}
            <Input
              ref={reportRef}
              type="file"
              accept=".pdf,.hwp,.hwpx,.doc,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </div>
          {savedNameBase && (
            <p className="text-[11px] text-muted-foreground">
              저장 파일명: <b className="text-foreground">{savedNameBase}{fileExtension(fileName)}</b> (자동 변환)
            </p>
          )}
        </div>
      )}
      {fileOnly ? (
        <p className="text-[11px] text-muted-foreground">보고서 파일 20MB 이하 · PDF · HWP · Word · 이미지</p>
      ) : (
      <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`rr-result-${logId}`}>결과·다음 회차 계획</Label>
        <Textarea id={`rr-result-${logId}`} rows={3} value={result} onChange={(e) => setResult(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>사진 (최대 10장)</Label>
        <Input ref={photosRef} type="file" accept="image/*" multiple />
        <p className="text-[11px] text-muted-foreground">사진 최대 10장 · 장당 10MB · 보고서 파일 20MB 이하</p>
      </div>
      </>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          취소
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? (edit ? '저장 중…' : '등록 중…') : edit ? '저장' : '보고서 등록'}
        </Button>
      </div>
    </div>
  );
  if (!dialog) return body;
  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-2xl">{body}</DialogContent>
      </Dialog>
    </>
  );
}
