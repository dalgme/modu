import 'server-only';

import * as XLSX from 'xlsx';

import { createAdminClient } from '@/lib/supabase/admin';
import { createStaffOrMentorAccount } from '@/lib/auth/admin-accounts';
import { toStoredPhone } from '@/lib/auth/identifier';
import { createCase } from '@/lib/workflow/cases';

/**
 * 멘토/멘티 엑셀 일괄 등록 (운영사) — 2026-09-07 요건.
 * 시트 1행은 헤더. 한글 헤더를 키로 매핑한다. 미리보기(검증) → 확정(생성) 2단계.
 */
export type ImportKind = 'mentor' | 'mentee';

export const MENTOR_COLUMNS = ['이름', '이메일', '휴대폰', '소속', '직위', '소속그룹코드', '전문분야', '업종', '지역', '경력', '소개'] as const;
export const MENTEE_COLUMNS = ['멘티이름', '기업(팀)명', '휴대폰', '이메일', '사업그룹코드', '사업자등록번호', '주소', '업종', '아이템', '창업단계', '지역', '필요분야', '소개'] as const;

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
  const columns = kind === 'mentor' ? MENTOR_COLUMNS : MENTEE_COLUMNS;
  return rows.map((r) => {
    const out: Record<string, string> = {};
    for (const col of columns) out[col] = cell(r[col]);
    return out;
  });
}

