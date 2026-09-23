'use client';

import { useMemo, useState, useTransition } from 'react';
import { ClipboardCheck, MessageSquare, Search } from 'lucide-react';

import type { MentorRosterItem } from '@/lib/data/mentors';
import {
  addMentorGroupReviewAction,
  checkPaymentDocsAction,
  deleteMentorGroupReviewAction,
  setMentorGroupMembershipAction,
  setMentorGroupWithholdingAction,
  setPaymentDocStateAction,
} from '@/lib/mentors/actions';
import { MentorName } from '@/components/common/mentor-name';
import { ViewAsStartButton } from '@/components/nextlab/view-as-start-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const DOC_LABEL = { resume: '이력서', bankbook: '통장', idCard: '신분증' } as const;
type DocKey = keyof typeof DOC_LABEL;
type DocState = '-' | 'O' | 'X';
/** P26-05: - (관리 안 함) → X (관리하지만 미수령) → O (이메일 등으로 수령) → - */
const NEXT_STATE: Record<DocState, DocState> = { '-': 'X', X: 'O', O: '-' };
const STATE_DESC: Record<DocState, string> = {
  '-': '이 멘토의 지급서류 셋트는 여기서 체크·관리하지 않음',
  X: '관리하기로 했으나 아직 미수령',
  O: '지급서류 셋트를 이메일 등으로 따로 수령함',
};
type Withholding = 'other_income' | 'business_income' | 'none' | '';
const WH_LABEL: Record<Withholding, string> = { '': '그룹 기본', other_income: '기타소득', business_income: '사업소득', none: '없음' };
const stateOf = (m: MentorRosterItem, k: DocKey): DocState => m.paymentDocs.states[k] ?? '-';
/** 미수령 = 관리 대상(X)인 항목이 하나라도 있는 멘토 (- 는 관리 안 함이므로 제외) */
const missing = (m: MentorRosterItem) => (['resume', 'bankbook', 'idCard'] as DocKey[]).some((k) => stateOf(m, k) === 'X');

/**
 * 멘토 명단 (P25-15·17 · P26-05/06) — 이름(n)+팝업 · 서명 -/O · 지급서류(-/X/O 상태버튼, 재인증) · 그룹 지정 · 원천징수(버튼→팝업 개별 변경) · 운영사 평가 · 관리(화면 보기·정보 수정).
 * readOnly(발주처 리포트)면 변경 컨트롤을 숨기고 열람만 한다. showUploads = 멘토 플랫폼 업로드 기능(기본 off)이 켜진 행사에서만 제출파일 링크 표시.
 */
