'use client';

import { useEffect, useState, useTransition } from 'react';

import { importMembersFromProgramAction, listImportablePrograms, listProgramMentors, type ImportableMentor, type ImportableProgram } from '@/lib/programs/import-members-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/** 회원 등록 › 다른 행사에서 가져오기 (P30) — 행사 선택 → 멘토 체크리스트(전체 선택) → 일괄 소속 → 결과 카운트 */
export function ImportFromProgramPanel() {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [programs, setPrograms] = useState<ImportableProgram[] | null>(null);
  const [source, setSource] = useState('');
  const [mentors, setMentors] = useState<ImportableMentor[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ added: number; alreadyMember: number; profilesCopied: number; skipped: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listImportablePrograms().then((r) => {
      if (!alive) return;
      if (r.ok) setPrograms(r.programs);
      else {
        setPrograms([]);
        setLoadError(r.error);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const pickProgram = (id: string) => {
    setSource(id);
    setMentors([]);
    setSelected(new Set());
    setResult(null);
    if (!id) return;
    start(async () => {
      const r = await listProgramMentors(id);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setMentors(r.mentors);
    });
  };

  const selectable = mentors.filter((m) => !m.alreadyMember);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = () => {
    if (!source || selected.size === 0) return;
    if (!confirm(`${selected.size}명을 이 행사의 멘토로 소속시킬까요? 프로필(분야·권역 등)은 복사되고 그룹 지정·배정은 옮겨지지 않습니다.`)) return;
    start(async () => {
      const r = await importMembersFromProgramAction(source, Array.from(selected));
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setResult({ added: r.added, alreadyMember: r.alreadyMember, profilesCopied: r.profilesCopied, skipped: r.skipped });
      toast({ title: `멘토 ${r.added}명을 소속시켰습니다.` });
      setSelected(new Set());
      pickProgram(source);
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 text-sm">
      <div>
        <p className="font-semibold">다른 행사에서 멘토 가져오기</p>
        <p className="text-xs text-muted-foreground">내가 운영사로 소속된 다른 행사의 멘토 풀을 이 행사에 일괄 소속시킵니다. 계정은 하나이며 역할은 행사별로 붙습니다(설계 B). 로그인 안내 문자는 회원 명단에서 따로 보냅니다.</p>
      </div>
      {programs === null && <p className="text-xs text-muted-foreground">불러오는 중…</p>}
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {programs && programs.length === 0 && !loadError && <p className="text-xs text-muted-foreground">가져올 수 있는 다른 행사가 없습니다. (운영사로 소속된 행사만 원천이 됩니다)</p>}
      {programs && programs.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            원천 행사
            <select value={source} onChange={(e) => pickProgram(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" disabled={pending}>
              <option value="">선택</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · 멘토 {p.mentorCount}명{p.status !== 'active' ? ' (종료)' : ''}</option>
              ))}
            </select>
          </label>
          <Button onClick={submit} disabled={pending || !source || selected.size === 0} className="ml-auto">
            {pending ? '처리 중…' : `선택 ${selected.size}명 가져오기`}
          </Button>
        </div>
      )}
      {source && mentors.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2"><input type="checkbox" aria-label="전체 선택" checked={selectable.length > 0 && selectable.every((m) => selected.has(m.userId))} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((m) => m.userId)) : new Set())} /></th>
                <th className="px-3 py-2">이름</th><th className="px-3 py-2">소속</th><th className="px-3 py-2">분야</th><th className="px-3 py-2">이 행사</th>
              </tr>
            </thead>
            <tbody>
              {mentors.map((m) => (
                <tr key={m.userId} className={`border-b last:border-0 ${m.alreadyMember ? 'text-muted-foreground' : ''}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(m.userId)} onChange={() => toggle(m.userId)} disabled={m.alreadyMember} aria-label="선택" /></td>
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2">{m.organization ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{m.expertise.slice(0, 5).join(', ') || '-'}</td>
                  <td className="px-3 py-2 text-xs">{m.alreadyMember ? '이미 소속' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {source && !pending && mentors.length === 0 && <p className="text-xs text-muted-foreground">원천 행사에 활성 멘토가 없습니다.</p>}
      {result && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50/40 px-3 py-2 text-xs">
          추가 {result.added}명 · 이미 소속 {result.alreadyMember}명 · 프로필 복사 {result.profilesCopied}건{result.skipped ? ` · 건너뜀 ${result.skipped}` : ''}
        </p>
      )}
    </div>
  );
}
