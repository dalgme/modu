'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Code2 } from 'lucide-react';

import { describeAudit, auditSource, auditTargetLabel } from '@/lib/audit/describe';
import { ExcelButton } from '@/components/common/excel-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/utils/format';

export interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  actor_id: string | null;
  actorName: string | null;
  program_id?: string | null;
  programName?: string | null;
  onBehalfOfName?: string | null;
  /** 대상 이름 (rows.ts 가 users/cases 에서 보강) */
  targetName?: string | null;
}

/** (P31) 서버 필터 모드 — 페이지가 searchParams(audit_*)로 rows.ts loadProgramAuditRows 를 호출하고, 표는 URL 만 바꾼다 */
export interface AuditServerFilter {
  /** 현재 필터 값 (rows.ts parseAuditQuery 결과) */
  from: string | null;
  to: string | null;
  actor: string | null;
  actionPrefix: string | null;
  entityId: string | null;
  q: string | null;
  /** 조건에 맞는 전체 건수·페이지 */
  total: number;
  page: number;
  pageSize: number;
  /** 수행자 셀렉트 옵션 (rows.ts listAuditActors) */
  actors: { id: string; name: string }[];
  /** 엑셀 내보내기 라우트 (같은 파라미터가 붙는다) */
  exportHref?: string;
  /** searchParams 접두 (기본 'audit_') */
  paramPrefix?: string;
}

const selectCls = 'h-8 rounded-md border border-input bg-background px-2 text-xs';

/** 액션 접두 셀렉트 — 카테고리 대신 서버가 like 로 거를 수 있는 접두 */
const ACTION_PREFIXES: { value: string; label: string }[] = [
  { value: 'case.', label: '케이스' },
  { value: 'round.', label: '회차' },
  { value: 'settlement.', label: '정산' },
  { value: 'batch.', label: '품의' },
  { value: 'settings.', label: '설정' },
  { value: 'account.', label: '계정' },
  { value: 'membership.', label: '회원' },
  { value: 'mentor.', label: '멘토' },
  { value: 'match.', label: '매칭' },
  { value: 'sms.', label: '문자' },
  { value: 'report.', label: '리포트' },
  { value: 'impersonation.', label: '대행' },
];

/**
 * 감사로그 표 — 기본 표는 사람에게 설명하는 문장, [소스] 버튼을 누르면 액션 코드·대상·메타데이터 원본을 팝업으로 보여준다.
 *  - server 를 주면 필터가 URL(searchParams)을 바꾸고 서버가 다시 조회한다(기간 KST·수행자·액션·검색·페이지). 엑셀은 같은 파라미터.
 *  - server 가 없으면 예전처럼 서버가 준 최근 N건 안에서 클라이언트 필터 (플랫폼 통합 화면).
 * showProgram: 통합(플랫폼) 화면에서 행사 컬럼 표시
 */
