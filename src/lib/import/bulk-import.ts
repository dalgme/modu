import 'server-only';

import * as XLSX from 'xlsx';

import { createAdminClient } from '@/lib/supabase/admin';
import { createStaffOrMentorAccount } from '@/lib/auth/admin-accounts';
import { toStoredPhone } from '@/lib/auth/identifier';
import { createCase } from '@/lib/workflow/cases';
import { runProgramAutoMatch } from '@/lib/matching/auto-match';
import { STAFF_GRADES } from '@/lib/auth/capabilities';

/**
 * 멘토/멘티 엑셀 일괄 등록 (운영사) — 컬럼 재정의 2026-09-22 (P23).
 * 시트 1행은 헤더. 한글 헤더를 키로 매핑한다. 미리보기(검증) → 확정(생성) 2단계.
 * 사업그룹은 컬럼이 아니라 업로드 화면에서 선택한다(멘티 필수, 멘토 선택).
 */
export type ImportKind = 'mentor' | 'mentee' | 'nextlab' | 'institution';

/** 멘토: 분야는 콤마(,)로 구분해 최대 10개 */
export const MENTOR_COLUMNS = ['이름', '소속', '휴대폰', '이메일', '분야', '직위', '소속멘토기관', '권역', '비고'] as const;
/** 멘티: 희망분야는 콤마(,)로 구분해 최대 6개, 재배치 희망은 희망 멘토 이름 */
export const MENTEE_COLUMNS = ['이름', '닉네임', '고유번호', '휴대폰', '이메일', '권역', '유형', '아이디어', '희망분야', '재배치 희망여부(멘토 이름)', '비고'] as const;
/** 운영사·발주처 담당자 공용 컬럼 (등급은 운영사만 해석) */
export const STAFF_COLUMNS = ['이름', '이메일', '휴대폰', '소속', '직위', '등급(운영사)', '담당역할(운영사)', '비고'] as const;

/** 복수 값 개수 상한 — 멘토 분야 10 / 멘티 희망분야 6 (사용자 확정 2026-09-22) */
export const MAX_MENTOR_FIELDS = 10;
export const MAX_MENTEE_NEEDS = 6;

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  mentee: '멘티',
  mentor: '멘토',
  nextlab: '운영사 담당자',
  institution: '발주처 담당자',
};

export function isImportKind(v: unknown): v is ImportKind {
  return v === 'mentor' || v === 'mentee' || v === 'nextlab' || v === 'institution';
}

function columnsOf(kind: ImportKind): readonly string[] {
  if (kind === 'mentor') return MENTOR_COLUMNS;
  if (kind === 'mentee') return MENTEE_COLUMNS;
  return STAFF_COLUMNS;
}

export interface ImportRow {
  line: number;
  values: Record<string, string>;
  errors: string[];
  /** 이미 존재하는 계정(휴대폰/이메일)과 연결됨 */
  existingUserId?: string;
}

export interface ImportPreview {
  kind: ImportKind;
  rows: ImportRow[];
  validCount: number;
  errorCount: number;
}

function cell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function parseSheet(buffer: Buffer, kind: ImportKind): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const columns = columnsOf(kind);
  return rows.map((r) => {
    const out: Record<string, string> = {};
    for (const col of columns) out[col] = cell(r[col]);
    return out;
  });
}

