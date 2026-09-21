import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { listProgramMembers } from '@/lib/data/members';
import { listProgramMentors } from '@/lib/data/mentors';
import { listCases } from '@/lib/data/cases';
import { CASE_STATUS_META } from '@/types/case-status';
import { GRADE_LABELS, type StaffGrade } from '@/lib/auth/capabilities';
import { ROLE_LABELS } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/** 회원 명단 엑셀 다운로드 — GET /api/nextlab/roster-export?tab=mentee|mentor|staff */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });

  const tab = new URL(request.url).searchParams.get('tab');
  const kind = tab === 'mentor' || tab === 'staff' ? tab : 'mentee';
  const members = await listProgramMembers(ctx.programId);
  const active = (b: boolean) => (b ? '활성' : '비활성');

  let rows: Record<string, string | number>[] = [];
  let sheetName = '멘티 명단';

  if (kind === 'mentee') {
    const cases = await listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
    const byMentee = new Map<string, typeof cases>();
    for (const c of cases) {
      if (!c.mentee_id) continue;
      if (!byMentee.has(c.mentee_id)) byMentee.set(c.mentee_id, []);
      byMentee.get(c.mentee_id)!.push(c);
    }
    rows = members
      .filter((m) => m.role === 'mentee')
      .flatMap((m) => {
        const cs = byMentee.get(m.id) ?? [];
        const base = {
          이름: m.name,
          '소속(기업·팀)': m.organization ?? '',
          휴대폰: m.phone ?? '',
          이메일: m.email ?? '',
          계정상태: active(m.is_active),
        };
        if (cs.length === 0) return [{ ...base, 그룹: '', 진행상태: '', 회차: '', 담당멘토: '' }];
        return cs.map((c) => ({
          ...base,
          그룹: c.supportTypeName ?? '',
          진행상태: c.status === 'withdrawn' ? '중도 종료(비활성화)' : CASE_STATUS_META[c.status].short,
          회차: `${c.roundsDone}/${c.requiredRounds}`,
          담당멘토: c.mentorName ?? '',
        }));
      });
  } else if (kind === 'mentor') {
    const mentors = await listProgramMentors(ctx.programId, ctx.supportTypeId ?? null);
    sheetName = '멘토 명단';
    rows = mentors.map((m) => ({
      이름: m.name,
      소속: m.organization ?? '',
      휴대폰: m.phone ?? '',
      이메일: m.email ?? '',
      '담당 멘티': m.activeCases,
      '배정 상태': m.activeCases > 0 ? '확정' : 'Pool 대기',
      '이행 회차': m.totalRounds,
      이력서: m.paymentDocs.resume ? '수령' : '미수령',
      통장사본: m.paymentDocs.bankbook ? '수령' : '미수령',
      신분증사본: m.paymentDocs.idCard ? '수령' : '미수령',
    }));
  } else {
    sheetName = '관리자 명단';
    rows = members
      .filter((m) => m.role === 'nextlab' || m.role === 'institution')
      .map((m) => ({
        구분: ROLE_LABELS[m.role],
        이름: m.name,
        소속: m.organization ?? '',
        직위: m.position ?? '',
        등급: m.role === 'nextlab' ? GRADE_LABELS[(m.grade as StaffGrade | null) ?? 'pl'] : '',
        담당역할: m.duty ?? '',
        휴대폰: m.phone ?? '',
        이메일: m.email ?? '',
        계정상태: active(m.is_active),
      }));
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const filename = encodeURIComponent(`${ctx.program.name}_${sheetName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
