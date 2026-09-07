'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Upload, FileCheck2 } from 'lucide-react';

import {
  updateRegisteredCaseAction,
  type IntakeFields,
  type ApplicationStaging,
} from '@/lib/workflow/case-actions';
import { ApplicationPdfButton } from '@/components/cases/application-pdf-button';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type SupportTypeOption = { id: string; code: string; name: string };

function EditField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * 진흥원: 회수됐거나 미배정(registered)인 케이스의 내용 수정 + 신청서 PDF 재업로드.
 * 저장하면 넥스트랩 멘토 배정 대기 목록에 그대로 반영된다(= 다시 멘토 배정 요청).
 */
export function RegisteredCaseEditor({
  caseId,
  businessName,
  supportTypes,
  currentSupportTypeId,
  hasApplicationPdf,
  initial,
  doneHref = '/institution/dashboard',
}: {
  caseId: string;
  businessName: string;
  supportTypes: SupportTypeOption[];
  currentSupportTypeId: string;
  hasApplicationPdf: boolean;
  initial: IntakeFields;
  /** 저장 완료 후 이동할 경로 (기본 진흥원 대시보드) */
  doneHref?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [fields, setFields] = useState<IntakeFields>(initial);
  const [supportTypeId, setSupportTypeId] = useState(currentSupportTypeId);
  const [application, setApplication] = useState<ApplicationStaging | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof IntakeFields) => (v: string) => setFields((s) => ({ ...s, [k]: v }));

  /** 신청서 PDF 재업로드 → 스테이징 저장 + 텍스트 파싱으로 폼 자동 채움 */
  async function onPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      toast({ title: 'PDF 파일만 업로드할 수 있습니다.', variant: 'destructive' });
      return;
    }
    setImporting(true);
    try {
      const urlRes = await fetch('/api/institution/cases/application-upload-url', {
        method: 'POST',
      });
      const urlJson = await urlRes.json();
      if (!urlJson.ok) throw new Error(urlJson.error ?? '업로드 URL 발급 실패');

      const supabase = createBrowserSupabase();
      const { error: upErr } = await supabase.storage
        .from('documents')
        .uploadToSignedUrl(urlJson.path, urlJson.token, file, { contentType: 'application/pdf' });
      if (upErr) throw new Error(`스토리지 업로드 실패: ${upErr.message}`);

      const res = await fetch('/api/institution/cases/parse-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stagingPath: urlJson.path, fileName: file.name }),
      });
      const payload = await res.json();
      if (!payload.ok || !payload.staging) {
        throw new Error(payload.error ?? 'PDF를 처리하지 못했습니다.');
      }
      setApplication(payload.staging as ApplicationStaging);
      // 파싱된 값이 있으면 자동 채움 (빈 값은 기존 유지)
      const pf = (payload.fields ?? {}) as Partial<Record<keyof IntakeFields, string>>;
      setFields((s) => ({
        business_name: pf.business_name || s.business_name,
        owner_name: pf.owner_name || s.owner_name,
        business_reg_no: pf.business_reg_no || s.business_reg_no,
        phone: pf.phone || s.phone,
        address: pf.address || s.address,
        email: pf.email || s.email,
        business_type: pf.business_type || s.business_type,
        item: pf.item || s.item,
        opened_at: pf.opened_at || s.opened_at,
        employee_count: pf.employee_count || s.employee_count,
      }));
      const code = payload.supportTypeCode as string | undefined;
      if (code) {
        const match = supportTypes.find((t) => t.code === code);
        if (match) setSupportTypeId(match.id);
      }
      toast({ title: `${file.name} 첨부됨 · 내용 자동 채움` });
    } catch (err) {
      toast({
        title: '업로드 실패',
        description: err instanceof Error ? err.message : '다시 시도하세요.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  }

  async function onSave() {
    setSaving(true);
    const res = await updateRegisteredCaseAction({
      caseId,
      fields,
      supportTypeId,
      application: application ?? undefined,
    });
    setSaving(false);
    if (res.ok) {
      toast({
        title: '저장되었습니다.',
        description: '넥스트랩 멘토 배정 대기 목록에 반영됩니다.',
      });
      router.push(doneHref);
      router.refresh();
    } else {
      toast({ title: '저장 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 신청서 PDF 재업로드 */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">신청서 PDF 재업로드</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            id="reupload-pdf"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onPdf}
            disabled={importing}
          />
          <Button
            type="button"
            variant="outline"
            disabled={importing}
            onClick={() => document.getElementById('reupload-pdf')?.click()}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            {importing ? '분석 중…' : 'PDF 재업로드로 자동 채우기'}
          </Button>
          {application ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-status-approved/40 bg-status-approved/10 px-2 py-1 text-xs font-medium text-status-approved">
              <FileCheck2 className="h-3.5 w-3.5" />
              {application.fileName} 첨부됨
            </span>
          ) : hasApplicationPdf ? (
            <ApplicationPdfButton caseId={caseId} label="현재 신청서 PDF" />
          ) : (
            <span className="text-xs text-muted-foreground">첨부된 PDF가 없습니다.</span>
          )}
        </CardContent>
      </Card>

      {/* 내용 수정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{businessName} · 내용 수정</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>지원유형</Label>
            <Select value={supportTypeId} onValueChange={setSupportTypeId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="지원유형 선택" />
              </SelectTrigger>
              <SelectContent>
                {supportTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <EditField label="업체명" value={fields.business_name} onChange={set('business_name')} />
          <EditField label="대표자명" value={fields.owner_name} onChange={set('owner_name')} />
          <EditField
            label="사업자등록번호"
            value={fields.business_reg_no}
            onChange={set('business_reg_no')}
          />
          <EditField label="연락처" value={fields.phone} onChange={set('phone')} />
          <div className="sm:col-span-2">
            <EditField label="사업장 주소" value={fields.address} onChange={set('address')} />
          </div>
          <EditField label="이메일" value={fields.email} onChange={set('email')} type="email" />
          <EditField
            label="상시근로자수"
            value={fields.employee_count}
            onChange={set('employee_count')}
            type="number"
          />
          <EditField label="업태" value={fields.business_type} onChange={set('business_type')} />
          <EditField label="종목" value={fields.item} onChange={set('item')} />
          <EditField
            label="개업연월일"
            value={fields.opened_at}
            onChange={set('opened_at')}
            type="date"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onSave}
          disabled={saving || importing}
          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Save className="h-4 w-4" />
          {saving ? '저장 중…' : '저장 (멘토 배정 요청)'}
        </Button>
      </div>
    </div>
  );
}