/** 템플릿 xlsx 생성 (헤더 + 예시 1행) */
export function buildTemplate(kind: ImportKind): Buffer {
  const columns = columnsOf(kind);
  const example =
    kind === 'mentor'
      ? ['홍길동', '○○컨설팅', '010-1234-5678', 'mentor@example.com', '마케팅, 재무, 투자유치', '대표', '○○멘토단', '세종', '비고 메모']
      : kind === 'mentee'
        ? ['김멘티', '팀모두', 'M-001', '010-9876-5432', 'mentee@example.com', '세종', '예비창업', '앱 서비스', '사업계획서, 마케팅', '', '비고 메모']
        : ['박담당', 'staff@example.com', '010-5555-1234', kind === 'nextlab' ? '운영사' : '발주기관', '주임', kind === 'nextlab' ? 'pm' : '', kind === 'nextlab' ? '정산 담당' : '', '비고 메모'];
  const ws = XLSX.utils.aoa_to_sheet([[...columns], example]);
  const guide = XLSX.utils.aoa_to_sheet([
    ['안내'],
    ['· 1행 헤더는 수정하지 마세요. 2행 예시는 지우고 입력하세요.'],
    ['· 휴대폰은 필수(로그인 아이디·임시 비밀번호). 이메일이 없으면 자동 생성됩니다.'],
    ['· 사업그룹은 파일이 아니라 업로드 화면에서 선택합니다. (멘티는 필수)'],
    ['· 이미 있는 계정(휴대폰/이메일 일치)은 새로 만들지 않고 이 행사에 초대만 합니다.'],
    ...(kind === 'mentor' ? [[`· 분야: 콤마(,)로 구분, 최대 ${MAX_MENTOR_FIELDS}개. 예) 마케팅, 재무, 투자유치`]] : []),
    ...(kind === 'mentee'
      ? [
          [`· 희망분야: 콤마(,)로 구분, 최대 ${MAX_MENTEE_NEEDS}개.`],
          ['· 닉네임은 팀명·활동명입니다. 화면의 "이름/소속" 표기에 사용됩니다(비우면 이름).'],
          ['· 재배치 희망여부: 재배치(배정)를 희망하는 멘토 이름을 적습니다. 비우면 희망 없음.'],
        ]
      : []),
    ...(kind === 'nextlab' ? [['· 등급: pl(메인 담당) / pm / deputy_pm(부PM) / observer(옵저버). 비우면 pl.'], ['· 담당역할(운영사)은 운영사 담당자에게만 적용됩니다.']] : []),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, IMPORT_KIND_LABELS[kind]);
  XLSX.utils.book_append_sheet(wb, guide, '안내');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

const splitList = (v: string) => v.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

/** 검증 — DB 는 조회만. 필수값·형식·복수값 상한·중복·기존 계정 매칭 (그룹은 액션에서 검증) */
export async function previewImport(programId: string, kind: ImportKind, rows: Record<string, string>[], groupId?: string | null): Promise<ImportPreview> {
  const admin = createAdminClient();
  const seenPhones = new Set<string>();
  const out: ImportRow[] = [];
  const phones = rows.map((r) => (toStoredPhone(r['휴대폰'] ?? '') ?? '').replace(/\D/g, '')).filter(Boolean);
  const emails = rows.map((r) => r['이메일']?.toLowerCase()).filter(Boolean) as string[];
  const [{ data: byPhone }, { data: byEmail }] = await Promise.all([
    phones.length ? admin.from('users').select('id, phone, role').in('phone', phones.map((p) => toStoredPhone(p) ?? p)) : Promise.resolve({ data: [] as { id: string; phone: string | null; role: string }[] }),
    emails.length ? admin.from('users').select('id, email, role').in('email', emails) : Promise.resolve({ data: [] as { id: string; email: string | null; role: string }[] }),
  ]);
  const userByPhone = new Map((byPhone ?? []).map((u) => [(u.phone ?? '').replace(/\D/g, ''), u]));
  const userByEmail = new Map((byEmail ?? []).map((u) => [(u.email ?? '').toLowerCase(), u]));
  // 역할 충돌은 "이 행사 안의 역할" 기준 (설계 B — users.role 로 사람을 거르지 말 것)
  const matchedIds = Array.from(new Set([...(byPhone ?? []), ...(byEmail ?? [])].map((u) => u.id)));
  const { data: memberships } = matchedIds.length
    ? await admin.from('program_members').select('user_id, role').eq('program_id', programId).in('user_id', matchedIds)
    : { data: [] as { user_id: string; role: string }[] };
  const programRoleByUser = new Map((memberships ?? []).map((m) => [m.user_id, m.role]));
  // 멘티: 같은 그룹에 진행 중 케이스가 이미 있는 계정은 중복 등록 오류 (1멘티 = 1케이스, P30)
  const openCaseUsers = new Set<string>();
  const nameByUser = new Map<string, string>();
  if (matchedIds.length) {
    const [{ data: openCases }, { data: names }] = await Promise.all([
      kind === 'mentee' && groupId ? admin.from('cases').select('mentee_id').eq('support_type_id', groupId).neq('status', 'withdrawn').in('mentee_id', matchedIds) : Promise.resolve({ data: [] as { mentee_id: string | null }[] }),
      admin.from('users').select('id, name').in('id', matchedIds),
    ]);
    for (const c of openCases ?? []) if (c.mentee_id) openCaseUsers.add(c.mentee_id);
    for (const u of names ?? []) nameByUser.set(u.id, u.name);
  }

  rows.forEach((values, i) => {
    const errors: string[] = [];
    const line = i + 2;
    const name = values['이름'];
    const phoneDigits = (toStoredPhone(values['휴대폰'] ?? '') ?? values['휴대폰'] ?? '').replace(/\D/g, '');
    const email = (values['이메일'] ?? '').toLowerCase();
    if (!name) errors.push('이름 누락');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) errors.push('휴대폰 형식(10~11자리)');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('이메일 형식');
    if (kind === 'mentor' && splitList(values['분야'] ?? '').length > MAX_MENTOR_FIELDS) errors.push(`분야는 최대 ${MAX_MENTOR_FIELDS}개`);
    if (kind === 'mentee' && splitList(values['희망분야'] ?? '').length > MAX_MENTEE_NEEDS) errors.push(`희망분야는 최대 ${MAX_MENTEE_NEEDS}개`);
    if (phoneDigits && seenPhones.has(phoneDigits)) errors.push('파일 안 휴대폰 중복');
    seenPhones.add(phoneDigits);
    let existingUserId: string | undefined;
    const existing = userByPhone.get(phoneDigits) ?? (email ? userByEmail.get(email) : undefined);
    if (existing) {
      const programRole = programRoleByUser.get(existing.id);
      const existingName = nameByUser.get(existing.id);
      if (programRole && programRole !== kind) errors.push(`이 행사에서 이미 ${IMPORT_KIND_LABELS[programRole as ImportKind] ?? programRole} 역할로 등록된 계정`);
      else if (kind === 'mentee' && openCaseUsers.has(existing.id)) errors.push('이 그룹에 이미 등록된 멘티(중복 행 또는 재업로드)');
      else if (existingName && name && existingName.trim() !== name.trim()) errors.push(`같은 휴대폰/이메일의 기존 계정 이름(${existingName})과 다릅니다 — 번호를 확인하세요`);
      else existingUserId = existing.id; // 이 행사 소속이 아니면 기존 계정을 이 역할로 초대(설계 B)
    }
    out.push({ line, values, errors, existingUserId });
  });
  return { kind, rows: out, validCount: out.filter((r) => r.errors.length === 0).length, errorCount: out.filter((r) => r.errors.length > 0).length };
}

export interface ImportResult {
  created: number;
  linked: number;
  failed: { line: number; error: string }[];
  credentials: { line: number; name: string; email: string; tempPassword: string }[];
}

/** 확정 — 유효 행만 생성. 기존 계정은 멤버십·명부만 추가. groupId 는 액션이 검증해 넘긴다(멘티 필수, 멘토 선택). */
export async function commitImport(programId: string, kind: ImportKind, rows: ImportRow[], actorId: string, groupId?: string | null): Promise<ImportResult> {
  const admin = createAdminClient();
  const result: ImportResult = { created: 0, linked: 0, failed: [], credentials: [] };

  for (const row of rows) {
    if (row.errors.length > 0) continue;
    const v = row.values;
    try {
      if (kind === 'mentor') {
        let userId = row.existingUserId;
        const phone = toStoredPhone(v['휴대폰'] ?? '') ?? v['휴대폰']!;
        const email = v['이메일'] || `m-${phone.replace(/\D/g, '')}@mentor.local`;
        if (!userId) {
          const acc = await createStaffOrMentorAccount({ email, name: v['이름']!, phone, role: 'mentor', organization: v['소속'] || undefined, position: v['직위'] || undefined, actorId });
          userId = acc.userId;
          result.created += 1;
          result.credentials.push({ line: row.line, name: v['이름']!, email: acc.email, tempPassword: acc.tempPassword });
        } else {
          result.linked += 1;
          // 기존 계정은 파일에 값이 있을 때만 갱신 — 빈 칸으로 기존 소속·직위를 지우지 않는다
          const patch: { organization?: string; position?: string } = {};
          if (v['소속']) patch.organization = v['소속'];
          if (v['직위']) patch.position = v['직위'];
          if (Object.keys(patch).length > 0) await admin.from('users').update(patch).eq('id', userId);
        }
        await admin.from('program_members').upsert({ program_id: programId, user_id: userId, role: 'mentor', is_active: true }, { onConflict: 'program_id,user_id' });
        if (groupId) {
          await admin.from('support_type_members').upsert({ support_type_id: groupId, user_id: userId, member_role: 'mentor', is_active: true, left_at: null }, { onConflict: 'support_type_id,user_id' });
        }
        await admin.from('mentor_profiles').upsert(
          {
            program_id: programId,
            user_id: userId,
            expertise: splitList(v['분야'] ?? '').slice(0, MAX_MENTOR_FIELDS),
            regions: splitList(v['권역'] ?? ''),
            mentor_institution: v['소속멘토기관'] || null,
            note: v['비고'] || null,
          },
          { onConflict: 'program_id,user_id' },
        );
      } else if (kind === 'nextlab' || kind === 'institution') {
        let userId = row.existingUserId;
        const phone = toStoredPhone(v['휴대폰'] ?? '') ?? v['휴대폰']!;
        const email = v['이메일'] || `s-${phone.replace(/\D/g, '')}@staff.local`;
        if (!userId) {
          const acc = await createStaffOrMentorAccount({ email, name: v['이름']!, phone, role: kind, organization: v['소속'] || undefined, position: v['직위'] || undefined, actorId });
          userId = acc.userId;
          result.created += 1;
          result.credentials.push({ line: row.line, name: v['이름']!, email: acc.email, tempPassword: acc.tempPassword });
        } else {
          result.linked += 1;
        }
        const gradeRaw = (v['등급(운영사)'] ?? '').trim().toLowerCase().replace('sub_pm', 'deputy_pm').replace('부pm', 'deputy_pm');
        const grade = kind === 'nextlab' ? ((STAFF_GRADES as string[]).includes(gradeRaw) ? gradeRaw : 'pl') : null;
        const { error: memberError } = await admin
          .from('program_members')
          .upsert({ program_id: programId, user_id: userId, role: kind, grade, duty: kind === 'nextlab' ? v['담당역할(운영사)'] || null : null, note: v['비고'] || null, is_active: true, left_at: null }, { onConflict: 'program_id,user_id' });
        if (memberError) throw new Error(`행사 소속 등록 실패: ${memberError.message}`);
      } else {
        if (!groupId) throw new Error('사업그룹을 선택하세요');
        const created = await createCase({
          programId,
          createdBy: actorId,
          support_type_id: groupId,
          // 닉네임(팀명·활동명)이 "이름/소속" 표기의 소속 자리 — 비우면 이름으로 채운다
          business_name: v['닉네임'] || v['이름']!,
          owner_name: v['이름']!,
          phone: v['휴대폰']!,
          email: v['이메일'] || undefined,
          item: v['아이디어'] || undefined,
          business_reg_no: undefined,
          address: undefined,
          business_type: undefined,
          opened_at: undefined,
          employee_count: undefined,
          menteeId: row.existingUserId ?? null,
        });
        if (!created.ok) throw new Error(created.error);
        if (created.menteeCredential) {
          result.created += 1;
          result.credentials.push({ line: row.line, name: v['이름']!, email: created.menteeCredential.email, tempPassword: created.menteeCredential.tempPassword });
        } else {
          result.linked += 1;
        }
        await admin.from('mentee_profiles').upsert(
          {
            case_id: created.caseId,
            program_id: programId,
            nickname: v['닉네임'] || null,
            external_no: v['고유번호'] || null,
            region: v['권역'] || null,
            mentee_type: v['유형'] || null,
            needs: splitList(v['희망분야'] ?? '').slice(0, MAX_MENTEE_NEEDS),
            preferred_mentor: v['재배치 희망여부(멘토 이름)'] || null,
            note: v['비고'] || null,
          },
          { onConflict: 'case_id' },
        );
      }
    } catch (err) {
      result.failed.push({ line: row.line, error: err instanceof Error ? err.message : '알 수 없는 오류' });
    }
  }

  // P24 자동 매칭 — 행마다 돌리면 O(행수 × 미배정 케이스수) 쿼리가 되어 일괄 등록이 분 단위로 느려진다.
  // 전체 등록이 끝난 뒤 배치로 1회만 실행한다(자동 확정 + 추천 재계산 + 전원 배정 문자).
  if (kind === 'mentor' || kind === 'mentee') {
    try {
      await runProgramAutoMatch(programId, actorId);
    } catch (err) {
      console.error('batch auto match after import failed:', err instanceof Error ? err.message : err);
    }
  }

  await admin.from('audit_logs').insert({
    actor_id: actorId,
    program_id: programId,
    action: `import.${kind}`,
    entity_type: 'programs',
    entity_id: programId,
    metadata: { created: result.created, linked: result.linked, failed: result.failed.length, group_id: groupId ?? null },
  });
  return result;
}
