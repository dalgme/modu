import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordSecurityEventSafe } from '@/lib/ops/security-events';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { listProgramMembers } from '@/lib/data/members';
import { listProgramMentors } from '@/lib/data/mentors';
import { listCases } from '@/lib/data/cases';
import { listRosterColumns } from '@/lib/data/roster-columns';
import { CASE_STATUS_META } from '@/types/case-status';
import { GRADE_LABELS, type StaffGrade } from '@/lib/auth/capabilities';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { loadMatchingLists } from '@/lib/data/matching-lists';
import { loadRoundBreakdown, roundHeader, roundValues } from '@/lib/reports/round-breakdown';
import { menteeOrg, mentorLabel } from '@/lib/utils/labels';
import { MENTEE_COLUMNS, MENTOR_COLUMNS, STAFF_COLUMNS } from '@/lib/import/bulk-import';
import { excelFileName, kstDate, kstDateTime, kstTime, sheetName, sheetWithMeta, workbookBuffer, xlsxResponse } from '@/lib/excel/sheet';

export const dynamic = 'force-dynamic';

/**
 * 회원 명단 엑셀 다운로드 — GET /api/nextlab/roster-export?tab=mentee|mentor|institution|nextlab|staff|mentee-match|mentor-match[&dedupe=1]
 * (P31) 헤더는 일괄 등록 템플릿과 **동일한 이름**이라 그대로 다시 올릴 수 있다(내보내기 전용 컬럼은 업로드 시 무시됨).
 *  - 멘티 `dedupe=1` = 재업로드용 1인 1행(범위 안 최신 케이스 기준)
 *  - 임의 컬럼(roster_columns)은 멘티/멘토 시트 끝에 컬럼 이름 그대로 붙는다 → [임의 컬럼 업로드]로 되돌릴 수 있다
 */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });

  const sp = new URL(request.url).searchParams;
  const tab = sp.get('tab');
  const dedupe = sp.get('dedupe') === '1';
  const kind = tab === 'mentor' || tab === 'staff' || tab === 'institution' || tab === 'nextlab' || tab === 'mentee-match' || tab === 'mentor-match' ? tab : 'mentee';
  /** 관리자 시트 역할 필터 — staff(구 링크)는 발주처+운영사 전체 */
  const staffRoles: ('nextlab' | 'institution')[] = kind === 'institution' ? ['institution'] : kind === 'nextlab' ? ['nextlab'] : ['nextlab', 'institution'];
  const [members, roster] = await Promise.all([listProgramMembers(ctx.programId, ctx.supportTypeId), listRosterColumns(ctx.programId)]);
  const active = (b: boolean) => (b ? '활성' : '비활성');
  /** 명단 계정상태 — 행사 비활성화(program_members)·계정 잠금(users)을 구분해 표시 (회원 명단 [비활성화] 탭과 같은 기준) */
  const memberStatus = (m: { memberActive: boolean; is_active: boolean }) =>
    m.memberActive && m.is_active ? '활성' : [!m.memberActive ? '이 행사 비활성화' : null, !m.is_active ? '계정 잠금' : null].filter(Boolean).join(' · ');
  const scopeLabel = ctx.group ? ctx.group.name : '행사 전체';
  const customCols = (target: 'mentee' | 'mentor') => roster.columns.filter((c) => c.target === target);
  const customVals = (target: 'mentee' | 'mentor', userId: string) => customCols(target).map((c) => roster.values[`${c.id}:${userId}`] ?? '');

  let header: string[] = [];
  let rows: unknown[][] = [];
  let title = '멘티 명단';
  let filter: string | undefined;

  if (kind === 'mentee-match' || kind === 'mentor-match') {
    // P25 매칭 리스트 엑셀 — (2026-10-01) 비활성 멘티 제외 · 회차별 [일시·시수·장소·보고서 제출·수당·세금분·실지급분] 펼침
    const [lists, cases] = await Promise.all([
      loadMatchingLists(ctx.programId, ctx.supportTypeId ?? null, { excludeInactiveMentees: true }),
      listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined }),
    ]);
    const contactByCase = new Map(cases.map((c) => [c.id, { phone: c.phone ?? '', email: c.email ?? '' }]));
    const listedCaseIds = new Set(lists.menteeRows.map((r) => r.caseId));
    const breakdown = await loadRoundBreakdown(
      ctx.programId,
      cases.filter((c) => listedCaseIds.has(c.id)).map((c) => ({ id: c.id, support_type_id: c.support_type_id })),
    );
    const maxRound = Math.max(breakdown.maxRound, ...lists.menteeRows.map((r) => r.requiredRounds), 0);
    const when = (a: string, b: string) => `${kstDateTime(a)}~${kstTime(b)}`;
    filter = '세금분·실지급분: 정산 확정 회차는 확정액 배분, 미확정 이행 회차는 같은 계산식의 예상치 · 보고서 미제출 회차는 금액 없음';
    if (kind === 'mentee-match') {
      title = '멘티 매칭 리스트';
      // 배정 멘토의 소속·직함·연락처·이메일 — 종료된 멘토도 포함해 users 에서 직접 읽는다
      const mentorIds = Array.from(new Set(lists.menteeRows.map((r) => r.mentorId).filter((x): x is string => !!x)));
      const mentorInfo = new Map(
        (await fetchAllIn<{ id: string; organization: string | null; position: string | null; phone: string | null; email: string | null }>(mentorIds, (chunk, from, to) =>
          createAdminClient().from('users').select('id, organization, position, phone, email').in('id', chunk).range(from, to),
        )).map((u) => [u.id, u]),
      );
      header = ['순위', '멘티', '휴대폰', '이메일', '라운드', '희망분야', '재배치 희망', '배정 멘토', '멘토 소속', '멘토 직함', '멘토 연락처', '멘토 이메일', '추천', '멘토 확인', '진행', ...roundHeader(maxRound)];
      rows = lists.menteeRows.map((r) => {
        const ct = contactByCase.get(r.caseId);
        const mi = r.mentorId ? mentorInfo.get(r.mentorId) : undefined;
        return [
          r.rank ?? '',
          r.label,
          ct?.phone ?? '',
          ct?.email ?? '',
          r.groupName ?? '',
          r.needs.join(', '),
          r.preferredMentor ?? '',
          r.mentorName ? mentorLabel(r.mentorName, r.mentorActive) : '',
          mi?.organization ?? '',
          mi?.position ?? '',
          mi?.phone ?? '',
          mi?.email ?? '',
          r.mentorName ? '' : r.recommendations.map((x) => `${x.rank}. ${mentorLabel(x.mentorName, x.mentorActive)} ${Math.round(x.score)}점`).join(' / '),
          kstDate(r.confirmedAt),
          r.statusLabel,
          ...roundValues(breakdown.byCase.get(r.caseId), maxRound, when),
        ];
      });
    } else {
      title = '멘토 매칭 리스트';
      header = ['멘토', '소속', '직함', '휴대폰', '이메일', '분야', '지급서류', '확정 실지급', '만족도', '운영사 평가', '순위', '멘티', '멘토 확인', '진행', ...roundHeader(maxRound)];
      rows = lists.mentorRows.flatMap((m) => {
        const base = [mentorLabel(m.mentorName, m.mentees.length), m.organization ?? '', m.position ?? '', m.phone ?? '', m.email ?? '', m.expertise.join(', '), m.paymentDocState, m.settledNet, m.surveyAvg ?? '', m.reviewAvg ?? ''];
        if (m.mentees.length === 0) return [[...base, '', '', '', '미배정(Pool)', ...roundValues(undefined, maxRound, when)]];
        // 멘토 행의 회차 = 그 멘토가 진행한 회차만 (교체 전·후 멘토 몫을 섞지 않는다)
        return m.mentees.map((c) => [...base, c.rank ?? '', c.label, kstDate(c.confirmedAt), c.statusLabel, ...roundValues(breakdown.byCase.get(c.caseId), maxRound, when, m.mentorId)]);
      });
    }
  } else if (kind === 'mentee') {
    // 템플릿 헤더(MENTEE_COLUMNS) + 내보내기 전용 컬럼 + 임의 컬럼
    const cases = await listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
    const admin = createAdminClient();
    const profiles = await fetchAllIn<{ case_id: string; nickname: string | null; external_no: string | null; region: string | null; mentee_type: string | null; needs: string[]; preferred_mentor: string | null; note: string | null; rank: number | null }>(
      cases.map((c) => c.id),
      (chunk, from, to) => admin.from('mentee_profiles').select('case_id, nickname, external_no, region, mentee_type, needs, preferred_mentor, note, rank').in('case_id', chunk).range(from, to),
    );
    const profileByCase = new Map(profiles.map((p) => [p.case_id, p]));
    const byMentee = new Map<string, typeof cases>();
    for (const c of cases) {
      if (!c.mentee_id) continue;
      if (!byMentee.has(c.mentee_id)) byMentee.set(c.mentee_id, []);
      byMentee.get(c.mentee_id)!.push(c);
    }
    title = dedupe ? '멘티 명단(재업로드용)' : '멘티 명단';
    filter = dedupe ? '1인 1행 (범위 안 최신 케이스)' : undefined;
    const extra = ['순위', '그룹', '진행상태', '회차', '담당멘토', '계정상태', '로그인 아이디'];
    header = [...MENTEE_COLUMNS, ...extra, ...customCols('mentee').map((c) => c.name)];
    rows = members
      .filter((m) => m.role === 'mentee')
      .flatMap((m) => {
        const all = byMentee.get(m.id) ?? [];
        const cs = dedupe ? all.slice(0, 1) : all; // listCases 는 등록 최신순
        const custom = customVals('mentee', m.id);
        if (cs.length === 0) return [[m.name, '', '', m.phone ?? '', m.email ?? '', '', '', '', '', '', '', '', '', '', '', '', memberStatus(m), '', ...custom]];
        return cs.map((c) => {
          const p = profileByCase.get(c.id);
          return [
            m.name,
            p?.nickname ?? menteeOrg(c.owner_name, c.business_name),
            p?.external_no ?? '',
            m.phone ?? '',
            m.email ?? '',
            p?.region ?? '',
            p?.mentee_type ?? '',
            c.item ?? '',
            (p?.needs ?? []).join(', '),
            p?.preferred_mentor ?? '',
            p?.note ?? '',
            p?.rank ?? '',
            c.supportTypeName ?? '',
            c.status === 'withdrawn' ? '중도 종료(비활성화)' : CASE_STATUS_META[c.status].short,
            `${c.roundsDone}/${c.requiredRounds}`,
            c.mentorName ?? '',
            memberStatus(m),
            c.menteeLoginId ?? '',
            ...custom,
          ];
        });
      });
  } else if (kind === 'mentor') {
    // 템플릿 헤더(MENTOR_COLUMNS) + 진행·지급서류 + 임의 컬럼
    const mentors = await listProgramMentors(ctx.programId, ctx.supportTypeId ?? null);
    const admin = createAdminClient();
    const profiles = await fetchAllIn<{ user_id: string; expertise: string[]; regions: string[]; mentor_institution: string | null; note: string | null }>(
      mentors.map((m) => m.id),
      (chunk, from, to) => admin.from('mentor_profiles').select('user_id, expertise, regions, mentor_institution, note').eq('program_id', ctx.programId).in('user_id', chunk).range(from, to),
    );
    const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));
    const positionByUser = new Map(members.map((m) => [m.id, m.position]));
    title = '멘토 명단';
    const extra = ['담당 멘티', '배정 상태', '이행 회차', '서명', '이력서', '통장사본', '신분증사본', '그룹 지정', '계정상태'];
    header = [...MENTOR_COLUMNS, ...extra, ...customCols('mentor').map((c) => c.name)];
    rows = mentors.map((m) => {
      const p = profileByUser.get(m.id);
      return [
        m.name,
        m.organization ?? '',
        m.phone ?? '',
        m.email ?? '',
        (p?.expertise ?? []).join(', '),
        positionByUser.get(m.id) ?? '',
        p?.mentor_institution ?? '',
        (p?.regions ?? []).join(', '),
        p?.note ?? '',
        m.activeCases,
        m.activeCases > 0 ? '확정' : '미배정(배정 대기)',
        m.totalRounds,
        m.signatureRegistered ? 'O' : '-',
        m.paymentDocs.states.resume ?? '-',
        m.paymentDocs.states.bankbook ?? '-',
        m.paymentDocs.states.idCard ?? '-',
        m.groups.filter((g) => g.isActive).map((g) => g.supportTypeName).join(', ') || '(전체)',
        active(m.isActive),
        ...customVals('mentor', m.id),
      ];
    });
  } else {
    // 템플릿 헤더(STAFF_COLUMNS: 등급은 코드) + 등급명·구분·계정상태
    title = kind === 'institution' ? '발주처 명단' : kind === 'nextlab' ? '운영사 명단' : '관리자 명단';
    header = [...STAFF_COLUMNS, '등급명', '구분', '계정상태'];
    rows = members
      .filter((m) => staffRoles.includes(m.role as 'nextlab' | 'institution'))
      .map((m) => {
        const grade = m.role === 'nextlab' ? ((m.grade as StaffGrade | null) ?? 'pl') : null;
        return [
          m.name,
          m.email ?? '',
          m.phone ?? '',
          m.organization ?? '',
          m.position ?? '',
          grade ?? '',
          m.role === 'nextlab' ? (m.duty ?? '') : '',
          m.note ?? '',
          grade ? GRADE_LABELS[grade] : '',
          ROLE_LABELS[m.role],
          memberStatus(m),
        ];
      });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetWithMeta(header, rows, { 범위: `${ctx.program.name} · ${scopeLabel}`, 필터: filter, extra: [['건수', rows.length]] }), sheetName(title));
  // (P35-B) 대량 반출 이벤트 — 같은 사용자 10분 내 5회 이상이면 Cron 이 warn 으로 승격
  await recordSecurityEventSafe({ kind: 'export', severity: 'info', userId: profile.id, path: '/api/nextlab/roster-export', detail: { route: 'roster-export', tab, rows: rows.length, program_id: ctx.programId } });
  return xlsxResponse(workbookBuffer(wb), excelFileName(ctx.program.name, ctx.group?.name ?? null, title));
}
