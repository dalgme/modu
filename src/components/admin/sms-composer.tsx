'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Plus, Send, Users, Clock, CalendarClock } from 'lucide-react';

import { sendBulkSmsAction, scheduleBulkSmsAction } from '@/lib/notifications/sms-admin-actions';
import type { SmsRecipient } from '@/lib/data/members';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { estimateSmsCost } from '@/lib/notifications/sms-cost';
import { formatKRW } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const ROLE_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'mentee', label: '멘티' },
  { key: 'mentor', label: '멘토' },
  { key: 'nextlab', label: '넥스트랩' },
  { key: 'institution', label: '진흥원' },
] as const;

export function SmsComposer({
  recipients,
  configured,
}: {
  recipients: SmsRecipient[];
  configured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<SmsRecipient[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  const selectedIds = useMemo(() => new Set(selected.map((r) => r.id)), [selected]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipients.filter((r) => {
      if (selectedIds.has(r.id)) return false;
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.phone ?? '').includes(q) ||
        ROLE_LABELS[r.role].includes(q)
      );
    });
  }, [recipients, selectedIds, query, roleFilter]);

  const cost = estimateSmsCost(text, selected.length);

  function add(r: SmsRecipient) {
    setSelected((prev) => [...prev, r]);
  }
  function remove(id: string) {
    setSelected((prev) => prev.filter((r) => r.id !== id));
  }
  function addAll() {
    setSelected((prev) => [...prev, ...candidates]);
  }

  // datetime-local 최소값 (지금부터 2분 뒤) — 과거 예약 방지
  const minScheduled = useMemo(() => {
    const d = new Date(Date.now() + 2 * 60 * 1000 - new Date().getTimezoneOffset() * 60 * 1000);
    return d.toISOString().slice(0, 16);
  }, []);

  async function send() {
    const ids = selected.map((r) => r.id);
    setSending(true);
    if (mode === 'scheduled') {
      if (!scheduledAt) {
        setSending(false);
        toast({ title: '예약 일시를 선택하세요.', variant: 'destructive' });
        return;
      }
      const iso = new Date(scheduledAt).toISOString();
      const result = await scheduleBulkSmsAction({ recipientIds: ids, text, scheduledAt: iso });
      setSending(false);
      if (result.ok) {
        toast({
          title: `예약 완료 (${result.total}명)`,
          description: `${scheduledAt.replace('T', ' ')} 에 발송됩니다.`,
        });
        setText('');
        setSelected([]);
        setScheduledAt('');
        setMode('now');
        setTimeout(() => router.refresh(), 1200);
      } else {
        toast({ title: '예약 실패', description: result.error, variant: 'destructive' });
      }
      return;
    }

    const result = await sendBulkSmsAction({ recipientIds: ids, text });
    setSending(false);
    if (result.ok) {
      toast({
        title: `문자 발송 완료 (성공 ${result.sent}건${result.failed ? ` · 실패 ${result.failed}건` : ''})`,
        description: '발송 리스트에서 상태를 확인하세요.',
      });
      setText('');
      setSelected([]);
      setTimeout(() => router.refresh(), 1500);
    } else {
      toast({ title: '발송 실패', description: result.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 수신자 선택 */}
      <div className="flex flex-col gap-2">
        <Label>수신자 선택 (회원 · 중복선택)</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setRoleFilter(f.key)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                roleFilter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="성명·연락처·소속 검색"
            className="pl-8"
          />
        </div>
        <div className="max-h-52 overflow-y-auto rounded-md border">
          {candidates.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">
              선택 가능한 회원이 없습니다.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={addAll}
                className="flex w-full items-center gap-1.5 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-primary hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
                검색 결과 {candidates.length}명 전체 추가
              </button>
              <ul>
                {candidates.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => add(r)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {ROLE_LABELS[r.role]}
                        </span>
                        <span className="font-medium">{r.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{r.phone}</span>
                      </span>
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* 선택된 수신자 리스트 (소속·성명·연락처) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            선택된 수신자 <span className="text-primary">{selected.length}</span>명
          </Label>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              전체 해제
            </button>
          )}
        </div>
        {selected.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            위에서 수신자를 선택하세요.
          </div>
        ) : (
          <div className="max-h-56 overflow-auto rounded-md border">
            <table className="w-full min-w-[360px] text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">소속</th>
                  <th className="px-3 py-2 font-medium">성명</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {selected.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-1.5 text-muted-foreground">{ROLE_LABELS[r.role]}</td>
                    <td className="px-3 py-1.5 font-medium">{r.name}</td>
                    <td className="px-3 py-1.5 tabular-nums">{r.phone}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        aria-label={`${r.name} 제거`}
                        className="rounded p-1 text-muted-foreground hover:bg-status-rejected/10 hover:text-status-rejected"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 메시지 + 실시간 비용 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bulk-text">메시지 (90byte 초과 시 LMS 자동전환)</Label>
        <Textarea
          id="bulk-text"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="발송할 메시지를 입력하세요."
        />
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {cost.kind} · {cost.bytes}byte · {formatKRW(cost.unitPrice)}/건 × {cost.recipientCount}명
          </span>
          <span className="font-semibold">
            예상 발송비용 <span className="text-primary">{formatKRW(cost.total)}</span>
            <span className="ml-1 text-xs font-normal text-muted-foreground">(부가세 별도)</span>
          </span>
        </div>
      </div>

      {/* 발송 방식: 즉시 / 예약 */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <Label>발송 방식</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('now')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              mode === 'now'
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Send className="h-4 w-4" />
            즉시 발송
          </button>
          <button
            type="button"
            onClick={() => setMode('scheduled')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              mode === 'scheduled'
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <CalendarClock className="h-4 w-4" />
            예약 발송
          </button>
        </div>
        {mode === 'scheduled' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scheduled-at" className="text-xs text-muted-foreground">
              발송 예약 일시 (선택 시각에 자동 발송 · 최대 5분 이내 오차)
            </Label>
            <Input
              id="scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              min={minScheduled}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="max-w-xs"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={send}
          disabled={
            !configured ||
            sending ||
            selected.length === 0 ||
            text.trim().length === 0 ||
            (mode === 'scheduled' && !scheduledAt)
          }
        >
          {mode === 'scheduled' ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {sending
            ? mode === 'scheduled'
              ? '예약 중…'
              : '발송 중…'
            : mode === 'scheduled'
              ? `${selected.length}명 예약 발송`
              : `${selected.length}명에게 발송`}
        </Button>
      </div>
    </div>
  );
}
