'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, UserCheck } from 'lucide-react';

import {
  saveIntakeReviewAction,
  type IntakeFields,
} from '@/lib/workflow/case-actions';
import { ApplicationPdfButton } from '@/components/cases/application-pdf-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type MentorOption = { id: string; name: string };

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
 * 접수내용 확인·편집 화면 (넥스트랩).
 * 상단: 멘토 선택 드롭다운 + '확인 및 저장하기'. 첨부 PDF 확인, 잘못된 입력 수정,
 * 하단 '신청 내용 요약'. 저장 시 정보 수정 + (멘토 선택 시) 자동 배정.
 */
export function IntakeReviewForm({
  caseId,
  businessName,
  hasApplicationPdf,
  mentors,
  initial,
  initialNote,
  alreadyAssignedMentorName,
}: {
  caseId: string;
  businessName: string;
  hasApplicationPdf: boolean;
  mentors: MentorOption[];
  initial: IntakeFields;
  initialNote: string;
  alreadyAssignedMentorName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [fields, setFields] = useState<IntakeFields>(initial);
  const [note, setNote] = useState(initialNote);
  const [mentorId, setMentorId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const set = (k: keyof IntakeFields) => (v: string) => setFields((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true);
    const res = await saveIntakeReviewAction({
      caseId,
      fields,
      intakeNote: note,
      mentorId: mentorId || undefined,
    });
    setSaving(false);
    if (res.ok) {
      toast({
        title: res.assigned ? '저장되고 멘토가 배정되었습니다.' : '접수내용이 저장되었습니다.',
      });
      router.push('/nextlab/dashboard');
      router.refresh();
    } else {
      toast({ title: '저장 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 상단: 멘토 선택 + 확인 및 저장하기 (각각 다른 색) */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div className="flex flex-col gap-1.5">
            <Label>멘토 배정 (선택 시 저장과 함께 자동 배정)</Label>
            {alreadyAssignedMentorName ? (
              <p className="text-sm">
                이미 <b>{alreadyAssignedMentorName}</b> 멘토가 배정된 케이스입니다.
              </p>
            ) : (
              <Select value={mentorId} onValueChange={setMentorId}>
                <SelectTrigger className="w-60 border-indigo-300 bg-indigo-50 font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <SelectValue placeholder="멘토 선택" />
                </SelectTrigger>
                <SelectContent>
                  {mentors.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {mentorId ? <UserCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? '저장 중…' : '확인 및 저장하기'}
          </Button>
        </CardContent>
      </Card>

      {/* 첨부 신청서 PDF */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">첨부 신청서 (원본 PDF)</CardTitle>
          {hasApplicationPdf ? (
            <ApplicationPdfButton caseId={caseId} />
          ) : (
            <span className="text-xs text-muted-foreground">첨부된 PDF가 없습니다.</span>
          )}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          업로드된 사업신청서 원본을 팝업으로 확인하며 아래 입력값의 오류를 바로잡으세요.
        </CardContent>
      </Card>

      {/* 멘티 정보 편집 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{businessName} · 접수정보 수정</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      {/* 신청 내용 요약 (넥스트랩 기타사항) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">신청 내용 요약 (기타사항)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="넥스트랩 담당자가 접수 검토 시 참고사항·특이사항을 자유롭게 작성하세요."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={save}
          disabled={saving}
          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {mentorId ? <UserCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? '저장 중…' : '확인 및 저장하기'}
        </Button>
      </div>
    </div>
  );
}
