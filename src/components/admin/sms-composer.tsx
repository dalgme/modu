'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Plus, Send, Users, Clock, CalendarClock, ClipboardPaste, RotateCcw } from 'lucide-react';

import { sendBulkSmsAction, scheduleBulkSmsAction } from '@/lib/notifications/sms-admin-actions';
import type { SmsRecipient } from '@/lib/data/members';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { estimateSmsCost } from '@/lib/notifications/sms-cost';
import { formatKRW } from '@/lib/utils/format';
import { normalizePhone } from '@/lib/utils/phone';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
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
  { key: 'nextlab', label: '운영사' },
  { key: 'institution', label: '발주처' },
] as const;

/** 검색어 정규화 — 숫자는 하이픈·공백을 떼고 비교, 문자는 소문자 */
const norm = (s: string) => s.trim().toLowerCase();
const digitsOnly = (s: string) => s.replace(/\D/g, '');

/**
 * 문자 발송 작성 — 수신자 선택(역할 칩 · 이름/휴대폰 검색) → 문안 → 즉시/예약.
 * 발송 전 ConfirmDialog 로 수신자 수 · 예상 비용 · 발신 경로 · 문안 미리보기를 보여준다.
 * `canSend=false`(발주처 열람)면 발송·예약 버튼이 잠긴다.
 */
