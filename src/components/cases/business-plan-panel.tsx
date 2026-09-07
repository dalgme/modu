'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Upload } from 'lucide-react';

import {
  attachBusinessPlanAction,
  getBusinessPlanSourceUrl,
} from '@/lib/workflow/case-actions';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { useFileViewer } from '@/components/common/file-viewer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

/**
 * 넥스트랩 케이스 상세: '업체별 사업추진 계획서' 첨부·열람 패널.
 *  - 첨부: 브라우저 → 스토리지 직접 업로드(Vercel 본문 한도 우회) 후 케이스에 첨부.
 *  - 열람: 버튼 클릭 시 signed URL 을 받아 팝업 레이어(파일 뷰어)로 확인.
 */
export function BusinessPlanPanel({ caseId, hasPlan }: { caseId: string; hasPlan: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { openUrl } = useFileViewer();
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);

  async function onView() {
    setViewing(true);
    const url = await getBusinessPlanSourceUrl(caseId);
    setViewing(false);
    if (url) openUrl(url, { title: '업체별 사업추진 계획서' });
    else toast({ title: '첨부된 계획서가 없습니다.', variant: 'destructive' });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      // 1) 서명 업로드 URL 발급
      const urlRes = await fetch('/api/nextlab/cases/business-plan-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name }),
      });
      const urlJson = await urlRes.json();
      if (!urlJson.ok) throw new Error(urlJson.error ?? '업로드 URL 발급 실패');

      // 2) 브라우저 → 스토리지 직접 업로드
      const supabase = createBrowserSupabase();
      const { error: upErr } = await supabase.storage
        .from('documents')
        .uploadToSignedUrl(urlJson.path, urlJson.token, file, {
          contentType: file.type || 'application/octet-stream',
        });
      if (upErr) throw new Error(`스토리지 업로드 실패: ${upErr.message}`);

      // 3) 케이스에 첨부 (해시·크기는 서버가 계산)
      const res = await attachBusinessPlanAction(caseId, {
        stagingPath: urlJson.path,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      if (!res.ok) throw new Error(res.error);

      toast({ title: '업체별 사업추진 계획서가 첨부되었습니다.' });
      router.refresh();
    } catch (err) {
      toast({
        title: '첨부 실패',
        description: err instanceof Error ? err.message : '다시 시도하세요.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">업체별 사업추진 계획서</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {hasPlan
            ? '첨부된 계획서를 아래 버튼으로 확인할 수 있습니다.'
            : '아직 첨부된 계획서가 없습니다. 파일(PDF·이미지)을 첨부하세요.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasPlan && (
            <Button type="button" onClick={onView} disabled={viewing} className="gap-1.5">
              <FileText className="h-4 w-4" />
              {viewing ? '여는 중…' : '계획서 보기'}
            </Button>
          )}
          <input
            id="business-plan-file"
            type="file"
            accept="application/pdf,image/*,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            className="hidden"
            onChange={onFile}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => document.getElementById('business-plan-file')?.click()}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            {uploading ? '첨부 중…' : hasPlan ? '다른 파일로 교체' : '계획서 첨부'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
