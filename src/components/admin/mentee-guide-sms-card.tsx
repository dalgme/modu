'use client';

import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';

import { saveMenteeGuideSmsTemplateAction } from '@/lib/workflow/mentee-guide-sms-actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/**
 * 멘티 안내 문자 문구 편집 카드 (문자발송 페이지).
 * 운영사 '멘티기업 현황판'의 '멘티 안내 문자보내기' 버튼이 사용하는 템플릿을 수정한다.
 */
export function MenteeGuideSmsCard({ initialTemplate }: { initialTemplate: string }) {
  const { toast } = useToast();
  const [template, setTemplate] = useState(initialTemplate);
  const [saving, setSaving] = useState(false);

  const preview = useMemo(
    () =>
      template
        .split('{name}')
        .join('홍길동')
        .split('{company}')
        .join('○○상회')
        .split('{login_id}')
        .join('홍길동6789')
        .split('{password}')
        .join('01012346789 (본인 휴대폰 번호)')
        .split('{url}')
        .join('https://restart.startmate.kr'),
    [template],
  );

  async function save() {
    setSaving(true);
    const r = await saveMenteeGuideSmsTemplateAction({ template: template.trim() });
    setSaving(false);
    if (r.ok) toast({ title: '멘티 안내 문구를 저장했습니다.' });
    else toast({ title: '저장 실패', description: r.error, variant: 'destructive' });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mentee-guide-template">
          안내문 내용{' '}
          <span className="text-xs font-normal text-muted-foreground">
            (치환: <code className="rounded bg-muted px-1">{'{name}'}</code>=대표자,{' '}
            <code className="rounded bg-muted px-1">{'{company}'}</code>=업체명,{' '}
            <code className="rounded bg-muted px-1">{'{login_id}'}</code>=로그인 아이디,{' '}
            <code className="rounded bg-muted px-1">{'{password}'}</code>=비밀번호,{' '}
            <code className="rounded bg-muted px-1">{'{url}'}</code>=플랫폼 주소)
          </span>
        </Label>
        <Textarea
          id="mentee-guide-template"
          rows={12}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
      </div>

      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">미리보기 (예시 데이터)</p>
        <p className="whitespace-pre-wrap text-sm">{preview}</p>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? '저장 중…' : '문구 저장'}
        </Button>
      </div>
    </div>
  );
}