export function MentorsRoster({
  mentors,
  groups,
  readOnly = false,
  caseHrefBase = '/nextlab/cases',
  showUploads = false,
}: {
  mentors: MentorRosterItem[];
  groups: { id: string; name: string }[];
  readOnly?: boolean;
  caseHrefBase?: string;
  showUploads?: boolean;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState<Record<DocKey, 'keep' | 'set' | 'clear'>>({ resume: 'set', bankbook: 'set', idCard: 'set' });
  const [password, setPassword] = useState('');
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewGroup, setReviewGroup] = useState('');
  const [rating, setRating] = useState<number | ''>('');
  const [memo, setMemo] = useState('');
  // 상태버튼: 처음 한 번 비밀번호 재인증 후 같은 화면에서는 기억한다 (새로고침하면 다시 묻는다)
  const [docPw, setDocPw] = useState('');
  const [pwAsk, setPwAsk] = useState<{ userId: string; kind: DocKey; next: DocState } | null>(null);
  // 원천징수 개별 변경 팝업 (P26-06) — 실수로 바뀌지 않도록 버튼→팝업→저장
  const [whEdit, setWhEdit] = useState<{ userId: string; name: string; supportTypeId: string; groupName: string; value: Withholding } | null>(null);

  const list = useMemo(() => {
    const q = query.trim();
    let arr = mentors;
    if (q) arr = arr.filter((m) => m.name.includes(q));
    if (onlyMissing) arr = arr.filter(missing);
    return [...arr].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [mentors, query, onlyMissing]);

  const applyDocState = (userId: string, kind: DocKey, next: DocState, pw: string) => {
    start(async () => {
      const r = await setPaymentDocStateAction({ userId, kind, state: next, password: pw });
      if (r.ok) {
        setDocPw(pw);
        setPwAsk(null);
        toast({ title: `${DOC_LABEL[kind]} → ${next}` });
      } else {
        setDocPw('');
        toast({ title: r.error, variant: 'destructive' });
      }
    });
  };
  const cycleDoc = (m: MentorRosterItem, kind: DocKey) => {
    const next = NEXT_STATE[stateOf(m, kind)];
    if (docPw) applyDocState(m.id, kind, next, docPw);
    else setPwAsk({ userId: m.id, kind, next });
  };

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

  const openEdit = (id: string) => {
    window.dispatchEvent(new CustomEvent('modu:edit-member', { detail: { id } }));
  };

  const stateBtn = (m: MentorRosterItem, k: DocKey) => {
    const s = stateOf(m, k);
    const up = m.paymentDocs.uploads[k];
    const cls = s === 'O' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : s === 'X' ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'border-border bg-background text-muted-foreground';
    const title = `${DOC_LABEL[k]} ${s} = ${STATE_DESC[s]}${m.paymentDocs[k] ? ` (${formatDate(m.paymentDocs[k]!)})` : ''}${showUploads ? (up ? ` · 멘토 제출 ${up.at ? formatDate(up.at) : ''}` : ' · 미제출') : ''}${readOnly ? '' : ' — 누르면 - → X → O 순으로 바뀝니다(비밀번호 재인증)'}`;
    return (
      <div key={k} className="flex flex-col items-center gap-0.5">
        <button type="button" disabled={readOnly || pending} onClick={() => cycleDoc(m, k)} title={title} className={cn('inline-flex h-7 min-w-[3.25rem] items-center justify-center gap-1 rounded-md border px-1.5 text-xs font-bold', cls, readOnly && 'cursor-default')}>
          <span className="font-normal text-[10px]">{DOC_LABEL[k]}</span> {s}
        </button>
        {showUploads && (up?.url ? (
          <a href={up.url} className="text-[10px] text-primary underline" title={up.name}>제출파일</a>
        ) : (
          <span className="text-[10px] text-muted-foreground">{up ? '제출됨' : '미제출'}</span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 text-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름 검색" className="h-9 w-44 pl-8" />
        </div>
        <label className="flex items-center gap-1"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> 지급서류 미수령만</label>
        <span className="text-muted-foreground">{list.length}명{!readOnly && ` · 선택 ${selected.size}명`}</span>
        {!readOnly && (
          <Button size="sm" className="ml-auto gap-1" disabled={selected.size === 0 || pending} onClick={() => setBulkOpen(!bulkOpen)}>
            <ClipboardCheck className="h-4 w-4" /> 수령 일괄 체크
          </Button>
        )}
      </div>
      {bulkOpen && !readOnly && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-muted/20 p-4 text-sm">
          <p className="font-semibold">선택한 {selected.size}명의 지급서류 수령 상태 — 파일은 보관하지 않고 수령 사실만 기록합니다.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(DOC_LABEL) as DocKey[]).map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{DOC_LABEL[k]}</span>
                <select value={bulk[k]} onChange={(e) => setBulk((b) => ({ ...b, [k]: e.target.value as 'keep' | 'set' | 'clear' }))} className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="keep">변경 없음</option>
                  <option value="set">수령 O (오늘)</option>
                  <option value="clear">관리 안 함(-) 으로</option>
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
              {!readOnly && <th className="px-3 py-2"><input type="checkbox" aria-label="전체" checked={list.length > 0 && list.every((m) => selected.has(m.id))} onChange={(e) => setSelected(e.target.checked ? new Set(list.map((m) => m.id)) : new Set())} /></th>}
              <th className="px-3 py-2">멘토</th>
              <th className="px-3 py-2 text-right">담당</th>
              <th className="px-3 py-2 text-right">회차</th>
              <th className="px-3 py-2 text-right">확정 실지급</th>
              <th className="px-3 py-2 text-right">만족도</th>
              <th className="px-3 py-2 text-right">운영사 평가</th>
              <th className="px-3 py-2 text-center">서명</th>
              <th className="px-3 py-2" title="- 관리 안 함 / X 관리하지만 미수령 / O 수령">지급서류</th>
              <th className="px-3 py-2">그룹 지정</th>
              <th className="px-3 py-2">원천징수</th>
              {!readOnly && <th className="px-3 py-2 text-right">관리</th>}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={readOnly ? 10 : 12} className="px-3 py-6 text-center text-muted-foreground">멘토가 없습니다.</td></tr>}
            {list.map((m) => (
              <tr key={m.id} className={`border-b align-top last:border-0 ${missing(m) ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                {!readOnly && <td className="px-3 py-2"><input type="checkbox" checked={selected.has(m.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} aria-label="선택" /></td>}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <MentorName id={m.id} name={m.name} count={m.activeCases} caseHrefBase={caseHrefBase} />
                    {m.activeCases > 0 ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700" title="배정된 멘티에 대해 확정된 멘토">확정</span>
                    ) : (
                      <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground" title="아직 멘티가 배정되지 않은 Pool(대기) 멘토">Pool</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.organization ? `${m.organization} · ` : ''}{m.phone ?? ''} {m.email ? `· ${m.email}` : ''}</div>
                  {m.expertise.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{m.expertise.slice(0, 10).map((e) => <span key={e} className="rounded bg-muted px-1 py-0.5 text-[10px]">{e}</span>)}</div>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.activeCases}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.totalRounds}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(m.settledNet)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.surveyAvg ?? '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{readOnly ? '·' : (m.reviewAvg ?? '-')}</td>
                <td className={cn('px-3 py-2 text-center font-bold', m.signatureRegistered ? 'text-emerald-700' : 'text-muted-foreground')} title={m.signatureRegistered ? '전자서명 등록됨' : '전자서명 미등록'}>{m.signatureRegistered ? 'O' : '-'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-start gap-1.5">{(['resume', 'bankbook', 'idCard'] as DocKey[]).map((k) => stateBtn(m, k))}</div>
                </td>
                <td className="px-3 py-2">
                  {/* 그룹 지정: 지정 없음 = 모든 그룹에서 사용 / 하나라도 지정 = 지정 그룹에서만 후보 */}
                  <div className="flex flex-wrap items-center gap-1">
                    {groups.map((g) => {
                      const on = m.designatedGroupIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          disabled={readOnly || pending}
                          title={on ? `${g.name} 지정됨 — 누르면 해제` : `${g.name} 에 지정`}
                          onClick={() => start(async () => { const r = await setMentorGroupMembershipAction(g.id, m.id, !on); toast(r.ok ? { title: on ? '그룹 지정 해제' : '그룹 지정' } : { title: r.error, variant: 'destructive' }); })}
                          className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', on ? 'border-violet-500 bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200' : 'border-border text-muted-foreground', readOnly && 'cursor-default')}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                  {m.designatedGroupIds.length === 0 && <div className="mt-0.5 text-[10px] text-muted-foreground">지정 없음 → 모든 그룹</div>}
                </td>
                <td className="px-3 py-2">
                  {/* 원천징수: 그룹 기본 권장. 개별 변경은 버튼 → 팝업에서만 (실수 방지, P26-06) */}
                  <div className="flex flex-col gap-1">
                    {m.groups.length === 0 && <span className="text-[10px] text-muted-foreground">-</span>}
                    {m.groups.map((g) => {
                      const v = (g.withholdingMethod ?? '') as Withholding;
                      return (
                        <button
                          key={g.supportTypeId}
                          type="button"
                          disabled={readOnly || pending}
                          onClick={() => setWhEdit({ userId: m.id, name: m.name, supportTypeId: g.supportTypeId, groupName: g.supportTypeName, value: v })}
                          title={readOnly ? `${g.supportTypeName} 원천징수: ${WH_LABEL[v]}` : `${g.supportTypeName} 원천징수 ${WH_LABEL[v]} — 누르면 개별 변경 팝업`}
                          className={cn('inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px]', v ? 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'border-border bg-background text-muted-foreground', readOnly && 'cursor-default')}
                        >
                          <span className="max-w-[5rem] truncate font-normal">{g.supportTypeName}</span>
                          <span className="font-semibold">{WH_LABEL[v]}</span>
                        </button>
                      );
                    })}
                  </div>
                </td>
                {!readOnly && (
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {m.isActive && <ViewAsStartButton targetUserId={m.id} targetName={m.name} size="sm" variant="outline" label="화면 보기" />}
                      <Button size="sm" variant="outline" onClick={() => openEdit(m.id)} title="아래 멘토 계정 관리에서 정보 수정 패널을 엽니다">정보 수정</Button>
                      <Button size="sm" variant="ghost" title="운영사 평가·메모" onClick={() => { setReviewFor(reviewFor === m.id ? null : m.id); setReviewGroup(m.groups[0]?.supportTypeId ?? groups[0]?.id ?? ''); }}>
                        <MessageSquare className="h-4 w-4" />
                        {m.reviews.length > 0 && <span className="ml-1 text-xs">{m.reviews.length}</span>}
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!pwAsk} onOpenChange={(o) => { if (!o) setPwAsk(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>지급서류 상태 변경 — 재인증</DialogTitle>
            <DialogDescription>{pwAsk ? `${DOC_LABEL[pwAsk.kind]} → ${pwAsk.next}` : ''} · 한 번 인증하면 이 화면에서는 다시 묻지 않습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (pwAsk) applyDocState(pwAsk.userId, pwAsk.kind, pwAsk.next, password); }} className="flex flex-col gap-3">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="내 비밀번호" autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwAsk(null)} disabled={pending}>취소</Button>
              <Button type="submit" disabled={pending || !password}>{pending ? '저장 중…' : '확인'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!whEdit} onOpenChange={(o) => { if (!o) setWhEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>원천징수 개별 변경</DialogTitle>
            <DialogDescription>
              {whEdit ? `${whEdit.name} · ${whEdit.groupName}` : ''} — 원천징수는 그룹 기본(운영 설정)으로 통일하는 것을 권장합니다. 이 멘토만 다르게 적용해야 할 때만 변경하세요. 변경은 이후 확정되는 정산부터 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          {whEdit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cur = whEdit;
                start(async () => {
                  const r = await setMentorGroupWithholdingAction(cur.supportTypeId, cur.userId, cur.value);
                  toast(r.ok ? { title: `원천징수: ${WH_LABEL[cur.value]}` } : { title: r.error, variant: 'destructive' });
                  if (r.ok) setWhEdit(null);
                });
              }}
              className="flex flex-col gap-3"
            >
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(WH_LABEL) as Withholding[]).map((k) => (
                  <label key={k || 'default'} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm', whEdit.value === k && 'border-primary bg-primary/5')}>
                    <input type="radio" name="wh" checked={whEdit.value === k} onChange={() => setWhEdit({ ...whEdit, value: k })} />
                    {WH_LABEL[k]}{k === '' && <span className="text-[10px] text-muted-foreground">(권장)</span>}
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setWhEdit(null)} disabled={pending}>취소</Button>
                <Button type="submit" disabled={pending}>{pending ? '저장 중…' : '저장'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {reviewFor && !readOnly && (() => {
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
