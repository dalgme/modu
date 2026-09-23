import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { listProgramMembers } from '@/lib/data/members';
import { listProgramMentors } from '@/lib/data/mentors';
import { listCases } from '@/lib/data/cases';
import { CASE_STATUS_META } from '@/types/case-status';
import { GRADE_LABELS, type StaffGrade } from '@/lib/auth/capabilities';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { loadMatchingLists, MATCH_METHOD_LABELS } from '@/lib/data/matching-lists';
import { menteeOrg, mentorLabel } from '@/lib/utils/labels';

export const dynamic = 'force-dynamic';

/** 회원 명단 엑셀 다운로드 — GET /api/nextlab/roster-export?tab=mentee|mentor|staff */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });

  const tab = new URL(request.url).searchParams.get('tab');
  const kind = tab === 'mentor' || tab === 'staff' || tab === 'institution' || tab === 'nextlab' || tab === 'mentee-match' || tab === 'mentor-match' ? tab : 'mentee';
  /** 관리자 시트 역할 필터 — staff(구 링크)는 발주처+운영사 전체 */
  const staffRoles: ('nextlab' | 'institution')[] = kind === 'institution' ? ['institution'] : kind === 'nextlab' ? ['nextlab'] : ['nextlab', 'institution'];
  const members = await listProgramMembers(ctx.programId, ctx.supportTypeId);
  const active = (b: boolean) => (b ? '활성' : '비활성');

  let rows: Record<string, string | number>[] = [];
  let sheetName = '멘티 명단';

  if (kind === 'mentee-match' || kind === 'mentor-match') {
    // P25 매칭 리스트 엑셀
    const lists = await loadMatchingLists(ctx.programId, ctx.supportTypeId ?? null);
    if (kind === 'mentee-match') {
      sheetName = '멘티 매칭 리스트';
      rows = lists.menteeRows.map((r) => ({
        순위: r.rank ?? '',
        멘티: r.label,
        라운드: r.groupName ?? '',
        희망분야: r.needs.join(', '),
        '재배치 희망': r.preferredMentor ?? '',
        '배정 멘토': r.mentorName ? mentorLabel(r.mentorName, r.mentorActive) : '',
        방식: r.matchMethod ? MATCH_METHOD_LABELS[r.matchMethod] : '',
        추천: r.mentorName ? '' : r.recommendations.map((x) => `${x.rank}. ${mentorLabel(x.mentorName, x.mentorActive)} ${Math.round(x.score)}점`).join(' / '),
        '매칭 일자': r.assignedAt ? r.assignedAt.slice(0, 10) : '',
        '멘토 확인': r.confirmedAt ? r.confirmedAt.slice(0, 10) : '',
        만족도: r.surveyDone ? '작성 완료' : '',
        진행: r.statusLabel,
        회차: `${r.roundsDone}/${r.requiredRounds}`,
      }));
    } else {
      sheetName = '멘토 매칭 리스트';
      rows = lists.mentorRows.flatMap((m) => {
        const base = { 멘토: mentorLabel(m.mentorName, m.mentees.length), 소속: m.organization ?? '', 휴대폰: m.phone ?? '', 이메일: m.email ?? '', 분야: m.expertise.join(', '), '그룹 지정': m.designatedGroupNames.join(', '), 지급서류: m.paymentDocState, '확정 실지급': m.settledNet, 만족도: m.surveyAvg ?? '', '운영사 평가': m.reviewAvg ?? '' };
        if (m.mentees.length === 0) return [{ ...base, 순위: '', 멘티: '', 라운드: '', 방식: '', '매칭 일자': '', '멘토 확인': '', 진행: '미배정(Pool)', 회차: '' }];
        return m.mentees.map((c) => ({
          ...base,
          순위: c.rank ?? '',
          멘티: c.label,
          라운드: c.groupName ?? '',
          방식: c.matchMethod ? MATCH_METHOD_LABELS[c.matchMethod] : '',
          '매칭 일자': c.assignedAt ? c.assignedAt.slice(0, 10) : '',
          '멘토 확인': c.confirmedAt ? c.confirmedAt.slice(0, 10) : '',
          진행: c.statusLabel,
          회차: `${c.roundsDone}/${c.requiredRounds}`,
        }));
      });
    }
  } else if (kind === 'mentee') {
    // P23 컬럼 재정의: 이름·닉네임·고유번호·휴대폰·이메일·권역·유형·아이디어·희망분야·재배치 희망·비고 + 진행현황
    const cases = await listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
    const { data: profiles } = cases.length
      ? await createAdminClient().from('mentee_profiles').select('case_id, nickname, external_no, region, mentee_type, needs, preferred_mentor, note, rank').in('case_id', cases.map((c) => c.id))
      : { data: [] as { case_id: string; nickname: string | null; external_no: string | null; region: string | null; mentee_type: string | null; needs: string[]; preferred_mentor: string | null; note: string | null; rank: number | null }[] };
    const profileByCase = new Map((profiles ?? []).map((p) => [p.case_id, p]));
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
          휴대폰: m.phone ?? '',
          이메일: m.email ?? '',
          계정상태: active(m.is_active),
        };
        if (cs.length === 0) {
          return [{ 순위: '', 이름: base.이름, 닉네임: '', 고유번호: '', 휴대폰: base.휴대폰, 이메일: base.이메일, 권역: '', 유형: '', 아이디어: '', 희망분야: '', '재배치 희망여부(멘토 이름)': '', 비고: '', 그룹: '', 진행상태: '', 회차: '', 담당멘토: '', 계정상태: base.계정상태 }];
        }
        return cs.map((c) => {
          const p = profileByCase.get(c.id);
          return {
            순위: p?.rank ?? '',
            이름: base.이름,
            닉네임: p?.nickname ?? menteeOrg(c.owner_name, c.business_name),
            고유번호: p?.external_no ?? '',
            휴대폰: base.휴대폰,
            이메일: base.이메일,
            권역: p?.region ?? '',
            유형: p?.mentee_type ?? '',
            아이디어: c.item ?? '',
            희망분야: (p?.needs ?? []).join(', '),
            '재배치 희망여부(멘토 이름)': p?.preferred_mentor ?? '',
            비고: p?.note ?? '',
            그룹: c.supportTypeName ?? '',
            진행상태: c.status === 'withdrawn' ? '중도 종료(비활성화)' : CASE_STATUS_META[c.status].short,
            회차: `${c.roundsDone}/${c.requiredRounds}`,
            담당멘토: c.mentorName ?? '',
            계정상태: base.계정상태,
          };
        });
      });
  } else if (kind === 'mentor') {
    // P23 컬럼 재정의: 이름·소속·휴대폰·이메일·분야·직위·소속멘토기관·권역·비고 + 진행·지급서류
    const mentors = await listProgramMentors(ctx.programId, ctx.supportTypeId ?? null);
    const { data: profiles } = mentors.length
      ? await createAdminClient().from('mentor_profiles').select('user_id, expertise, regions, mentor_institution, note').eq('program_id', ctx.programId).in('user_id', mentors.map((m) => m.id))
      : { data: [] as { user_id: string; expertise: string[]; regions: string[]; mentor_institution: string | null; note: string | null }[] };
    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const positionByUser = new Map(members.map((m) => [m.id, m.position]));
    sheetName = '멘토 명단';
    rows = mentors.map((m) => {
      const p = profileByUser.get(m.id);
      return {
        이름: m.name,
        소속: m.organization ?? '',
        휴대폰: m.phone ?? '',
        이메일: m.email ?? '',
        분야: (p?.expertise ?? []).join(', '),
        직위: positionByUser.get(m.id) ?? '',
        소속멘토기관: p?.mentor_institution ?? '',
        권역: (p?.regions ?? []).join(', '),
        비고: p?.note ?? '',
        '담당 멘티': m.activeCases,
        '배정 상태': m.activeCases > 0 ? '확정' : 'Pool 대기',
        '이행 회차': m.totalRounds,
        서명: m.signatureRegistered ? 'O' : '-',
        이력서: m.paymentDocs.states.resume ?? '-',
        통장사본: m.paymentDocs.states.bankbook ?? '-',
        신분증사본: m.paymentDocs.states.idCard ?? '-',
      };
    });
  } else {
    sheetName = kind === 'institution' ? '발주처 명단' : kind === 'nextlab' ? '운영사 명단' : '관리자 명단';
    rows = members
      .filter((m) => staffRoles.includes(m.role as 'nextlab' | 'institution'))
      .map((m) => ({
        구분: ROLE_LABELS[m.role],
        이름: m.name,
        소속: m.organization ?? '',
        직위: m.position ?? '',
        등급: m.role === 'nextlab' ? GRADE_LABELS[(m.grade as StaffGrade | null) ?? 'pl'] : '',
        담당역할: m.role === 'nextlab' ? (m.duty ?? '') : '',
        휴대폰: m.phone ?? '',
        이메일: m.email ?? '',
        비고: m.note ?? '',
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
