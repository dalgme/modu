'use client';

import { useRef, useState, useTransition } from 'react';
import { Eye, EyeOff, FileText, Trash2, Upload } from 'lucide-react';

import type { CaseDocItem } from '@/lib/workflow/case-documents';
import { attachCaseDocumentAction, deleteCaseDocumentAction, setCaseDocumentVisibilityAction } from '@/lib/workflow/document-actions';
import { stageUpload } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';

/**
 * 멘티 관련 서류 첨부 — 운영사·멘티는 업로드 시 "멘토 공개" 체크로 공개/비공개를 정한다.
 * 멘토는 공개본만 보고 업로드한 파일은 항상 공개.
 */
export function CaseDocumentsPanel({
  caseId,
  docs,
  viewerRole,
  canUpload,
}: {
  caseId: string;
  docs: CaseDocItem[];
  viewerRole: 'nextlab' | 'institution' | 'mentor' | 'mentee';
  canUpload: boolean;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState('');
  const [mentorVisible, setMentorVisible] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const canToggle = viewerRole === 'nextlab' || viewerRole === 'mentee';

  const upload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast({ title: '파일을 선택하세요.', variant: 'destructive' });
    start(async () => {
      try {
        const staged = await stageUpload(file, 'documents');
        const r = await attachCaseDocumentAction({ caseId, staging: staged, label, mentorVisible });
        if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
        toast({ title: '첨부했습니다.' });
        setLabel('');
        if (fileRef.current) fileRef.current.value = '';
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '업로드 실패', variant: 'destructive' });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">멘티 서류</CardTitle>
        <p className="text-xs text-muted-foreground">
          {viewerRole === 'mentor' ? '멘토에게 공개된 서류만 표시됩니다.' : '"멘토 공개" 를 끄면 운영사·발주처·멘티만 볼 수 있습니다.'}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">첨부된 서류가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
                      {d.name}
                    </a>
                  ) : (
                    <span className="truncate">{d.name}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
                  {viewerRole !== 'mentor' && (
                    <span className={d.mentorVisible ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800' : 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800'}>
                      {d.mentorVisible ? '멘토 공개' : '비공개'}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  {canToggle && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await setCaseDocumentVisibilityAction(caseId, d.id, !d.mentorVisible);
                          toast(r.ok ? { title: '공개 범위를 바꿨습니다.' } : { title: r.error, variant: 'destructive' });
                        })
                      }
                      title={d.mentorVisible ? '멘토에게 숨기기' : '멘토에게 공개'}
                    >
                      {d.mentorVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                  {canUpload && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm('이 파일을 삭제할까요?')) return;
                        start(async () => {
                          const r = await deleteCaseDocumentAction(caseId, d.id);
                          toast(r.ok ? { title: '삭제했습니다.' } : { title: r.error, variant: 'destructive' });
                        });
                      }}
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canUpload && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.zip" disabled={pending} />
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="서류 이름 (비우면 파일명)" disabled={pending} />
              <Button onClick={upload} disabled={pending} className="gap-1">
                <Upload className="h-4 w-4" /> 첨부
              </Button>
            </div>
            {viewerRole !== 'mentor' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mentorVisible} onChange={(e) => setMentorVisible(e.target.checked)} disabled={pending} />
                멘토에게 공개 (끄면 운영사·발주처·멘티만 열람)
              </label>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
