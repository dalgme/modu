'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { submitRoundAction } from '@/lib/workflow/mentor-actions';
import { stageUpload, type StagedFile } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

function localNowRounded(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

/** 회차 등록 폼 — 기초정보(일시·장소·유형) + 보고서 웹작성 또는 파일 업로드 + 사진 */
export function RoundForm({ caseId, nextRoundNo, maxRounds, rates }: {
  caseId: string;
  nextRoundNo: number;
  maxRounds: number;
  rates: { online: number | null; offline: number | null };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'online' | 'offline'>('offline');
  const [startedAt, setStartedAt] = useState(localNowRounded());
  const [durationMin, setDurationMin] = useState(60);
  const [place, setPlace] = useState('');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const [kind, setKind] = useState<'web' | 'file'>('web');
  const reportRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const full = nextRoundNo > maxRounds;

  const submit = () => {
    const started = new Date(startedAt);
    if (Number.isNaN(started.getTime())) return toast({ title: '시작 일시를 입력하세요.', variant: 'destructive' });
    const ended = new Date(started.getTime() + Math.max(10, durationMin) * 60000);
    start(async () => {
      try {
        let reportFile: StagedFile | null = null;
        if (kind === 'file') {
          const f = reportRef.current?.files?.[0];
          if (!f) {
            toast({ title: '보고서 파일을 선택하세요.', variant: 'destructive' });
            return;
          }
          reportFile = await stageUpload(f, 'documents');
        }
        const photos: string[] = [];
        for (const f of Array.from(photosRef.current?.files ?? []).slice(0, 10)) {
          photos.push((await stageUpload(f, 'photos')).stagingPath);
        }
        const r = await submitRoundAction({
          caseId,
          mode,
          startedAt: started.toISOString(),
          endedAt: ended.toISOString(),
          place,
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
        toast({ title: `${r.roundNo}회차를 등록했습니다.` });
        setOpen(false);
        setContent('');
        setResult('');
        setTopic('');
        router.refresh();
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '등록 실패', variant: 'destructive' });
      }
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={full} className="gap-1">
        <Plus className="h-4 w-4" /> {full ? `회차 상한(${maxRounds}회) 도달` : `${nextRoundNo}회차 등록`}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 shadow-sm">
      <h3 className="font-semibold">{nextRoundNo}회차 등록</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label>유형</Label>
          <div className="flex gap-2">
            {(['offline', 'online'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mode === m ? 'border-primary bg-primary/10 font-semibold' : ''}`}
              >
                {m === 'online' ? '온라인' : '오프라인'}
                <span className="ml-1 text-xs text-muted-foreground">
                  {rates[m] != null ? `${rates[m]!.toLocaleString('ko-KR')}원` : '단가 미설정'}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="startedAt">시작 일시</Label>
          <Input id="startedAt" type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="duration">진행 시간(분)</Label>
          <Input id="duration" type="number" min={10} step={10} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="place">{mode === 'online' ? '온라인 도구·링크' : '장소'}</Label>
          <Input id="place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={mode === 'online' ? '예: Zoom' : '예: 세종 창업카페 2층'} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="topic">주제</Label>
          <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="이번 회차 주제" />
        </div>
      </div>

      <div className="flex gap-2 text-sm">
        <button type="button" onClick={() => setKind('web')} className={`rounded-lg border px-3 py-1.5 ${kind === 'web' ? 'border-primary bg-primary/10 font-semibold' : ''}`}>
          보고서 웹 작성
        </button>
        <button type="button" onClick={() => setKind('file')} className={`rounded-lg border px-3 py-1.5 ${kind === 'file' ? 'border-primary bg-primary/10 font-semibold' : ''}`}>
          보고서 파일 업로드
        </button>
      </div>
      {kind === 'web' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="content">컨설팅 내용 *</Label>
          <Textarea id="content" rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="진행 내용, 논의 사항, 멘티 상황" />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label>보고서 파일 *</Label>
          <Input ref={reportRef} type="file" accept=".pdf,.hwp,.hwpx,.doc,.docx,.png,.jpg,.jpeg" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="result">결과·다음 회차 계획</Label>
        <Textarea id="result" rows={3} value={result} onChange={(e) => setResult(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>사진 (최대 10장)</Label>
        <Input ref={photosRef} type="file" accept="image/*" multiple />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          취소
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? '등록 중…' : '회차 등록'}
        </Button>
      </div>
    </div>
  );
}
