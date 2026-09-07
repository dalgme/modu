'use client';

import { useRef, useState, useTransition } from 'react';
import { Eye, EyeOff, FileCheck2, FileWarning, Trash2, Upload } from 'lucide-react';

import type { RequiredDocSlot } from '@/lib/workflow/case-documents';
import { attachCaseDocumentAction, deleteCaseDocumentAction, setCaseDocumentVisibilityAction } from '@/lib/workflow/document-actions';
import { stageUpload } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';

/**
 * 그룹별 필수서류 슬롯 (docs §5-3) — 슬롯마다 업로드. req1 은 단일본(재업로드 시 교체), req 는 누적.
 * viewerRole 에 따라 업로드 가능한 슬롯(for_role)이 다르다: 멘티=mentee, 멘토=mentor, 운영사=전부.
 */
export function RequiredDocsPanel({ caseId, slots, viewerRole, canUpload }: { caseId: string; slots: RequiredDocSlot[]; viewerRole: 'nextlab' | 'institution' | 'mentor' | 'mentee'; canUpload: boolean }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  const [mentorVisible, setMentorVisible] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  if (slots.length === 0) return null;

  const uploadable = (s: RequiredDocSlot) => canUpload && (viewerRole === 'nextlab' || s.forRole === viewerRole);
  const canToggle = viewerRole === 'nextlab' || viewerRole === 'mentee';

  const upload = (slot: RequiredDocSlot) => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast({ title: '파일을 선택하세요.', variant: 'destructive' });
      return;
    }
    start(async () => {
      try {
        const staged = await stageUpload(file, 'documents');
        const r = await attachCaseDocumentAction({ caseId, staging: staged, label: slot.name, mentorVisible, docKey: slot.key });
        if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
        toast({ title: `${slot.name} 을(를) 올렸습니다.` });
        setActive(null);
        if (fileRef.current) fileRef.current.value = '';
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '업로드 실패', variant: 'destructive' });
      }
    });
  };

  const missing = slots.filter((s) => s.required && s.files.length === 0).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          그룹 필수서류 {missing > 0 ? <span className="ml-1 text-xs font-semibold text-destructive">누락 {missing}건</span> : <span className="ml-1 text-xs font-semibold text-emerald-700">모두 제출</span>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">사업그룹에서 요구하는 서류입니다. 단일본 서류는 다시 올리면 교체됩니다.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {slots.map((s) => (
          <div key={s.key} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                {s.files.length > 0 ? <FileCheck2 className="h-4 w-4 text-emerald-600" /> : <FileWarning className={`h-4 w-4 ${s.required ? 'text-destructive' : 'text-muted-foreground'}`} />}
                <b>{s.name}</b>
                <span className="text-xs text-muted-foreground">
                  {s.required ? '필수' : '선택'} · {s.multiple ? '복수' : '단일본'} · 제출자 {s.forRole === 'mentee' ? '멘티' : s.forRole === 'mentor' ? '멘토' : '운영사'}
                </span>
              </span>
              {uploadable(s) && (
                <Button size="sm" variant={active === s.key ? 'ghost' : 'outline'} className="gap-1" disabled={pending} onClick={() => setActive(active === s.key ? null : s.key)}>
                  <Upload className="h-4 w-4" /> {s.files.length > 0 && !s.multiple ? '교체' : '올리기'}
                </Button>
              )}
            </div>
            {s.condition && <p className="mt-1 text-xs text-muted-foreground">{s.condition}</p>}
            {s.files.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {s.files.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                          {d.name}
                        </a>
                      ) : (
                        <span className="truncate">{d.name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
                      {viewerRole !== 'mentor' && <span className={`rounded-full px-2 py-0.5 text-[11px] ${d.mentorVisible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{d.mentorVisible ? '멘토 공개' : '비공개'}</span>}
                    </span>
                    {uploadable(s) && (
                      <span className="flex gap-1">
                        {canToggle && (
                          <Button size="sm" variant="ghost" disabled={pending} title={d.mentorVisible ? '멘토에게 숨기기' : '멘토에게 공개'} onClick={() => start(async () => { const r = await setCaseDocumentVisibilityAction(caseId, d.id, !d.mentorVisible); toast(r.ok ? { title: '공개 범위를 바꿨습니다.' } : { title: r.error, variant: 'destructive' }); })}>
                            {d.mentorVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={pending} title="삭제" onClick={() => { if (!confirm('삭제할까요?')) return; start(async () => { const r = await deleteCaseDocumentAction(caseId, d.id); toast(r.ok ? { title: '삭제했습니다.' } : { title: r.error, variant: 'destructive' }); }); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {active === s.key && uploadable(s) && (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-dashed p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.zip" disabled={pending} className="max-w-sm" />
                  <Button size="sm" onClick={() => upload(s)} disabled={pending}>
                    {pending ? '올리는 중…' : '업로드'}
                  </Button>
                </div>
                {viewerRole !== 'mentor' && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={mentorVisible} onChange={(e) => setMentorVisible(e.target.checked)} disabled={pending} /> 멘토에게 공개
                  </label>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
