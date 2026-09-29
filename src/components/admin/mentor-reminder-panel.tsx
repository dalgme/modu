'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, RotateCcw, Save, Send, Sparkles, Users } from 'lucide-react';

import { clearMentorReminderGroupAction, saveMentorReminderSettingAction, sendMentorReminderNowAction, defaultMentorReminderTemplateAction } from '@/lib/notifications/sms-admin-actions';
import type { EligibleMentor, ReminderSetting } from '@/lib/notifications/mentor-weekly-reminder';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MINUTES = [0, 10, 20, 30, 40, 50];

export interface ReminderScope {
  /** null = 행사 공통 */
  id: string | null;
  name: string;
  /** 이 범위의 저장된 설정 행 (없으면 null — 그룹이면 공통을 따르는 상태) */
  setting: ReminderSetting | null;
  /** 이 범위(공통이면 override 없는 그룹 전부)의 현재 발송 대상 */
  eligible: EligibleMentor[];
  /** 공통 행이 덮는 그룹명 (공통 범위만) */
  coveredGroups: string[];
}

/** 리마인더 문구 자동 기입 필드 — 서버 치환(`renderMentorReminder`)이 지원하는 4개만 */
const REMINDER_FIELDS = [
  { key: 'program', label: '행사명', desc: '지금 운영 중인 행사(사업) 이름' },
  { key: 'group', label: '그룹명', desc: '사업 그룹 이름 (넣으면 그룹마다 한 통씩, 빼면 멘토마다 한 통으로 합쳐 발송)' },
  { key: 'mentor', label: '멘토 이름', desc: '문자를 받는 멘토 이름' },
  { key: 'companies', label: '보고서 남은 멘티', desc: '회차·보고서가 아직 남은 담당 멘티 이름 (여러 명이면 쉼표로 이어서)' },
] as const;

function render(template: string, vars: { program: string; group: string; mentor: string; companies: string[] }): string {
  return template.split('{program}').join(vars.program).split('{group}').join(vars.group).split('{mentor}').join(vars.mentor).split('{companies}').join(vars.companies.join(', '));
}

/**
 * 멘토 리마인더 문자 설정 패널 (문자 페이지 [멘토 리마인더] 미니탭, P29).
 * 범위 필(행사 공통 + 사업그룹)을 고르고 요일·시각·문구·자동발송을 저장한다. 그룹 저장 = 그 그룹 전용 override,
 * [그룹 설정 해제] = 행사 공통으로 복귀. 발송 대상 미리보기와 [지금 발송]은 범위별.
 */
