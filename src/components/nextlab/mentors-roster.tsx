'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckCircle2, ClipboardCheck, MessageSquare, PenLine, XCircle } from 'lucide-react';

import type { MentorRosterItem } from '@/lib/data/mentors';
import { addMentorGroupReviewAction, checkPaymentDocsAction, deleteMentorGroupReviewAction, setMentorGroupDutyAction, setMentorGroupWithholdingAction } from '@/lib/mentors/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatKRW } from '@/lib/utils/format';

const DOC_LABEL = { resume: '이력서', bankbook: '통장사본', idCard: '신분증사본' } as const;
type DocKey = keyof typeof DOC_LABEL;

/** 멘토 명단 — 지급서류 체크(비밀번호 재인증·일괄) · 그룹별 원천징수 · 운영사 평가 메모 */
export function MentorsRoster({ mentors, groups }: { mentors: MentorRosterItem[]; groups: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState<Record<DocKey, 'keep' | 'set' | 'clear'>>({ resume: 'set', bankbook: 'set', idCard: 'set' });
  const [password, setPassword] = useState('');
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewGroup, setReviewGroup] = useState('');
  const [rating, setRating] = useState<number | ''>('');
  const [memo, setMemo] = useState('');

  const missing = (m: MentorRosterItem) => !m.paymentDocs.resume || !m.paymentDocs.bankbook || !m.paymentDocs.idCard;
  const list = useMemo(() => (onlyMissing ? mentors.filter(missing) : mentors), [mentors, onlyMissing]);

  const submitBulk = () => {
    if (selected.size === 0 || !password) return;
    const fields: { resume?: boolean; bankbook?: boolean; idCard?: boolean } = {};
    (Object.keys(bulk) as DocKey[]).forEach((k) => {
      if (bulk[k] !== 'keep') fields[k] = bulk[k] === 'set';
    });
    start(async () => {
      const r = await checkPaymentDocsAction({ userIds: Array.from(selected), fields, password });
      toast(r.ok ? { title: r.message ?? '저장' } : { title: r.error, variant: 'destructive' });
      setPassword('');
      if (r.ok) {
        setBulkOpen(false);
        setSelected(new Set());
      }
    });
  };

  const submitReview = () => {
    if (!reviewFor || !reviewGroup) return;
    start(async () => {
      const r = await addMentorGroupReviewAction({ supportTypeId: reviewGroup, mentorId: reviewFor, rating: rating === '' ? null : Number(rating), memo });
      toast(r.ok ? { title: '평가 메모를 남겼습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) {
        setMemo('');
        setRating('');
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 text-sm">
        <label className="flex items-center gap-1"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> 지급서류 미수령만</label>
        <span className="text-muted-foreground">선택 {selected.size}명</span>
        <Button size="sm" className="ml-auto gap-1" disabled={selected.size === 0 || pending} onClick={() => setBulkOpen(!bulkOpen)}>
          <ClipboardCheck className="h-4 w-4" /> 수령 일괄 체크
        </Button>
      </div>
      {bulkOpen && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-muted/20 p-4 text-sm">
          <p className="font-semibold">선택한 {selected.size}명의 지급서류 수령 상태 — 파일은 보관하지 않고 수령 사실만 기록합니다.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(DOC_LABEL) as DocKey[]).map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{DOC_LABEL[k]}</span>
                <select value={bulk[k]} onChange={(e) => setBulk((b) => ({ ...b, [k]: e.target.value as 'keep' | 'set' | 'clear' }))} className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="keep">변경 없음</option>
                  <option value="set">수령 (오늘)</option>
                  <option value="clear">미수령으로</option>
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">내 비밀번호 (재인증)</span>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-56" />
            </label>
            <Button size="sm" onClick={submitBulk} disabled={pending || !password}>{pending ? '저장 중…' : '저장'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setBulkOpen(false)} disabled={pending}>취소</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2"><input type="checkbox" aria-label="전체" checked={list.length > 0 && list.every((m) => selected.has(m.id))} onChange={(e) => setSelected(e.target.checked ? new Set(list.map((m) => m.id)) : new Set())} /></th>
              <th className="px-3 py-2">멘토</th>
              <th className="px-3 py-2 text-right">담당</th>
              <th className="px-3 py-2 text-right">회차</th>
              <th className="px-3 py-2 text-right">확정 실지급</th>
              <th className="px-3 py-2 text-right">만족도</th>
              <th className="px-3 py-2 text-right">운영사 평가</th>
              <th className="px-3 py-2">서명</th>
              <th className="px-3 py-2">이력서</th>
              <th className="px-3 py-2">통장</th>
              <th className="px-3 py-2">신분증</th>
              <th className="px-3 py-2">그룹 · 원천징수</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-muted-foreground">멘토가 없습니다.</td></tr>}
            {list.map((m) => (
              <tr key={m.id} className={`border-b last:border-0 ${missing(m) ? 'bg-amber-50/30' : ''}`}>
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(m.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} aria-label="선택" /></td>
                <td className="px-3 py-2">
                  <b>{m.name}</b>
                  <div className="text-xs text-muted-foreground">{m.phone ?? ''} {m.email ? `· ${m.email}` : ''}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.activeCases}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.totalRounds}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(m.settledNet)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.surveyAvg ?? '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.reviewAvg ?? '-'}</td>
                <td className="px-3 py-2">{m.signatureRegistered ? <PenLine className="h-4 w-4 text-emerald-600" /> : <span className="text-xs text-muted-foreground">미등록</span>}</td>
                {(['resume', 'bankbook', 'idCard'] as DocKey[]).map((k) => (
                  <td key={k} className="px-3 py-2" title={m.paymentDocs[k] ? formatDate(m.paymentDocs[k]) : '미수령'}>
                    {m.paymentDocs[k] ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground/60" />}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {m.groups.map((g) => (
                      <label key={g.supportTypeId} className="flex items-center gap-1 text-xs">
                        <span className="w-24 truncate">{g.supportTypeName}</span>
                        <select
                          defaultValue={g.withholdingMethod ?? ''}
                          disabled={pending}
                          onChange={(e) => start(async () => { const r = await setMentorGroupWithholdingAction(g.supportTypeId, m.id, e.target.value as 'other_income' | 'business_income' | 'none' | ''); toast(r.ok ? { title: '저장' } : { title: r.error, variant: 'destructive' }); })}
                          className="h-7 rounded border bg-background px-1 text-xs"
                        >
                          <option value="">그룹 기본</option>
                          <option value="other_income">기타소득</option>
                          <option value="business_income">사업소득</option>
                          <option value="none">없음</option>
                        </select>
                        <input
                          defaultValue={g.duty ?? ''}
                          placeholder="그룹 담당역할"
                          title="이 그룹에서의 담당역할 메모 (포커스를 벗어나면 저장)"
                          disabled={pending}
                          onBlur={(e) => { if (e.target.value !== (g.duty ?? '')) start(async () => { const r = await setMentorGroupDutyAction(g.supportTypeId, m.id, e.target.value); toast(r.ok ? { title: '저장' } : { title: r.error, variant: 'destructive' }); }); }}
                          className="h-7 w-28 rounded border bg-background px-1 text-xs"
                        />
                        
                      </label>
                    ))}
                    {m.groups.length === 0 && <span className="text-xs text-muted-foreground">그룹 명부 없음</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="ghost" title="운영사 평가·메모" onClick={() => { setReviewFor(reviewFor === m.id ? null : m.id); setReviewGroup(m.groups[0]?.supportTypeId ?? groups[0]?.id ?? ''); }}>
                    <MessageSquare className="h-4 w-4" />
                    {m.reviews.length > 0 && <span className="ml-1 text-xs">{m.reviews.length}</span>}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reviewFor && (() => {
        const m = mentors.find((x) => x.id === reviewFor);
        if (!m) return null;
        return (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-muted/20 p-4 text-sm">
            <p className="font-semibold">{m.name} — 운영사 평가·메모 (그룹 귀속 · 멘토 본인 비공개 · 삭제는 숨김 처리)</p>
            <div className="flex flex-wrap items-end gap-2">
              <select value={reviewGroup} onChange={(e) => setReviewGroup(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select value={rating} onChange={(e) => setRating(e.target.value === '' ? '' : Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">평점 없음</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}점</option>)}
              </select>
              <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="메모" className="min-w-[240px] flex-1" />
              <Button size="sm" onClick={submitReview} disabled={pending || !reviewGroup}>기록</Button>
            </div>
            <ul className="flex flex-col gap-1 text-xs">
              {m.reviews.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2 py-1">
                  <span>
                    [{r.supportTypeName}] {r.rating ? `${r.rating}점 · ` : ''}{r.memo ?? ''} <span className="text-muted-foreground">— {r.authorName} {formatDate(r.created_at)}</span>
                  </span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => start(async () => { const x = await deleteMentorGroupReviewAction(r.id); if (!x.ok) toast({ title: x.error, variant: 'destructive' }); })}>숨김</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}
