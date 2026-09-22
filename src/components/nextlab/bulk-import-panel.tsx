'use client';

import { useRef, useState, useTransition } from 'react';
import { Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';

import type { ImportKind, ImportPreview, ImportResult } from '@/lib/import/bulk-import';
import { commitImportAction, previewImportAction } from '@/lib/import/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const KIND_LABELS: Record<ImportKind, string> = {
  mentee: '멘티 등록',
  mentor: '멘토 등록',
  nextlab: '운영사 담당자 등록',
  institution: '발주처 담당자 등록',
};

/** 엑셀 일괄 등록: 템플릿 → 업로드(검증 미리보기) → 확정 → 임시 비밀번호 표.
 *  fixedKind 를 주면 그 종류 전용(종류 토글 숨김) — 회원 명단 [회원 등록] 미니탭에서 사용.
 *  사업그룹은 컬럼이 아니라 여기서 선택한다(P23) — 멘티 필수, 멘토 선택. */
export function BulkImportPanel({ groups, fixedKind }: { groups: { id: string; code: string; name: string }[]; fixedKind?: ImportKind }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  // fixedKind 가 있으면 항상 그 값을 쓴다 — useState 초기값만 믿으면 미니탭(멘티→멘토) 전환 시
  // 컴포넌트가 재사용되어 이전 종류가 남는다(멘토 탭에서 멘티 템플릿이 받아지던 버그).
  const [kindState, setKind] = useState<ImportKind>(fixedKind ?? 'mentee');
  const kind = fixedKind ?? kindState;
  const [groupId, setGroupId] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const needsGroup = kind === 'mentee' || kind === 'mentor';

  const doPreview = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast({ title: '엑셀 파일을 선택하세요.', variant: 'destructive' });
    if (kind === 'mentee' && !groupId) return toast({ title: '등록할 사업그룹을 먼저 선택하세요.', variant: 'destructive' });
    const fd = new FormData();
    fd.set('kind', kind);
    fd.set('group', groupId);
    fd.set('file', f);
    start(async () => {
      const r = await previewImportAction(fd);
      if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
      setPreview(r.preview);
      setResult(null);
    });
  };

  const doCommit = () => {
    if (!preview) return;
    if (!confirm(`유효한 ${preview.validCount}행을 등록할까요? 오류 ${preview.errorCount}행은 건너뜁니다.`)) return;
    start(async () => {
      const r = await commitImportAction(preview.kind, preview.rows, groupId || null);
      if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
      setResult(r.result);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      toast({ title: `등록 완료: 신규 ${r.result.created}, 기존 연결 ${r.result.linked}, 실패 ${r.result.failed.length}` });
    });
  };

  const columns = preview ? Object.keys(preview.rows[0]?.values ?? {}) : [];

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-center gap-2">
          {fixedKind ? (
            <span className="rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-sm font-semibold">{KIND_LABELS[fixedKind]} — 엑셀 일괄</span>
          ) : (
            (['mentee', 'mentor'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setPreview(null);
                  setResult(null);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm ${kind === k ? 'border-primary bg-primary/10 font-semibold' : ''}`}
              >
                {KIND_LABELS[k]}
              </button>
            ))
          )}
          <Button asChild variant="outline" size="sm" className="ml-auto gap-1">
            <a href={`/api/nextlab/import-template?kind=${kind}`}>
              <Download className="h-4 w-4" /> 템플릿 다운로드
            </a>
          </Button>
        </div>
        {needsGroup && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">사업그룹 {kind === 'mentee' ? <b className="text-destructive">*</b> : <span className="text-xs font-normal text-muted-foreground">(선택 — 그룹 명부에도 올릴 때)</span>}</span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              disabled={pending}
            >
              <option value="">{kind === 'mentee' ? '그룹 선택 (필수)' : '그룹 미지정 (행사 공통 Pool)'}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">파일의 모든 행이 이 그룹으로 등록됩니다.</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="max-w-sm" disabled={pending} />
          <Button onClick={doPreview} disabled={pending} className="gap-1">
            <Upload className="h-4 w-4" /> 검증하기
          </Button>
        </div>
      </section>

      {preview && (
        <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <b>{preview.rows.length}행</b> 중 유효 <b className="text-emerald-700">{preview.validCount}</b> · 오류{' '}
              <b className="text-destructive">{preview.errorCount}</b>
            </p>
            <Button onClick={doCommit} disabled={pending || preview.validCount === 0} className="gap-1">
              <CheckCircle2 className="h-4 w-4" /> 유효 행 등록
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-1">행</th>
                  <th className="px-2 py-1">검증</th>
                  {columns.map((c) => (
                    <th key={c} className="px-2 py-1 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className={r.errors.length ? 'bg-destructive/5' : ''}>
                    <td className="px-2 py-1 tabular-nums">{r.line}</td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      {r.errors.length ? (
                        <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> {r.errors.join(', ')}</span>
                      ) : r.existingUserId ? (
                        <span className="text-sky-700">기존 계정 연결</span>
                      ) : (
                        <span className="text-emerald-700">신규</span>
                      )}
                    </td>
                    {columns.map((c) => (
                      <td key={c} className="px-2 py-1 whitespace-nowrap">{r.values[c]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && (
        <section className="flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50/40 p-4">
          <p className="text-sm font-semibold">
            등록 결과 — 신규 {result.created} · 기존 연결 {result.linked} · 실패 {result.failed.length}
          </p>
          {result.credentials.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                신규 계정의 임시 비밀번호입니다(최초 로그인 시 변경 강제). 이 화면을 벗어나면 다시 볼 수 없으니 지금 안내하세요.
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-1">행</th><th className="px-2 py-1">이름</th><th className="px-2 py-1">로그인(이메일)</th><th className="px-2 py-1">임시 비밀번호</th>
                  </tr>
                </thead>
                <tbody>
                  {result.credentials.map((c) => (
                    <tr key={c.line}><td className="px-2 py-1">{c.line}</td><td className="px-2 py-1">{c.name}</td><td className="px-2 py-1">{c.email}</td><td className="px-2 py-1 font-mono">{c.tempPassword}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {result.failed.length > 0 && (
            <ul className="text-xs text-destructive">
              {result.failed.map((f) => (
                <li key={f.line}>{f.line}행: {f.error}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
