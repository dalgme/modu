'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, ImageUp, Loader2, X } from 'lucide-react';

import { createClient as createBrowserSupabase } from '@/lib/supabase/client';

import {
  submitMentoringLogAction,
  updateMentoringLogAction,
  loadCaseSignatureAction,
} from '@/lib/workflow/log-actions';
import type { MentoringLogRow } from '@/lib/data/mentoring-logs';
import { formatVisitRange, parseWallClock } from '@/lib/utils/format';
import { SignaturePad } from '@/components/common/signature-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/** input[type=date|time] 클릭·포커스 시 네이티브 피커 팝업 */
function openPicker(e: React.SyntheticEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    el.showPicker?.();
  } catch {
    /* 사용자 제스처 아님 등 무시 */
  }
}

function addOneHour(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const nh = ((h ?? 0) + 1) % 24;
  return `${String(nh).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

/** 24시각 기준 시(00~23) 목록 */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
/** 분(5분 단위) 기본 목록 */
const MINUTE_BASE = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const timeSelectCls =
  'h-10 w-full rounded-md border border-input bg-background px-2 text-sm ' +
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * 시각 선택 — 24시각 기준 '시 / 분' 드롭다운 (오전/오후 표기 없음).
 * value/onChange 는 'HH:mm' 문자열(미완성이면 '')로 기존 로직과 호환된다.
 * 기존 데이터의 분이 5분 단위가 아니면 그 값을 옵션에 추가해 유실을 막는다.
 */
function TimeSelect({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [h, m] = value ? value.split(':') : ['', ''];
  const minutes =
    m && !MINUTE_BASE.includes(m) ? [...MINUTE_BASE, m].sort() : MINUTE_BASE;

  function update(nextH: string, nextM: string) {
    if (nextH && nextM) onChange(`${nextH}:${nextM}`);
    else onChange('');
  }

  return (
    <div className="flex flex-col gap-1" role="group" aria-label={label}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <select
          aria-label={`${label} 시(24시각 기준)`}
          className={timeSelectCls}
          value={h}
          required={required}
          onChange={(e) => update(e.target.value, m || '00')}
        >
          <option value="" disabled>
            시
          </option>
          {HOUR_OPTIONS.map((hh) => (
            <option key={hh} value={hh}>
              {hh}시
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} 분`}
          className={timeSelectCls}
          value={m}
          required={required}
          onChange={(e) => update(h || '00', e.target.value)}
        >
          <option value="" disabled>
            분
          </option>
          {minutes.map((mm) => (
            <option key={mm} value={mm}>
              {mm}분
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 저장된 visited_at·duration 을 날짜/시작/종료 문자열로 (수정 시 프리필).
 * visited_at 은 사용자가 입력한 '벽시계' 시각이므로 타임존 변환 없이 문자열 구성요소를 그대로 읽는다
 * (Date 로 파싱하면 KST↔UTC 차이로 수정 화면에서 시각이 어긋나 보이던 문제 방지).
 */
function parseInit(
  iso?: string | null,
  dur?: number | null,
): { date: string; start: string; end: string } {
  const p = parseWallClock(iso);
  if (!p) return { date: '', start: '', end: '' };
  const date = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  const start = `${pad2(p.hour)}:${pad2(p.minute)}`;
  let end = addOneHour(start);
  if (dur) {
    const endTotal = (p.hour * 60 + p.minute + dur) % (24 * 60);
    end = `${pad2(Math.floor(endTotal / 60))}:${pad2(endTotal % 60)}`;
  }
  return { date, start, end };
}

/** 방문 일시: 날짜 + 시작·종료 시각(기본 1시간). visitedAt(ISO) + durationMinutes hidden 제출 */
function VisitTimeField({
  initialVisitedAt,
  initialDurationMinutes,
}: {
  initialVisitedAt?: string | null;
  initialDurationMinutes?: number | null;
}) {
  const init = parseInit(initialVisitedAt, initialDurationMinutes);
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);

  function onStartChange(v: string) {
    setStart(v);
    if (!end || end <= v) setEnd(addOneHour(v));
  }

  const summary = useMemo(() => {
    if (!start || !end) return null;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = (eh! * 60 + em!) - (sh! * 60 + sm!);
    if (mins <= 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const dur = m ? `${h}시간 ${m}분` : `${h}시간`;
    return { range: `${start}~${end}`, dur, minutes: mins };
  }, [start, end]);

  const visitedAt = date && start ? `${date}T${start}` : '';

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="visit-date">방문 일시</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">날짜</span>
          <Input
            id="visit-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onClick={openPicker}
            onFocus={openPicker}
            required
          />
        </div>
        <TimeSelect label="시작 시각" value={start} onChange={onStartChange} required />
        <TimeSelect label="종료 시각" value={end} onChange={setEnd} />
      </div>
      <p className="text-xs text-muted-foreground">
        {summary ? (
          <>
            방문 일시:{' '}
            <span className="font-semibold text-foreground">
              {visitedAt
                ? formatVisitRange(visitedAt, summary.minutes)
                : `${summary.range} (${summary.dur})`}
            </span>
          </>
        ) : (
          '시작 시각을 선택하면 종료 시각이 1시간 뒤로 자동 설정됩니다. (수정 가능)'
        )}
      </p>
      <input type="hidden" name="visitedAt" value={visitedAt} />
      <input type="hidden" name="durationMinutes" value={summary?.minutes ?? ''} />
    </div>
  );
}

/**
 * 현장 사진 한 칸(사진1/사진2). 선택 즉시 스토리지(photos 버킷)로 직접 업로드하고
 * '업로드됨' 을 확인시켜 준다(File 을 서버 액션으로 넘기면 저장되지 않던 문제를 우회).
 * 저장 시에는 업로드된 경로(문자열)만 전송한다.
 * @param onResult   업로드 완료 경로(성공) 또는 null(비움·실패)
 * @param onBusyChange 업로드 진행 중 여부 — 부모가 저장 버튼을 잠그는 데 사용
 */
function PhotoSlot({
  label,
  onResult,
  onBusyChange,
}: {
  label: string;
  onResult: (path: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'empty' | 'uploading' | 'done' | 'error'>('empty');

  function setPreviewUrl(url: string | null) {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }
  // 언마운트 시 objectURL 정리
  useEffect(() => () => setPreview((p) => (p ? (URL.revokeObjectURL(p), null) : null)), []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: '이미지 파일만 올릴 수 있어요.', variant: 'destructive' });
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setStatus('uploading');
    onBusyChange(true);
    onResult(null);
    try {
      const res = await fetch('/api/mentoring/photo-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? '업로드 URL 발급 실패');
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage
        .from('photos')
        .uploadToSignedUrl(json.path, json.token, file, {
          contentType: file.type || 'image/jpeg',
        });
      if (error) throw new Error(error.message);
      setStatus('done');
      onResult(String(json.path));
    } catch (err) {
      setStatus('error');
      onResult(null);
      toast({
        title: '사진 업로드 실패',
        description: err instanceof Error ? err.message : '다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      onBusyChange(false);
    }
  }

  function clear() {
    setPreviewUrl(null);
    setStatus('empty');
    onResult(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted/30">
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={`${label} 미리보기`} className="h-full w-full object-contain" />
            {status === 'uploading' && (
              <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 text-sm font-medium text-white">
                <Loader2 className="h-4 w-4 animate-spin" /> 업로드 중…
              </span>
            )}
            {status === 'done' && (
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                <Check className="h-3 w-3" /> 업로드됨
              </span>
            )}
            {status === 'error' && (
              <span className="absolute left-2 top-2 rounded-md bg-destructive px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                업로드 실패 · 다시 선택
              </span>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 px-4 py-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Camera className="h-6 w-6" />
            <span className="font-medium">사진 선택 · 촬영</span>
            <span className="text-xs">탭하여 카메라 또는 앨범에서 선택</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void handleFile(f);
          }}
        />
      </div>
      {preview && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={status === 'uploading'}
            onClick={() => inputRef.current?.click()}
          >
            <ImageUp className="h-3.5 w-3.5" />
            다시 선택
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            disabled={status === 'uploading'}
            onClick={clear}
          >
            <X className="h-3.5 w-3.5" />
            제거
          </Button>
        </div>
      )}
    </div>
  );
}

export function MentoringLogForm({
  caseId,
  existing,
  currentMentorSig,
  currentMenteeSig,
  currentPhotos = [],
}: {
  caseId: string;
  existing?: MentoringLogRow;
  /** 현재 케이스에 적용된 서명(수정 화면에서 참고용으로 표시) */
  currentMentorSig?: string | null;
  currentMenteeSig?: string | null;
  /** 현재 케이스에 등록된 현장 사진 URL(수정 화면에서 참고용으로 표시) */
  currentPhotos?: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!existing;
  const [submitting, setSubmitting] = useState(false);
  // 수정 저장 완료 팝업 — 확인 시 '멘티별 업무진행'(/mentor/tasks) 으로 이동
  const [savedOpen, setSavedOpen] = useState(false);
  const [mentorSig, setMentorSig] = useState<string | null>(null);
  const [menteeSig, setMenteeSig] = useState<string | null>(null);
  // 현장 사진 2칸(사진1·사진2). 선택 즉시 스토리지 업로드 → 경로(문자열)만 보관.
  const [photoPaths, setPhotoPaths] = useState<(string | null)[]>([null, null]);
  const [photoBusy, setPhotoBusy] = useState(0);

  function setPath(i: number, path: string | null) {
    setPhotoPaths((prev) => {
      const next = [...prev];
      next[i] = path;
      return next;
    });
  }
  const bumpBusy = (busy: boolean) => setPhotoBusy((n) => Math.max(0, n + (busy ? 1 : -1)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 신규 작성은 서명 필수. 수정은 서명 유지 가능(비우면 기존 서명 유지).
    if (!isEdit && (!mentorSig || !menteeSig)) {
      toast({
        title: '서명 필요',
        description: '멘토·멘티 서명을 모두 입력하세요.',
        variant: 'destructive',
      });
      return;
    }
    if (photoBusy > 0) {
      toast({ title: '사진 업로드 중', description: '사진 업로드가 끝난 뒤 저장해 주세요.' });
      return;
    }
    const formData = new FormData(e.currentTarget);
    formData.set('caseId', caseId);
    if (existing) formData.set('logId', existing.id);
    if (mentorSig) formData.set('mentorSignature', mentorSig);
    if (menteeSig) formData.set('menteeSignature', menteeSig);
    // 사진1 → 사진2 순서로, 업로드된 경로만 전송
    formData.delete('photoPaths');
    for (const p of photoPaths) if (p) formData.append('photoPaths', p);

    setSubmitting(true);
    let result: Awaited<ReturnType<typeof updateMentoringLogAction>>;
    try {
      result = isEdit
        ? await updateMentoringLogAction(formData)
        : await submitMentoringLogAction(formData);
    } catch (err) {
      setSubmitting(false);
      toast({
        title: isEdit ? '수정 실패' : '저장 실패',
        description: err instanceof Error ? err.message : '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(false);
    if (result.ok) {
      if (isEdit) {
        // 수정 저장: '저장 완료' 팝업으로 확인 → (확인 시) 멘티별 업무진행으로 이동
        setSavedOpen(true);
      } else {
        toast({ title: '멘토링 일지가 저장되었습니다.' });
        router.push(`/mentor/cases/${caseId}/log`);
        router.refresh();
      }
    } else {
      toast({ title: isEdit ? '수정 실패' : '저장 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">방문 · 내용</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <VisitTimeField
              initialVisitedAt={existing?.visited_at}
              initialDurationMinutes={existing?.duration_minutes}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="place">장소</Label>
              <Input
                id="place"
                name="place"
                placeholder="예: 업체 사업장"
                defaultValue={existing?.place ?? ''}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">컨설팅 주제</Label>
            <Input
              id="topic"
              name="topic"
              placeholder="예: 매출 개선 · 마케팅 전략"
              defaultValue={existing?.topic ?? ''}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="difficulties">기업 애로사항 등</Label>
            <Textarea
              id="difficulties"
              name="difficulties"
              rows={3}
              defaultValue={existing?.difficulties ?? ''}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content">컨설팅 내용</Label>
            <Textarea
              id="content"
              name="content"
              rows={5}
              required
              defaultValue={existing?.content ?? ''}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="result">컨설팅 결과</Label>
            <Textarea id="result" name="result" rows={3} defaultValue={existing?.result ?? ''} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>
              현장 사진 (사진1 · 사진2)
              {isEdit && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  · 선택 시 추가되며 기존 사진은 유지됩니다
                </span>
              )}
            </Label>
            <p className="text-xs text-muted-foreground">
              칸마다 사진을 선택하면 바로 업로드되어 <b className="text-foreground">‘✓ 업로드됨’</b> 으로
              확인됩니다. 확인 후 아래{' '}
              <b className="text-foreground">{isEdit ? '수정 저장' : '일지 저장'}</b> 을 누르세요.
            </p>

            {isEdit && currentPhotos.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  현재 등록된 현장 사진 ({currentPhotos.length}장)
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentPhotos.map((src, i) => (
                    <div
                      key={src}
                      className="h-24 w-32 overflow-hidden rounded-md border bg-background"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`현재 현장사진 ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PhotoSlot label="사진1" onResult={(p) => setPath(0, p)} onBusyChange={bumpBusy} />
              <PhotoSlot label="사진2" onResult={(p) => setPath(1, p)} onBusyChange={bumpBusy} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">서명</CardTitle>
          {isEdit && (
            <p className="text-xs text-muted-foreground">
              아래는 <b className="text-foreground">현재 적용된 서명</b>입니다. 그대로 두려면 비워
              두시고, 잘못된 서명을 <b className="text-foreground">바꾸려면 다시 서명</b>해 주세요.
            </p>
          )}
        </CardHeader>
        {isEdit && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium text-muted-foreground">현재 멘토 서명</span>
                <div className="flex h-20 w-full items-center justify-center rounded-md border bg-white">
                  {currentMentorSig ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentMentorSig} alt="현재 멘토 서명" className="max-h-16 object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">없음</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium text-muted-foreground">현재 멘티 서명</span>
                <div className="flex h-20 w-full items-center justify-center rounded-md border bg-white">
                  {currentMenteeSig ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentMenteeSig} alt="현재 멘티 서명" className="max-h-16 object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">없음</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        )}
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SignaturePad
            label={isEdit ? '멘토 서명 (바꿀 때만)' : '멘토 서명'}
            onChange={setMentorSig}
            loadSaved={() => loadCaseSignatureAction(caseId, 'mentor')}
          />
          <SignaturePad
            label={isEdit ? '멘티 서명 (바꿀 때만)' : '멘티 서명'}
            onChange={setMenteeSig}
            loadSaved={() => loadCaseSignatureAction(caseId, 'mentee')}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" disabled={submitting || photoBusy > 0}>
          {submitting ? '저장 중…' : photoBusy > 0 ? '사진 업로드 중…' : isEdit ? '수정 저장' : '일지 저장'}
        </Button>
      </div>

      {/* 수정 저장 완료 팝업 → 확인 시 멘티별 업무진행으로 이동 */}
      <Dialog
        open={savedOpen}
        onOpenChange={(open) => {
          if (!open) {
            router.push('/mentor/tasks');
            router.refresh();
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>저장 완료</DialogTitle>
            <DialogDescription>멘토링 일지가 수정·저장되었습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                router.push('/mentor/tasks');
                router.refresh();
              }}
            >
              멘티별 업무진행으로 이동
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
