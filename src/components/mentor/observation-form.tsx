'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, FileText, Lock, Save, Upload } from 'lucide-react';

import type { ObservationContent } from '@/lib/workflow/closure';
import { saveObservationAction, uploadObservationAction } from '@/lib/workflow/mentor-actions';
import { stageUpload } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const FIELDS: { key: keyof Omit<ObservationContent, 'overall_rating'>; label: string; rows: number; required?: boolean }[] = [
  { key: 'summary', label: '멘토링 총평', rows: 5, required: true },
  { key: 'strengths', label: '강점', rows: 3 },
  { key: 'weaknesses', label: '보완점', rows: 3 },
  { key: 'recommendations', label: '권고 사항', rows: 3 },
  { key: 'next_steps', label: '향후 계획 · 연계 제안', rows: 3 },
];

/**
 * 관찰의견서 — 기본은 **파일 업로드**(2026-09-29), 웹 작성은 보조(펼치기). 종결 요청 시 단일본으로 확정된다.
 * [파일 업로드]는 계획 회차 보고서를 모두 올린 뒤에만 열린다 — `uploadGate` 는 서버 게이트(uploadObservationFile)와 같은 observationUploadGate 결과.
 */
export function ObservationForm({
  caseId,
  initial,
  file,
  editable,
  uploadGate = { ok: true, hint: '' },
}: {
  caseId: string;
  initial: ObservationContent;
  file: { name: string; url: string | null } | null;
  editable: boolean;
  uploadGate?: { ok: boolean; hint: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<ObservationContent>(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  // 웹 작성은 보조 — 이미 작성한 내용이 있으면 펼친 상태로 시작
  const [webOpen, setWebOpen] = useState(initial.summary.trim().length > 0);
  const [picked, setPicked] = useState<string | null>(null);

  const save = () =>
    start(async () => {
      const r = await saveObservationAction(caseId, form);
      toast(r.ok ? { title: '임시 저장했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });

  const upload = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast({ title: '파일을 선택하세요.', variant: 'destructive' });
    start(async () => {
      try {
        const staged = await stageUpload(f, 'documents');
        const r = await uploadObservationAction(caseId, staged);
        toast(r.ok ? { title: '관찰의견서 파일을 올렸습니다. (기존 파일은 교체됨)' } : { title: r.error, variant: 'destructive' });
        if (r.ok) router.refresh();
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '업로드 실패', variant: 'destructive' });
      }
    });
  };

  const uploadOk = editable && uploadGate.ok;
  return (
    <div className="flex flex-col gap-4">
      {file && (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <FileText className="h-4 w-4" />
          현재 제출본:{' '}
          <a href={file.url ?? '#'} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            {file.name}
          </a>
        </p>
      )}
      {editable && (
        <div className={`flex flex-col gap-2 rounded-lg border p-3 ${uploadOk ? 'border-primary/40 bg-primary/5' : 'bg-muted/30'}`}>
          <p className="text-sm font-semibold">관찰의견서 파일 업로드 {file && <span className="text-xs font-normal text-muted-foreground">(다시 올리면 기존 파일과 교체)</span>}</p>
          {!uploadOk && (
            <p className="inline-flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {uploadGate.hint}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={fileRef}
              type="file"
              accept=".pdf,.hwp,.hwpx,.doc,.docx"
              className="max-w-xs"
              disabled={pending || !uploadOk}
              onChange={(e) => setPicked(e.target.files?.[0]?.name ?? null)}
            />
            <Button onClick={upload} disabled={pending || !uploadOk || !picked} className="gap-1">
              <Upload className="h-4 w-4" /> {pending ? '올리는 중…' : '파일 업로드'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">PDF · HWP · Word 파일</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setWebOpen((v) => !v)}
        aria-expanded={webOpen}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {webOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} 파일 대신 웹으로 작성하기 (선택)
      </button>
      {webOpen && (
      <div className="flex flex-col gap-4 rounded-lg border p-3">
      {FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <Label htmlFor={`obs-${f.key}`}>
            {f.label} {f.required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id={`obs-${f.key}`}
            rows={f.rows}
            value={form[f.key]}
            disabled={!editable || pending}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <Label>종합 평가 (1~5)</Label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={!editable || pending}
              onClick={() => setForm({ ...form, overall_rating: n })}
              className={`h-9 w-9 rounded-full border text-sm font-semibold ${form.overall_rating === n ? 'border-primary bg-primary text-primary-foreground' : ''}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button variant="outline" onClick={save} disabled={pending} className="gap-1">
            <Save className="h-4 w-4" /> 임시 저장
          </Button>
          <span className="text-[11px] text-muted-foreground">웹 작성본은 종결 요청 때 PDF 로 만들어집니다. 파일을 올렸다면 올린 파일이 우선합니다.</span>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