export function AuditTable({ rows, showProgram = false, server }: { rows: AuditRow[]; showProgram?: boolean; server?: AuditServerFilter }) {
  const [open, setOpen] = useState<AuditRow | null>(null);
  const [actor, setActor] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState(server?.q ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const prefix = server?.paramPrefix ?? 'audit_';

  const described = useMemo(() => rows.map((l) => ({ row: l, d: describeAudit(l), target: auditTargetLabel(l) })), [rows]);
  const actors = useMemo(() => Array.from(new Set(described.map((x) => x.row.actorName ?? '시스템'))).sort((a, b) => a.localeCompare(b, 'ko')), [described]);
  const categories = useMemo(() => Array.from(new Set(described.map((x) => x.d.category))).sort((a, b) => a.localeCompare(b, 'ko')), [described]);

  // ── 서버 필터 모드: URL 갱신
  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(`${prefix}${k}`, v);
      else next.delete(`${prefix}${k}`);
    }
    if (!('page' in patch)) next.delete(`${prefix}page`);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const exportQuery = () => {
    if (!server) return '';
    const p = new URLSearchParams();
    if (server.from) p.set('from', server.from);
    if (server.to) p.set('to', server.to);
    if (server.actor) p.set('actor', server.actor);
    if (server.actionPrefix) p.set('action', server.actionPrefix);
    if (server.entityId) p.set('entity', server.entityId);
    if (server.q) p.set('q', server.q);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  const filtered = server
    ? described
    : described.filter(({ row, d, target }) => {
        if (actor && (row.actorName ?? '시스템') !== actor) return false;
        if (category && d.category !== category) return false;
        if (from && row.created_at < `${from}T00:00:00`) return false;
        if (to && row.created_at > `${to}T23:59:59.999`) return false;
        if (q.trim()) {
          const needle = q.trim().toLowerCase();
          const hay = `${d.text} ${target ?? ''} ${row.action} ${row.actorName ?? ''} ${row.onBehalfOfName ?? ''}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });
  const hasFilter = server ? !!(server.from || server.to || server.actor || server.actionPrefix || server.entityId || server.q) : !!(actor || category || q || from || to);
  const lastPage = server ? Math.max(1, Math.ceil(server.total / server.pageSize)) : 1;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {server ? (
          <>
            <select value={server.actor ?? ''} onChange={(e) => setParam({ actor: e.target.value || null })} className={selectCls} aria-label="수행자">
              <option value="">수행자 전체</option>
              {server.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={server.actionPrefix ?? ''} onChange={(e) => setParam({ action: e.target.value || null })} className={selectCls} aria-label="구분">
              <option value="">구분 전체</option>
              {ACTION_PREFIXES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <form
              className="inline-flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                setParam({ q: q.trim() || null });
              }}
            >
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="액션·메타데이터 검색 (Enter)" className="h-8 w-52 text-xs" />
            </form>
            <label className="inline-flex items-center gap-1 text-muted-foreground">
              <input type="date" value={server.from ?? ''} onChange={(e) => setParam({ from: e.target.value || null })} className={selectCls} aria-label="시작일" />
              ~
              <input type="date" value={server.to ?? ''} onChange={(e) => setParam({ to: e.target.value || null })} className={selectCls} aria-label="종료일" />
            </label>
            <span className="text-muted-foreground">
              총 {server.total.toLocaleString('ko-KR')}건 · {server.page}/{lastPage} 페이지 (KST 기준, 서버 조회)
            </span>
            {hasFilter && (
              <button type="button" className="underline underline-offset-2 text-muted-foreground" onClick={() => { setQ(''); setParam({ from: null, to: null, actor: null, action: null, entity: null, q: null }); }}>
                필터 지우기
              </button>
            )}
            <span className="ml-auto inline-flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={server.page <= 1} onClick={() => setParam({ page: String(server.page - 1) })}>이전</Button>
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={server.page >= lastPage} onClick={() => setParam({ page: String(server.page + 1) })}>다음</Button>
              {server.exportHref && <ExcelButton href={`${server.exportHref}${exportQuery()}`} label="감사로그 엑셀" className="h-8" />}
            </span>
          </>
        ) : (
          <>
            <select value={actor} onChange={(e) => setActor(e.target.value)} className={selectCls} aria-label="수행자">
              <option value="">수행자 전체</option>
              {actors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls} aria-label="구분">
              <option value="">구분 전체</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="내용·대상 검색" className="h-8 w-44 text-xs" />
            <label className="inline-flex items-center gap-1 text-muted-foreground">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} aria-label="시작일" />
              ~
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} aria-label="종료일" />
            </label>
            <span className="text-muted-foreground">{filtered.length} / {rows.length}건 (화면에 내려온 최근 {rows.length}건 안에서 검색)</span>
            {hasFilter && (
              <button type="button" className="underline underline-offset-2 text-muted-foreground" onClick={() => { setActor(''); setCategory(''); setQ(''); setFrom(''); setTo(''); }}>
                필터 지우기
              </button>
            )}
          </>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">시각</th>
              {showProgram && <th className="px-3 py-2">행사</th>}
              <th className="px-3 py-2">수행자</th>
              <th className="px-3 py-2">구분</th>
              <th className="px-3 py-2">대상</th>
              <th className="px-3 py-2">내용</th>
              <th className="px-3 py-2 text-right">소스</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={showProgram ? 7 : 6} className="px-3 py-6 text-center text-muted-foreground">{hasFilter ? '조건에 맞는 기록이 없습니다.' : '기록이 없습니다.'}</td>
              </tr>
            )}
            {filtered.map(({ row: l, d, target }) => (
              <tr key={l.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">{formatDateTime(l.created_at)}</td>
                {showProgram && (
                  <td className="px-3 py-2 text-xs">
                    {l.programName ?? <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">플랫폼</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-xs">
                  {l.actorName ?? '시스템'}
                  {l.onBehalfOfName && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{l.onBehalfOfName} 대행</span>}
                </td>
                <td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{d.category}</span></td>
                <td className="max-w-[160px] truncate px-3 py-2 text-xs" title={target ?? undefined}>{target ?? <span className="text-muted-foreground">-</span>}</td>
                <td className="px-3 py-2">{d.text}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpen(l)} title="원본 로그 보기">
                    <Code2 className="h-3.5 w-3.5" /> 소스
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>로그 원본</DialogTitle>
            <DialogDescription>{open ? describeAudit(open).text : ''}</DialogDescription>
          </DialogHeader>
          {open && (
            <div className="flex flex-col gap-2 text-xs">
              <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
                <dt className="text-muted-foreground">액션 코드</dt><dd className="font-mono">{open.action}</dd>
                <dt className="text-muted-foreground">대상</dt><dd className="font-mono">{open.entity_type ?? '-'}{open.entity_id ? ` · ${open.entity_id}` : ''}{open.targetName ? ` (${open.targetName})` : ''}</dd>
                <dt className="text-muted-foreground">수행자 id</dt><dd className="font-mono">{open.actor_id ?? '(시스템)'}</dd>
                {showProgram && (<><dt className="text-muted-foreground">행사 id</dt><dd className="font-mono">{open.program_id ?? '(플랫폼)'}</dd></>)}
              </dl>
              <pre className="max-h-[50vh] overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">{auditSource(open)}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