/** 템플릿 xlsx 생성 (헤더 + 예시 1행) */
export function buildTemplate(kind: ImportKind, groupCodes: string[]): Buffer {
  const columns = kind === 'mentor' ? MENTOR_COLUMNS : MENTEE_COLUMNS;
  const example =
    kind === 'mentor'
      ? ['홍길동', 'mentor@example.com', '010-1234-5678', '○○컨설팅', '대표', groupCodes[0] ?? '', '마케팅·브랜딩; 재무·투자유치', '식품', '세종', '○○ 대표 10년', '온·오프라인 모두 가능']
      : ['김멘티', '팀 이름', '010-9876-5432', 'mentee@example.com', groupCodes[0] ?? '', '', '세종시 …', 'IT', '앱 서비스', '예비창업', '세종', '사업계획서; 마케팅·브랜딩', '한 줄 소개'];
  const ws = XLSX.utils.aoa_to_sheet([[...columns], example]);
  const guide = XLSX.utils.aoa_to_sheet([
    ['안내'],
    ['· 1행 헤더는 수정하지 마세요. 2행 예시는 지우고 입력하세요.'],
    ['· 휴대폰은 필수(로그인 아이디·임시 비밀번호). 이메일이 없으면 자동 생성됩니다.'],
    [`· 그룹코드: ${groupCodes.join(', ') || '(설정 페이지에서 그룹을 먼저 만드세요)'}`],
    ['· 여러 값은 세미콜론(;)으로 구분합니다. 예) 마케팅; 재무'],
    ['· 이미 있는 계정(휴대폰/이메일 일치)은 새로 만들지 않고 이 행사에 초대만 합니다.'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, kind === 'mentor' ? '멘토' : '멘티');
  XLSX.utils.book_append_sheet(wb, guide, '안내');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

const splitList = (v: string) => v.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

/** 검증 — DB 는 조회만. 그룹코드 존재·필수값·중복·기존 계정 매칭 */
export async function previewImport(programId: string, kind: ImportKind, rows: Record<string, string>[]): Promise<ImportPreview> {
  const admin = createAdminClient();
  const { data: groups } = await admin.from('support_types').select('id, code, status').eq('program_id', programId);
  const groupByCode = new Map((groups ?? []).map((g) => [g.code, g]));
  const seenPhones = new Set<string>();
  const out: ImportRow[] = [];
  const phones = rows.map((r) => (toStoredPhone(r['휴대폰'] ?? '') ?? '').replace(/\D/g, '')).filter(Boolean);
  const emails = rows.map((r) => (kind === 'mentor' ? r['이메일'] : r['이메일'])?.toLowerCase()).filter(Boolean) as string[];
  const [{ data: byPhone }, { data: byEmail }] = await Promise.all([
    phones.length ? admin.from('users').select('id, phone, role').in('phone', phones.map((p) => toStoredPhone(p) ?? p)) : Promise.resolve({ data: [] as { id: string; phone: string | null; role: string }[] }),
    emails.length ? admin.from('users').select('id, email, role').in('email', emails) : Promise.resolve({ data: [] as { id: string; email: string | null; role: string }[] }),
  ]);
  const userByPhone = new Map((byPhone ?? []).map((u) => [(u.phone ?? '').replace(/\D/g, ''), u]));
  const userByEmail = new Map((byEmail ?? []).map((u) => [(u.email ?? '').toLowerCase(), u]));

  rows.forEach((values, i) => {
    const errors: string[] = [];
    const line = i + 2;
    const name = kind === 'mentor' ? values['이름'] : values['멘티이름'];
    const phoneDigits = (toStoredPhone(values['휴대폰'] ?? '') ?? values['휴대폰'] ?? '').replace(/\D/g, '');
    const email = (values['이메일'] ?? '').toLowerCase();
    const groupCode = kind === 'mentor' ? values['소속그룹코드'] : values['사업그룹코드'];
    if (!name) errors.push('이름 누락');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) errors.push('휴대폰 형식(10~11자리)');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('이메일 형식');
    if (kind === 'mentee' && !values['기업(팀)명']) errors.push('기업(팀)명 누락');
    if (kind === 'mentee' && !groupCode) errors.push('사업그룹코드 누락');
    if (groupCode) {
      const g = groupByCode.get(groupCode);
      if (!g) errors.push(`그룹코드 '${groupCode}' 없음`);
      else if (g.status !== 'active') errors.push(`그룹 '${groupCode}' 종료됨`);
    }
    if (phoneDigits && seenPhones.has(phoneDigits)) errors.push('파일 안 휴대폰 중복');
    seenPhones.add(phoneDigits);
    let existingUserId: string | undefined;
    const existing = userByPhone.get(phoneDigits) ?? (email ? userByEmail.get(email) : undefined);
    if (existing) {
      if (existing.role !== kind) errors.push(`이미 ${existing.role} 역할로 등록된 계정`);
      else existingUserId = existing.id;
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

/** 확정 — 유효 행만 생성. 기존 계정은 멤버십·명부만 추가. */
export async function commitImport(programId: string, kind: ImportKind, rows: ImportRow[], actorId: string): Promise<ImportResult> {
  const admin = createAdminClient();
  const { data: groups } = await admin.from('support_types').select('id, code').eq('program_id', programId);
  const groupByCode = new Map((groups ?? []).map((g) => [g.code, g.id]));
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
        }
        await admin.from('program_members').upsert({ program_id: programId, user_id: userId, role: 'mentor', is_active: true }, { onConflict: 'program_id,user_id' });
        const groupId = v['소속그룹코드'] ? groupByCode.get(v['소속그룹코드']) : undefined;
        if (groupId) {
          await admin.from('support_type_members').upsert({ support_type_id: groupId, user_id: userId, member_role: 'mentor', is_active: true, left_at: null }, { onConflict: 'support_type_id,user_id' });
        }
        await admin.from('mentor_profiles').upsert(
          {
            program_id: programId,
            user_id: userId,
            expertise: splitList(v['전문분야'] ?? ''),
            industries: splitList(v['업종'] ?? ''),
            regions: splitList(v['지역'] ?? ''),
            career: v['경력'] || null,
            bio: v['소개'] || null,
          },
          { onConflict: 'program_id,user_id' },
        );
      } else {
        const groupId = groupByCode.get(v['사업그룹코드']!);
        if (!groupId) throw new Error('그룹코드 없음');
        const created = await createCase({
          programId,
          createdBy: actorId,
          support_type_id: groupId,
          business_name: v['기업(팀)명']!,
          owner_name: v['멘티이름']!,
          phone: v['휴대폰']!,
          email: v['이메일'] || undefined,
          business_reg_no: v['사업자등록번호'] || undefined,
          address: v['주소'] || undefined,
          business_type: v['업종'] || undefined,
          item: v['아이템'] || undefined,
          opened_at: undefined,
          employee_count: undefined,
          menteeId: row.existingUserId ?? null,
        });
        if (!created.ok) throw new Error(created.error);
        if (created.menteeCredential) {
          result.created += 1;
          result.credentials.push({ line: row.line, name: v['멘티이름']!, email: created.menteeCredential.email, tempPassword: created.menteeCredential.tempPassword });
        } else {
          result.linked += 1;
        }
        await admin.from('mentee_profiles').upsert(
          {
            case_id: created.caseId,
            program_id: programId,
            industry: v['업종'] || null,
            stage: v['창업단계'] || null,
            region: v['지역'] || null,
            needs: splitList(v['필요분야'] ?? ''),
            summary: v['소개'] || null,
          },
          { onConflict: 'case_id' },
        );
      }
    } catch (err) {
      result.failed.push({ line: row.line, error: err instanceof Error ? err.message : '알 수 없는 오류' });
    }
  }

  await admin.from('audit_logs').insert({
    actor_id: actorId,
    program_id: programId,
    action: `import.${kind}`,
    entity_type: 'programs',
    entity_id: programId,
    metadata: { created: result.created, linked: result.linked, failed: result.failed.length },
  });
  return result;
}
