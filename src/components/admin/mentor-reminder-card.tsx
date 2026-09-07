'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Save, Send, Users } from 'lucide-react';

import {
  saveMentorReminderAction,
  sendMentorReminderNowAction,
} from '@/lib/notifications/sms-admin-actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface ReminderMentorPreview {
  name: string;
  companies: string[];
}

/** {mentor}/{companies} 치환 미리보기 */
function render(template: string, name: string, companies: string[]): string {
  return template.split('{mentor}').join(name).split('{companies}').join(companies.join(', '));
}

/**
 * 멘토 주간 자동 안내문 관리 카드 (문자 발송 페이지 상단 섹션).
 * - 매주 월요일 12:30 자동 발송되는 안내문 문구를 수정/저장
 * - 자동발송 on/off, 현재 발송 대상 미리보기, '지금 발송' 수동 트리거
 */
export function MentorReminderCard({
  initialTemplate,
  initialEnabled,
  eligible,
  configured,
}: {
  initialTemplate: string;
  initialEnabled: boolean;
  eligible: ReminderMentorPreview[];
  configured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [template, setTemplate] = useState(initialTemplate);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  const sample = eligible[0] ?? { name: '홍길동', companies: ['○○상회', '△△식당'] };
  const preview = useMemo(
    () => render(template, sample.name, sample.companies),
    [template, sample.name, sample.companies],
  );

  async function save() {
    setSaving(true);
    const r = await saveMentorReminderAction({ template: template.trim(), enabled });
    setSaving(false);
    if (r.ok) toast({ title: '안내문 설정을 저장했습니다.' });
    else toast({ title: '저장 실패', description: r.error, variant: 'destructive' });
  }

  async function sendNow() {
    setSendingNow(true);
    const r = await sendMentorReminderNowAction();
    setSendingNow(false);
    if (!r.ok) {
      toast({ title: '발송 실패', description: r.error, variant: 'destructive' });
      return;
    }
    if (r.skipped) {
      toast({
        title: '발송하지 않음',
        description:
          r.reason === 'disabled'
            ? '자동발송이 꺼져 있습니다. 켜고 다시 시도하세요.'
            : '문자 연동(Solapi)이 설정되지 않았습니다.',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: `안내문 발송 완료 (${r.sent}명)`,
      description: `대상 ${r.eligible}명 · 성공 ${r.sent} · 실패 ${r.failed}`,
    });
    setTimeout(() => router.refresh(), 1200);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">매주 월요일 12:30 자동 발송</p>
            <p className="text-xs text-muted-foreground">
              배정된 멘티기업 중 <b>&lsquo;지원신청서 작성&rsquo;을 완료하지 못한</b> 기업이 있는
              멘토에게만 발송됩니다.
            </p>
          </div>
        </div>
        {/* 자동발송 on/off */}
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
            enabled
              ? 'border-status-approved/40 bg-status-approved/10 text-status-approved'
              : 'border-muted bg-muted text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              enabled ? 'bg-status-approved' : 'bg-muted-foreground/50',
            )}
          />
          {enabled ? '자동발송 켜짐' : '자동발송 꺼짐'}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reminder-template">
          안내문 내용{' '}
          <span className="text-xs font-normal text-muted-foreground">
            (치환: <code className="rounded bg-muted px-1">{'{mentor}'}</code> = 멘토명,{' '}
            <code className="rounded bg-muted px-1">{'{companies}'}</code> = 미완료 기업명)
          </span>
        </Label>
        <Textarea
          id="reminder-template"
          rows={3}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="[재기지원사업] {mentor}멘토님, 이번주에도 [{companies}] 기업에 대한 …"
        />
      </div>

      {/* 미리보기 */}
      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          미리보기 {eligible.length > 0 ? `(예: ${sample.name}멘토)` : '(예시 데이터)'}
        </p>
        <p className="whitespace-pre-wrap text-sm">{preview}</p>
      </div>

      {/* 현재 발송 대상 */}
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="h-4 w-4 text-primary" />
          현재 발송 대상 <span className="text-primary">{eligible.length}</span>명
        </p>
        {eligible.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            지금은 조건에 해당하는 멘토가 없습니다.
          </p>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded-md border">
            <ul className="divide-y text-sm">
              {eligible.map((m, i) => (
                <li key={`${m.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="font-medium">{m.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {m.companies.join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? '저장 중…' : '문구 저장'}
        </Button>
        <Button
          type="button"
          onClick={sendNow}
          disabled={!configured || sendingNow || eligible.length === 0}
          title={!configured ? '문자 연동이 필요합니다.' : undefined}
        >
          <Send className="h-4 w-4" />
          {sendingNow ? '발송 중…' : '지금 발송'}
        </Button>
      </div>
    </div>
  );
}
