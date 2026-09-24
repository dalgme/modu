import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { AUDIT_MAX_LIMIT, loadProgramAuditRows, parseAuditQuery } from '@/lib/audit/rows';
import { describeAudit, auditTargetLabel } from '@/lib/audit/describe';

export const dynamic = 'force-dynamic';

/**
 * (P31) 행사 감사로그 엑셀 — 운영사(행사 컨텍스트 범위). 표와 같은 파라미터(from,to,actor,action,entity,q — 접두 없음), 최대 1,000건.
 */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const params = { ...parseAuditQuery(sp, ''), limit: AUDIT_MAX_LIMIT, offset: 0 };
  const rows = await loadProgramAuditRows(ctx.programId, params);
  const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  const sheet = XLSX.utils.aoa_to_sheet([
    [`${ctx.program.name} 감사로그`, `조건: ${[params.from && `시작 ${params.from}`, params.to && `종료 ${params.to}`, params.actionPrefix && `구분 ${params.actionPrefix}`, params.q && `검색 "${params.q}"`].filter(Boolean).join(' · ') || '전체'} · ${rows.length}건${rows.length >= AUDIT_MAX_LIMIT ? ' (최대 1,000건 — 기간을 좁히세요)' : ''}`],
    [],
    ['시각(KST)', '수행자', '대행 명의', '구분', '액션 코드', '대상', '내용', '대상 종류', '대상 id', '메타데이터'],
    ...rows.map((r) => {
      const d = describeAudit(r);
      return [kst(r.created_at), r.actorName ?? '시스템', r.onBehalfOfName ?? '', d.category, r.action, auditTargetLabel(r) ?? '', d.text, r.entity_type ?? '', r.entity_id ?? '', r.metadata ? JSON.stringify(r.metadata) : ''];
    }),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, '감사로그');
  const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
  const filename = encodeURIComponent(`${ctx.program.name}_감사로그.xlsx`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
