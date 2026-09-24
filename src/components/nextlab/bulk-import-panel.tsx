'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Info, RotateCcw } from 'lucide-react';

import type { ImportKind, ImportMode, ImportPreview, ImportResult, ImportResultRow } from '@/lib/import/bulk-import';
import { commitImportAction, finishImportAction, previewImportAction } from '@/lib/import/actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const KIND_LABELS: Record<ImportKind, string> = {
  mentee: '멘티 등록',
  mentor: '멘토 등록',
  nextlab: '운영사 담당자 등록',
  institution: '발주처 담당자 등록',
};

/** 청크 커밋 크기 (P31) — 서버 액션 시간 제한 안에서 계정 발급이 끝나는 크기 */
const CHUNK = 50;

const STATUS_LABEL: Record<ImportResultRow['status'], string> = { created: '신규 발급', linked: '기존 계정 연결', updated: '갱신', failed: '실패', skipped: '건너뜀' };

/** 엑셀 일괄 등록: 템플릿 → 업로드(검증 미리보기) → 확정(50행 청크) → 결과/오류 엑셀.
 *  fixedKind 를 주면 그 종류 전용(종류 토글 숨김) — 회원 명단 [회원 등록] 미니탭에서 사용.
 *  사업그룹은 컬럼이 아니라 여기서 선택한다(P23) — 멘티 필수, 멘토 선택(기본 미지정, P31).
 *  마지막 미리보기·결과는 sessionStorage(종류별)에 남겨 새로고침·탭 전환에도 유지된다 (P31). */
const COLUMN_HELP: Record<ImportKind, { cols: string; note: string }> = {
  mentee: { cols: '이름 · 닉네임 · 고유번호 · 휴대폰 · 이메일 · 권역 · 유형 · 아이디어 · 희망분야(콤마, 최대 6) · 재배치 희망여부(멘토 이름) · 비고', note: '이름·휴대폰은 필수(휴대폰 = 로그인 아이디·임시 비밀번호), 이메일이 없으면 자동 생성됩니다. 사업그룹은 컬럼이 아니라 아래에서 선택합니다.' },
  mentor: { cols: '이름 · 소속 · 휴대폰 · 이메일 · 분야(콤마, 최대 10) · 직위 · 소속멘토기관 · 권역 · 비고', note: '이름·휴대폰 필수. 그룹을 고르지 않으면 모든 그룹에서 배정 후보가 됩니다(권장).' },
  nextlab: { cols: '이름 · 이메일 · 휴대폰 · 소속 · 직위 · 등급(운영사: pl/pm/deputy_pm/observer 또는 한글) · 담당역할(운영사) · 비고', note: '이름·휴대폰 필수, 이메일이 없으면 자동 생성.' },
  institution: { cols: '이름 · 이메일 · 휴대폰 · 소속 · 직위 · (등급·담당역할은 비움) · 비고', note: '이름·휴대폰 필수, 이메일이 없으면 자동 생성.' },
};

interface Persisted {
  preview: ImportPreview | null;
  result: ImportResult | null;
  groupId: string;
  mode: ImportMode;
  fileName: string;
}
const storageKey = (kind: ImportKind) => `modu.import.${kind}`;