export function SmsComposer({
  recipients,
  configured,
  programSmsActive = false,
  canSend = true,
  scopeLabel,
  initialRecipientIds = [],
}: {
  recipients: SmsRecipient[];
  /** 미리 선택할 수신자 id (`?to=<userId>`, P31) */
  initialRecipientIds?: string[];
  /** 플랫폼 공통 API 연동 여부 */
  configured: boolean;
  /** 행사별 문자 API 등록·활성 여부 — 있으면 그 발신번호가 우선 */
  programSmsActive?: boolean;
  /** 운영사 문자 권한자만 true. 발주처는 열람 전용 */
  canSend?: boolean;
  /** 현재 범위 이름 (행사 전체 / 그룹명) — 확인창 안내 */
  scopeLabel?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<SmsRecipient[]>(() => recipients.filter((r) => initialRecipientIds.includes(r.id)));
  const [query, setQuery] = useState('');
  // 번호 붙여넣기 (P31): 줄·콤마로 구분된 번호 → 정규화 → 회원 매칭. 미소속 번호는 발송하지 않고 표시만
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);
  // 직전 발송의 실패 수신자 — [실패자만 다시 선택]
  const [lastFailed, setLastFailed] = useState<{ id: string; name: string; phone: string }[]>([]);
  const initialKey = initialRecipientIds.join(',');
  useEffect(() => {
    if (!initialKey) return;
    const ids = initialKey.split(',');
    setSelected((prev) => {
      const have = new Set(prev.map((r) => r.id));
      return [...prev, ...recipients.filter((r) => ids.includes(r.id) && !have.has(r.id))];
    });
  }, [initialKey, recipients]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((r) => r.id)), [selected]);
  const sendable = configured || programSmsActive;

  const candidates = useMemo(() => {
    const q = norm(query);
    const qDigits = digitsOnly(query);
    return recipients.filter((r) => {
      if (selectedIds.has(r.id)) return false;
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (!q) return true;
      if (qDigits.length >= 3 && digitsOnly(r.phone ?? '').includes(qDigits)) return true;
      return r.name.toLowerCase().includes(q) || (r.businessName ?? '').toLowerCase().includes(q) || ROLE_LABELS[r.role].includes(q);
    });
  }, [recipients, selectedIds, query, roleFilter]);

  const roleCounts = useMemo(() => {
    const m: Record<string, number> = { all: recipients.length };
    for (const r of recipients) m[r.role] = (m[r.role] ?? 0) + 1;
    return m;
  }, [recipients]);

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
  function applyPaste() {
    const tokens = pasteText.split(/[\n,;\t ]+/).map((t) => t.trim()).filter(Boolean);
    const byPhone = new Map<string, SmsRecipient>();
    for (const r of recipients) {
      const p = normalizePhone(r.phone);
      if (p) byPhone.set(p, r);
    }
    const found: SmsRecipient[] = [];
    const miss: string[] = [];
    const seen = new Set<string>();
    for (const t of tokens) {
      const p = normalizePhone(t);
      if (!p) { miss.push(`${t} (형식 오류)`); continue; }
      if (seen.has(p)) continue;
      seen.add(p);
      const r = byPhone.get(p);
      if (r) found.push(r);
      else miss.push(p);
    }
    setSelected((prev) => {
      const have = new Set(prev.map((r) => r.id));
      return [...prev, ...found.filter((r) => !have.has(r.id))];
    });
    setUnmatched(miss);
    setPasteText('');
    setPasteOpen(false);
    toast({ title: `회원 ${found.length}명 추가${miss.length ? ` · 미소속 ${miss.length}건 제외` : ''}` });
  }
  function reselectFailed() {
    const ids = new Set(lastFailed.map((f) => f.id));
    setSelected(recipients.filter((r) => ids.has(r.id)));
  }
  /** 미리보기용 {name} 치환 샘플 */
  const previewText = text.includes('{name}') ? text.replaceAll('{name}', selected[0]?.name ?? '홍길동') : text;

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
      setConfirmOpen(false);
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
    setConfirmOpen(false);
    if (result.ok) {
      toast({
        title: `문자 발송 완료 (성공 ${result.sent}건${result.failed ? ` · 실패 ${result.failed}건` : ''})`,
        description: result.failed ? '실패 수신자는 아래 [실패자만 다시 선택]으로 재발송할 수 있습니다.' : '발송 현황에서 상태를 확인하세요.',
      });
      setLastFailed(result.failedRecipients ?? []);
      if (!result.failed) setText('');
      setSelected([]);
      setTimeout(() => router.refresh(), 1500);
    } else {
      toast({ title: '발송 실패', description: result.error, variant: 'destructive' });
    }
  }

  const disabledReason = !canSend
    ? '문자 발송은 운영사 문자 권한 담당자만 할 수 있습니다 (발주처는 열람 전용).'
    : !sendable
      ? '플랫폼 공통 또는 행사별 문자 API 가 설정되지 않았습니다.'
      : undefined;
  const ready = canSend && sendable && !sending && selected.length > 0 && text.trim().length > 0 && (mode !== 'scheduled' || !!scheduledAt);
  const route = programSmsActive ? '행사별 문자 API (행사 발신번호)' : configured ? '플랫폼 공통 발신번호' : '미설정';

  return (
    <div className="flex flex-col gap-4">
      {/* 수신자 선택 */}
      <div className="flex flex-col gap-2">
        <Label>수신자 선택 (회원 · 중복선택){scopeLabel ? <span className="ml-1 text-xs font-normal text-muted-foreground">· 범위: {scopeLabel}</span> : null}</Label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="역할 필터">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={roleFilter === f.key}
              onClick={() => setRoleFilter(f.key)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                roleFilter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {f.label}
              <span className="ml-1 tabular-nums opacity-70">{roleCounts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 휴대폰 뒷자리 · 소속(멘티) 검색"
            aria-label="수신자 검색"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => setPasteOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-muted-foreground hover:bg-accent" aria-expanded={pasteOpen}>
            <ClipboardPaste className="h-3.5 w-3.5" /> 번호 붙여넣기
          </button>
          {lastFailed.length > 0 && (
            <button type="button" onClick={reselectFailed} className="inline-flex items-center gap-1 rounded-md border border-status-rejected/40 px-2 py-1 font-medium text-status-rejected hover:bg-status-rejected/10">
              <RotateCcw className="h-3.5 w-3.5" /> 실패자만 다시 선택 ({lastFailed.length})
            </button>
          )}
        </div>
        {pasteOpen && (
          <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2">
            <Textarea rows={3} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'010-1234-5678\n01098765432, +82 10 5555 1234 …'} aria-label="붙여넣을 번호" />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>줄·콤마·공백으로 구분. 이 범위의 회원 번호만 추가되고 미소속 번호는 발송하지 않습니다.</span>
              <Button type="button" size="sm" onClick={applyPaste} disabled={!pasteText.trim()}>추가</Button>
            </div>
          </div>
        )}
        {unmatched.length > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50/60 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            미소속(발송 제외) {unmatched.length}건: {unmatched.slice(0, 20).join(', ')}{unmatched.length > 20 ? ' …' : ''}
            <button type="button" className="ml-2 underline" onClick={() => setUnmatched([])}>지우기</button>
          </p>
        )}
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
                        {r.businessName && <span className="truncate text-xs text-muted-foreground">{r.businessName}</span>}
                        <span className="truncate text-xs tabular-nums text-muted-foreground">{r.phone}</span>
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
                  <th className="px-3 py-2 font-medium">소속 / 역할</th>
                  <th className="px-3 py-2 font-medium">성명</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {selected.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-1.5 text-muted-foreground">{r.businessName ? r.businessName : ROLE_LABELS[r.role]}</td>
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
        <Label htmlFor="bulk-text">메시지 (90byte 초과 시 LMS 자동전환) <span className="ml-1 text-xs font-normal text-muted-foreground">· <code>{'{name}'}</code> 은 수신자 이름으로 바뀝니다</span></Label>
        <Textarea
          id="bulk-text"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="발송할 메시지를 입력하세요. {name} 을 쓰면 수신자 이름으로 치환됩니다."
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
            aria-pressed={mode === 'now'}
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
            aria-pressed={mode === 'scheduled'}
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        {disabledReason && <span className="text-xs text-muted-foreground">{disabledReason}</span>}
        <span title={disabledReason}>
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={!ready} aria-disabled={!ready}>
            {mode === 'scheduled' ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {sending
              ? mode === 'scheduled'
                ? '예약 중…'
                : '발송 중…'
              : mode === 'scheduled'
                ? `${selected.length}명 예약 발송`
                : `${selected.length}명에게 발송`}
          </Button>
        </span>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={mode === 'scheduled' ? '예약 발송 확인' : '문자 발송 확인'}
        description={mode === 'scheduled' ? `${scheduledAt.replace('T', ' ')} 에 아래 문안이 자동 발송됩니다.` : '아래 문안이 즉시 발송됩니다. 발송 후에는 취소할 수 없습니다.'}
        impact={[
          `수신자 ${selected.length}명${scopeLabel ? ` (범위: ${scopeLabel})` : ''}`,
          `예상 비용 ${formatKRW(cost.total)} (${cost.kind} ${formatKRW(cost.unitPrice)}/건 · 부가세 별도)`,
          `발신 경로: ${route}`,
        ]}
        confirmLabel={mode === 'scheduled' ? '예약' : '발송'}
        pending={sending}
        onConfirm={send}
        className="max-w-lg"
      >
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-1 text-[11px] text-muted-foreground">문안 미리보기 · {cost.bytes}byte{text.includes('{name}') ? ' · {name} 치환 예시' : ''}</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">{previewText}</pre>
        </div>
      </ConfirmDialog>
    </div>
  );
}