export function MentorReminderPanel({ scopes, programName, initialScope, canEdit, smsReady }: { scopes: ReminderScope[]; programName: string; initialScope: string | null; canEdit: boolean; smsReady: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [scopeId, setScopeId] = useState<string | null>(scopes.some((s) => s.id === initialScope) ? initialScope : null);
  const scope = scopes.find((s) => s.id === scopeId) ?? scopes[0]!;
  const common = scopes.find((s) => s.id === null)?.setting ?? null;
  // 그룹에 자체 행이 없으면 공통 값을 초기값으로 보여준다(저장하면 그룹 전용이 된다)
  const base = scope.setting ?? common;
  const [draftKey, setDraftKey] = useState<string | null>(scopeId);
  const [enabled, setEnabled] = useState(base?.enabled ?? false);
  const [weekday, setWeekday] = useState(base?.weekday ?? 1);
  const [hour, setHour] = useState(base?.sendHour ?? 12);
  const [minute, setMinute] = useState(base?.sendMinute ?? 30);
  const [template, setTemplate] = useState(base?.template ?? '');
  const [busy, setBusy] = useState<'save' | 'send' | 'clear' | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  /** 커서 위치에 `{키}` 삽입 — 삽입 뒤로 커서 이동 */
  const insertField = (key: string) => {
    const token = `{${key}}`;
    const el = textRef.current;
    const start = el ? el.selectionStart : template.length;
    const end = el ? el.selectionEnd : template.length;
    setTemplate(template.slice(0, start) + token + template.slice(end));
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };
  if (draftKey !== scopeId) {
    // 범위가 바뀌면 그 범위의 저장값으로 폼을 다시 채운다
    setDraftKey(scopeId);
    setEnabled(base?.enabled ?? false);
    setWeekday(base?.weekday ?? 1);
    setHour(base?.sendHour ?? 12);
    setMinute(base?.sendMinute ?? 30);
    setTemplate(base?.template ?? '');
  }
  const sample = scope.eligible[0] ?? { name: '홍길동', companies: ['○○팀', '△△스타트업'] };
  const preview = useMemo(() => render(template, { program: programName, group: scope.id ? scope.name : (scope.coveredGroups[0] ?? '그룹명'), mentor: sample.name, companies: sample.companies }), [template, programName, scope, sample.name, sample.companies]);
  const inherits = !!scope.id && !scope.setting;

  const save = async () => {
    setBusy('save');
    const r = await saveMentorReminderSettingAction({ supportTypeId: scope.id, enabled, weekday, sendHour: hour, sendMinute: minute, template: template.trim() });
    setBusy(null);
    if (r.ok) {
      toast({ title: scope.id ? `${scope.name} 그룹 전용 설정을 저장했습니다.` : '행사 공통 설정을 저장했습니다.' });
      router.refresh();
    } else toast({ title: '저장 실패', description: r.error, variant: 'destructive' });
  };
  const clear = async () => {
    if (!scope.id || !window.confirm(`${scope.name} 그룹 전용 설정을 해제하고 행사 공통 설정을 따르게 할까요?`)) return;
    setBusy('clear');
    const r = await clearMentorReminderGroupAction(scope.id);
    setBusy(null);
    if (r.ok) {
      toast({ title: '그룹 설정을 해제했습니다. 행사 공통 설정이 적용됩니다.' });
      router.refresh();
    } else toast({ title: '해제 실패', description: r.error, variant: 'destructive' });
  };
  const sendNow = async () => {
    if (!scope.setting) {
      toast({ title: '먼저 [저장]으로 이 범위의 설정을 만든 뒤 발송하세요.', variant: 'destructive' });
      return;
    }
    if (!window.confirm(`${scope.name} 범위의 대상 멘토 ${scope.eligible.length}명에게 지금 리마인더 문자를 보낼까요? (저장된 문구 기준)`)) return;
    setBusy('send');
    const r = await sendMentorReminderNowAction(scope.id);
    setBusy(null);
    if (!r.ok) {
      toast({ title: '발송 실패', description: r.error, variant: 'destructive' });
      return;
    }
    if (r.skipped) {
      toast({ title: '발송하지 않음', description: r.reason === 'disabled' ? '자동발송이 꺼져 있습니다. 켜서 저장한 뒤 다시 시도하세요.' : '조건에 해당하는 멘토가 없습니다.', variant: 'destructive' });
      return;
    }
    toast({ title: `리마인더 발송 완료 (${r.sent}명)`, description: `대상 ${r.eligible} · 성공 ${r.sent} · 실패 ${r.failed}` });
    router.refresh();
  };
  const resetTemplate = async () => setTemplate(await defaultMentorReminderTemplateAction());

  return (
    <div className="flex flex-col gap-4">
      {/* 범위 필 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">범위</span>
        {scopes.map((s) => {
          const active = s.id === scope.id;
          const own = !!s.setting;
          return (
            <button key={s.id ?? 'common'} type="button" onClick={() => setScopeId(s.id)} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold', active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent')}>
              {s.name}
              {s.id && <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-primary-foreground/20' : own ? 'bg-violet-100 text-violet-800' : 'bg-muted text-muted-foreground')}>{own ? '전용' : '공통'}</span>}
              {s.setting && <span className={cn('h-1.5 w-1.5 rounded-full', s.setting.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {scope.id
          ? inherits
            ? `${scope.name} 그룹은 지금 행사 공통 설정을 따릅니다. 아래를 바꿔 [저장]하면 이 그룹 전용 설정이 됩니다.`
            : `${scope.name} 그룹 전용 설정입니다. [그룹 설정 해제]를 누르면 행사 공통으로 돌아갑니다.`
          : `행사 공통 설정 — 전용 설정이 없는 그룹(${scope.coveredGroups.length ? scope.coveredGroups.join(' · ') : '없음'})에 적용됩니다.`}
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4 rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarClock className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-semibold">자동 발송 요일 · 시각 (KST)</p>
                <p className="text-xs text-muted-foreground">매주 그 요일, 정한 시각이 지나면 1시간 안에 발송됩니다(매시 30분마다 확인). 담당 멘티 중 회차가 남은 멘티가 있는 멘토에게만 갑니다.</p>
              </div>
            </div>
            <button type="button" disabled={!canEdit} onClick={() => setEnabled((v) => !v)} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60', enabled ? 'border-status-approved/40 bg-status-approved/10 text-status-approved' : 'border-muted bg-muted text-muted-foreground')}>
              <span className={cn('h-2 w-2 rounded-full', enabled ? 'bg-status-approved' : 'bg-muted-foreground/50')} />
              {enabled ? '자동발송 켜짐' : '자동발송 꺼짐'}
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label>요일</Label>
              <div className="flex gap-1">
                {WEEKDAYS.map((w, i) => (
                  <button key={w} type="button" disabled={!canEdit} onClick={() => setWeekday(i)} className={cn('h-9 w-9 rounded-md border text-sm font-semibold', weekday === i ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent', i === 0 && weekday !== i && 'text-red-600', i === 6 && weekday !== i && 'text-blue-600')}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>시각</Label>
              <div className="flex items-center gap-1">
                <select value={hour} disabled={!canEdit} onChange={(e) => setHour(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-base tabular-nums sm:text-sm" aria-label="시">
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>)}
                </select>
                <select value={minute} disabled={!canEdit} onChange={(e) => setMinute(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-base tabular-nums sm:text-sm" aria-label="분">
                  {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-template">안내문 내용</Label>
            <Textarea id="reminder-template" ref={textRef} rows={4} value={template} disabled={!canEdit} onChange={(e) => setTemplate(e.target.value)} placeholder="[{program}] {mentor}멘토님, 이번주에도 [{companies}] 멘티에 대한 …" />
            <div className="flex items-center justify-between">
              <button type="button" disabled={!canEdit} onClick={resetTemplate} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 disabled:opacity-60"><RotateCcw className="h-3 w-3" /> 기본 문구로</button>
              <span className="text-[11px] text-muted-foreground">{template.length}자</span>
            </div>
            {/* 자동 기입 필드 — 누르면 커서 위치에 {키} 삽입 */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.04] p-2.5">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                자동 기입 필드
                <span className="font-normal text-muted-foreground">— 누르면 안내문의 커서 위치에 들어가고, 멘토마다 자기 정보로 바뀝니다</span>
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="자동 기입 필드">
                {REMINDER_FIELDS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => insertField(f.key)}
                    title={f.desc}
                    aria-label={`${f.label} : {${f.key}} 넣기`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-background px-2.5 py-1 text-left text-xs transition-colors hover:border-primary/60 hover:bg-primary/10 disabled:opacity-60"
                  >
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground">:</span>
                    <code className="font-mono text-[11px] text-primary">{`{${f.key}}`}</code>
                  </button>
                ))}
              </div>
              <ul className="grid gap-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
                {REMINDER_FIELDS.map((f) => (
                  <li key={f.key}>
                    <b className="font-semibold text-foreground/80">{f.label}</b> — {f.desc}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">미리보기 {scope.eligible.length > 0 ? `(예: ${sample.name} 멘토)` : '(예시 데이터)'}</p>
            <p className="whitespace-pre-wrap text-sm">{preview}</p>
          </div>
          {scope.setting?.lastResult && (
            <p className="text-xs text-muted-foreground">
              마지막 발송 {new Date(scope.setting.lastResult.at).toLocaleString('ko-KR')} — 대상 {scope.setting.lastResult.eligible} · 성공 {scope.setting.lastResult.sent} · 실패 {scope.setting.lastResult.failed}
            </p>
          )}
          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              {scope.id && scope.setting && (
                <Button type="button" variant="ghost" onClick={clear} disabled={busy !== null}>그룹 설정 해제</Button>
              )}
              <Button type="button" variant="outline" onClick={save} disabled={busy !== null}>
                <Save className="h-4 w-4" /> {busy === 'save' ? '저장 중…' : scope.id ? '이 그룹 전용으로 저장' : '행사 공통 저장'}
              </Button>
              <Button type="button" onClick={sendNow} disabled={!smsReady || busy !== null || scope.eligible.length === 0 || !scope.setting} title={!smsReady ? '문자 API(행사별 또는 플랫폼)가 필요합니다.' : !scope.setting ? '먼저 저장하세요' : undefined}>
                <Send className="h-4 w-4" /> {busy === 'send' ? '발송 중…' : '지금 발송'}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border bg-background p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" /> 현재 발송 대상 <span className="text-primary">{scope.eligible.length}</span>명
          </p>
          <p className="text-[11px] text-muted-foreground">{scope.id ? scope.name : (scope.coveredGroups.join(' · ') || '적용 그룹 없음')} · 회차가 남은 멘티가 있는 멘토</p>
          {scope.eligible.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">지금은 조건에 해당하는 멘토가 없습니다.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <ul className="divide-y text-sm">
                {scope.eligible.map((m) => (
                  <li key={m.mentorId} className="flex flex-col px-3 py-1.5">
                    <span className="font-medium">{m.name} {!m.phone && <span className="text-[10px] text-destructive">휴대폰 없음</span>}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.companies.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