function loadPersisted(kind: ImportKind): Persisted | null {
  try {
    const raw = sessionStorage.getItem(storageKey(kind));
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}
function savePersisted(kind: ImportKind, p: Persisted) {
  try {
    sessionStorage.setItem(storageKey(kind), JSON.stringify(p));
  } catch {
    /* 저장 불가(사파리 프라이빗 등)는 무시 */
  }
}

/** 클라이언트에서 xlsx 파일 다운로드 (동적 import — 초기 번들에서 제외) */
async function downloadXlsx(fileName: string, header: string[], rows: unknown[][], sheet: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h, i) => ({ wch: Math.min(48, Math.max(8, ...[h, ...rows.slice(0, 200).map((r) => String(r[i] ?? ''))].map((s) => s.length * 1.6 + 2))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}

const mergeResult = (a: ImportResult | null, b: ImportResult): ImportResult =>
  a
    ? { created: a.created + b.created, linked: a.linked + b.linked, updated: a.updated + b.updated, reactivated: a.reactivated + b.reactivated, failed: [...a.failed, ...b.failed], skipped: [...a.skipped, ...b.skipped], credentials: [...a.credentials, ...b.credentials], rows: [...a.rows, ...b.rows] }
    : b;

export function BulkImportPanel({ groups, fixedKind, defaultGroupId }: { groups: { id: string; code: string; name: string }[]; fixedKind?: ImportKind; /** 현재 범위 그룹 — 멘티 업로드 그룹 기본값 (P28). 멘토는 기본 미지정 (P31) */ defaultGroupId?: string | null }) {
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  // fixedKind 가 있으면 항상 그 값을 쓴다 — useState 초기값만 믿으면 미니탭(멘티→멘토) 전환 시
  // 컴포넌트가 재사용되어 이전 종류가 남는다(멘토 탭에서 멘티 템플릿이 받아지던 버그).
  const [kindState, setKind] = useState<ImportKind>(fixedKind ?? 'mentee');
  const kind = fixedKind ?? kindState;
  const defaultGroupFor = useCallback((k: ImportKind) => (k === 'mentee' && defaultGroupId && groups.some((g) => g.id === defaultGroupId) ? defaultGroupId : ''), [defaultGroupId, groups]);
  const [groupId, setGroupId] = useState(() => defaultGroupFor(kind));
  const [mode, setMode] = useState<ImportMode>('create');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [allowReactivate, setAllowReactivate] = useState(false);
  const [allowSuspect, setAllowSuspect] = useState(false);
  const [showOnlyProblems, setShowOnlyProblems] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const needsGroup = kind === 'mentee' || kind === 'mentor';

  // 종류가 바뀌면 그 종류의 마지막 미리보기·결과를 복원 (P31). 복원 직후의 저장 effect 는 초기(빈) 상태를 덮어쓰므로 한 번 건너뛴다
  const skipSave = useRef(false);
  useEffect(() => {
    skipSave.current = true;
    const p = loadPersisted(kind);
    setPreview(p?.preview ?? null);
    setResult(p?.result ?? null);
    setMode(p?.mode ?? 'create');
    setFileName(p?.fileName ?? '');
    setGroupId(p?.groupId ?? defaultGroupFor(kind));
    setAllowReactivate(false);
    setAllowSuspect(false);
  }, [kind, defaultGroupFor]);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    savePersisted(kind, { preview, result, groupId, mode, fileName });
  }, [kind, preview, result, groupId, mode, fileName]);

  const doPreview = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast({ title: '엑셀 파일을 선택하세요.', variant: 'destructive' });
    if (kind === 'mentee' && !groupId) return toast({ title: '등록할 사업그룹을 먼저 선택하세요.', variant: 'destructive' });
    const fd = new FormData();
    fd.set('kind', kind);
    fd.set('group', groupId);
    fd.set('mode', mode);
    fd.set('file', f);
    setPending(true);
    previewImportAction(fd)
      .then((r) => {
        if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
        setPreview(r.preview);
        setResult(null);
        setFileName(f.name);
        setAllowReactivate(false);
        setAllowSuspect(false);
        if (r.preview.headers?.ignored.length) toast({ title: `무시한 헤더: ${r.preview.headers.ignored.join(', ')}` });
      })
      .catch((err) => toast({ title: `검증 실패: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' }))
      .finally(() => setPending(false));
  };

  const doCommit = async () => {
    if (!preview) return;
    const valid = preview.rows.filter((r) => r.errors.length === 0);
    const impact = preview.mode === 'update'
      ? [`갱신 ${preview.counts.update}행 (값이 있는 셀만 덮어씀)`, `오류 ${preview.errorCount}행 건너뜀`]
      : [
          `신규 계정 발급 ${preview.counts.new}명`,
          `기존 계정 연결 ${preview.counts.linked}명`,
          `재소속 ${allowReactivate ? preview.counts.reactivate : 0}명${!allowReactivate && preview.counts.reactivate ? ` (소속 해제 ${preview.counts.reactivate}명은 건너뜀)` : ''}`,
          ...(kind === 'mentor' && groupId ? [`그룹 전용화 ${preview.counts.groupExclusive}명 (지정 없음 → 이 그룹 전용)`] : []),
          ...(preview.counts.suspect ? [`동일인 의심 ${preview.counts.suspect}행 → ${allowSuspect ? '등록' : '건너뜀'}`] : []),
          `오류 ${preview.errorCount}행 건너뜀`,
        ];
    const ok = await confirm({
      title: `${KIND_LABELS[kind]} — 유효 ${valid.length}행을 확정할까요?`,
      description: `${CHUNK}행씩 나눠 등록하며 진행률이 표시됩니다.${preview.mode === 'create' && (kind === 'mentee' || kind === 'mentor') ? ' 등록이 끝나면 자동 매칭이 1회 실행됩니다.' : ''}`,
      impact,
      confirmLabel: '등록 시작',
    });
    if (!ok) return;
    setPending(true);
    setProgress({ done: 0, total: valid.length });
    let merged: ImportResult | null = null;
    let aborted: string | null = null;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK);
      try {
        const r = await commitImportAction({ kind, rows: chunk, groupId: groupId || null, mode: preview.mode, skipAutoMatch: true, allowReactivate, allowSuspectDuplicates: allowSuspect });
        if (!r.ok) {
          aborted = r.error;
          break;
        }
        merged = mergeResult(merged, r.result);
      } catch (err) {
        aborted = err instanceof Error ? err.message : String(err);
        break;
      }
      setProgress({ done: Math.min(i + CHUNK, valid.length), total: valid.length });
      setResult(merged);
    }
    if ((kind === 'mentee' || kind === 'mentor') && preview.mode === 'create' && merged) {
      try {
        await finishImportAction(kind);
      } catch {
        /* 자동 매칭 실패는 등록 결과에 영향 없음 */
      }
    }
    setPending(false);
    setProgress(null);
    if (merged) {
      setResult(merged);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      toast({ title: `등록 완료: 신규 ${merged.created} · 기존 연결 ${merged.linked}${merged.updated ? ` · 갱신 ${merged.updated}` : ''} · 실패 ${merged.failed.length}${merged.skipped.length ? ` · 건너뜀 ${merged.skipped.length}` : ''}` });
    }
    if (aborted) toast({ title: `등록이 중단되었습니다: ${aborted}`, description: merged ? '이미 등록된 행은 결과에 표시됩니다. 나머지 행은 파일에서 지우고 다시 올리세요.' : undefined, variant: 'destructive' });
  };

  const columns = useMemo(() => (preview ? Object.keys(preview.rows[0]?.values ?? {}) : []), [preview]);
  const visibleRows = useMemo(() => (preview ? (showOnlyProblems ? preview.rows.filter((r) => r.errors.length || r.warnings.length) : preview.rows) : []), [preview, showOnlyProblems]);

  const downloadErrors = () => {
    if (!preview) return;
    const bad = preview.rows.filter((r) => r.errors.length > 0);
    if (bad.length === 0) return toast({ title: '오류 행이 없습니다.' });
    void downloadXlsx(`${KIND_LABELS[kind]}_오류행_${fileName.replace(/\.[^.]+$/, '') || 'import'}.xlsx`, [...columns, '오류 사유', '경고'], bad.map((r) => [...columns.map((c) => r.values[c] ?? ''), r.errors.join(' / '), r.warnings.join(' / ')]), '오류 행');
  };
  const downloadResult = () => {
    if (!result) return;
    void downloadXlsx(`${KIND_LABELS[kind]}_등록결과_${fileName.replace(/\.[^.]+$/, '') || 'import'}.xlsx`, ['행', '이름', '휴대폰', '로그인(이메일)', '임시 비밀번호', '결과', '사유'], result.rows.map((r) => [r.line, r.name, r.phone, r.email, r.tempPassword ?? '', STATUS_LABEL[r.status], r.reason ?? '']), '등록 결과');
  };

  const canCommit = !!preview && preview.validCount > 0 && !pending && !(preview.counts.suspect > 0 && !allowSuspect && preview.counts.suspect === preview.validCount);

  return (
    <div className="flex flex-col gap-5">
      {dialog}
      <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-center gap-2">
          {fixedKind ? (
            <span className="rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-sm font-semibold">{KIND_LABELS[fixedKind]} — 엑셀 일괄</span>
          ) : (
            (['mentee', 'mentor'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
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
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <b className="text-foreground">엑셀 컬럼 순서:</b> {COLUMN_HELP[kind].cols}
          <br />
          {COLUMN_HELP[kind].note} 헤더는 첫 5행 안에서 자동으로 찾고 &ldquo;성명·핸드폰·연락처·메일&rdquo; 같은 별칭도 인식합니다. 휴대폰·이메일이 이미 있는 계정은 새로 만들지 않고 이 행사에 연결만 합니다. CSV(UTF-8/EUC-KR)도 됩니다.
        </p>
        {kind === 'mentee' && (
          <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="등록 모드">
            <span className="font-semibold">모드</span>
            {(['create', 'update'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                disabled={pending}
                onClick={() => { setMode(m); setPreview(null); }}
                className={cn('rounded-lg border px-3 py-1.5 text-sm', mode === m ? 'border-primary bg-primary/10 font-semibold' : 'text-muted-foreground')}
              >
                {m === 'create' ? '신규 등록' : '기존 정보 갱신'}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">{mode === 'create' ? '새 케이스·계정을 만듭니다. 같은 그룹에 이미 있는 멘티는 오류.' : '같은 그룹의 기존 멘티(휴대폰·이메일·고유번호로 식별)의 값이 있는 셀만 덮어씁니다. 계정·상태는 그대로.'}</span>
          </div>
        )}
        {needsGroup && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">사업그룹 {kind === 'mentee' ? <b className="text-destructive">*</b> : <span className="text-xs font-normal text-muted-foreground">(선택 — 지정하면 그 그룹 전용 멘토가 됩니다)</span>}</span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              disabled={pending}
            >
              <option value="">{kind === 'mentee' ? '그룹 선택 (필수)' : '그룹 미지정 (모든 그룹에서 후보 — 권장)'}</option>
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
          {(preview || result) && (
            <Button type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground" disabled={pending} onClick={() => { setPreview(null); setResult(null); setFileName(''); if (fileRef.current) fileRef.current.value = ''; }}>
              <RotateCcw className="h-3.5 w-3.5" /> 초기화
            </Button>
          )}
        </div>
      </section>

      {preview && (
        <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {fileName && <span className="mr-2 text-xs text-muted-foreground">{fileName}</span>}
              <b>{preview.rows.length}행</b> 중 유효 <b className="text-emerald-700">{preview.validCount}</b> · 오류{' '}
              <b className="text-destructive">{preview.errorCount}</b>
              {preview.warningCount > 0 && <> · 경고 <b className="text-amber-700">{preview.warningCount}</b></>}
              {preview.mode === 'update' ? <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-800">기존 정보 갱신</span> : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={showOnlyProblems} onChange={(e) => setShowOnlyProblems(e.target.checked)} className="h-4 w-4 accent-primary" /> 오류·경고만 보기
              </label>
              {preview.errorCount > 0 && (
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={downloadErrors}>
                  <FileSpreadsheet className="h-4 w-4" /> 오류 행만 엑셀로 받기
                </Button>
              )}
              <Button onClick={doCommit} disabled={!canCommit} className="gap-1">
                <CheckCircle2 className="h-4 w-4" /> {preview.mode === 'update' ? '유효 행 갱신' : '유효 행 등록'}
              </Button>
            </div>
          </div>
          {preview.headers && preview.headers.ignored.length > 0 && (
            <p className="flex items-start gap-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{preview.headers.headerLine}행을 헤더로 인식. 무시한 헤더: {preview.headers.ignored.join(', ')}</p>
          )}
          {(preview.counts.reactivate > 0 || preview.counts.suspect > 0 || (kind === 'mentor' && groupId && preview.counts.groupExclusive > 0)) && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-950/30">
              {preview.counts.reactivate > 0 && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allowReactivate} onChange={(e) => setAllowReactivate(e.target.checked)} className="h-4 w-4 accent-primary" />
                  <span><b>소속 해제 회원 재추가</b> — 이 행사 소속이 해제된 계정 {preview.counts.reactivate}명을 다시 소속시킵니다. 끄면 그 행은 건너뜁니다.</span>
                </label>
              )}
              {preview.counts.suspect > 0 && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allowSuspect} onChange={(e) => setAllowSuspect(e.target.checked)} className="h-4 w-4 accent-primary" />
                  <span><b>동일인 의심 행도 등록</b> — 같은 그룹에 같은 이름의 멘티가 있는 {preview.counts.suspect}행. 정말 다른 사람일 때만 켜세요(같은 사람이면 [기존 정보 갱신] 모드).</span>
                </label>
              )}
              {kind === 'mentor' && groupId && preview.counts.groupExclusive > 0 && (
                <p className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /> 지정 없음 → 그룹 전용으로 바뀌는 멘토 {preview.counts.groupExclusive}명. 모든 그룹에서 후보로 두려면 사업그룹을 &ldquo;미지정&rdquo;으로 바꾼 뒤 다시 검증하세요.</p>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-1">행</th>
                  <th className="px-2 py-1">검증</th>
                  {preview.mode === 'update' && <th className="px-2 py-1">변경 필드</th>}
                  {columns.map((c) => (
                    <th key={c} className="px-2 py-1 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.line} className={r.errors.length ? 'bg-destructive/5' : r.warnings.length ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}>
                    <td className="px-2 py-1 tabular-nums">{r.line}</td>
                    <td className="max-w-[320px] px-2 py-1">
                      {r.errors.length ? (
                        <span className="inline-flex items-start gap-1 text-destructive"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {r.errors.join(', ')}</span>
                      ) : r.existingCaseId ? (
                        <span className="text-sky-700">기존 케이스 갱신</span>
                      ) : r.existingUserId ? (
                        <span className="text-sky-700">기존 계정 연결{r.flags?.inactiveMembership ? ' (재소속)' : ''}</span>
                      ) : (
                        <span className="text-emerald-700">신규</span>
                      )}
                      {r.warnings.length > 0 && <div className="mt-0.5 text-amber-700">{r.warnings.join(' / ')}</div>}
                    </td>
                    {preview.mode === 'update' && <td className="px-2 py-1 whitespace-nowrap">{r.changes?.length ? r.changes.join(', ') : <span className="text-muted-foreground">-</span>}</td>}
                    {columns.map((c) => (
                      <td key={c} className="px-2 py-1 whitespace-nowrap">{r.values[c]}</td>
                    ))}
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={columns.length + 3} className="px-2 py-4 text-center text-muted-foreground">표시할 행이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {progress && (
        <section className="flex flex-col gap-2 rounded-xl border bg-background p-4" aria-live="polite">
          <p className="text-sm font-semibold">등록 중… {progress.done} / {progress.total}행</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">창을 닫지 마세요. {CHUNK}행씩 등록하며, 중단되어도 이미 등록된 행은 유지됩니다.</p>
        </section>
      )}

      {result && (
        <section className="flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              등록 결과 — 신규 {result.created} · 기존 연결 {result.linked}{result.updated ? ` · 갱신 ${result.updated}` : ''}{result.reactivated ? ` · 재소속 ${result.reactivated}` : ''} · 실패 {result.failed.length}{result.skipped.length ? ` · 건너뜀 ${result.skipped.length}` : ''}
            </p>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={downloadResult}>
              <FileSpreadsheet className="h-4 w-4" /> 등록 결과 엑셀
            </Button>
          </div>
          {result.credentials.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                신규 계정의 임시 비밀번호입니다 — <b>임시 비밀번호 = 본인 휴대폰 번호(숫자만)</b>, 최초 로그인 시 변경을 요구합니다. 따로 적어두지 않아도 회원 명단에서 [로그인 안내 문자 발송]을 누르면 아이디·임시 비밀번호가 자동 안내됩니다.
              </p>
              <div className="max-h-72 overflow-auto">
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
              </div>
            </>
          )}
          {result.failed.length > 0 && (
            <ul className="text-xs text-destructive">
              {result.failed.map((f) => (
                <li key={`f${f.line}`}>{f.line}행: {f.error}</li>
              ))}
            </ul>
          )}
          {result.skipped.length > 0 && (
            <ul className="text-xs text-amber-700">
              {result.skipped.map((f) => (
                <li key={`s${f.line}`}>{f.line}행 건너뜀: {f.reason}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
