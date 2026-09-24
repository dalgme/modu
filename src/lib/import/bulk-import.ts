import 'server-only';

import * as XLSX from 'xlsx';

import { createAdminClient } from '@/lib/supabase/admin';
import { createStaffOrMentorAccount } from '@/lib/auth/admin-accounts';
import { toStoredPhone } from '@/lib/auth/identifier';
import { normalizeEmail, normalizePhone } from '@/lib/utils/phone';
import { createCase } from '@/lib/workflow/cases';
import { runProgramAutoMatch } from '@/lib/matching/auto-match';
import { STAFF_GRADES, GRADE_LABELS, type StaffGrade } from '@/lib/auth/capabilities';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { listTags } from '@/lib/settings/data';

/**
 * 멘토/멘티 엑셀 일괄 등록 (운영사) — 컬럼 재정의 2026-09-22 (P23), 견고화 2026-09-24 (P31).
 * 헤더는 첫 5행 안에서 자동 탐지하고, 별칭·공백·괄호 차이를 흡수한다. 미리보기(검증) → 확정(생성) 2단계.
 * 사업그룹은 컬럼이 아니라 업로드 화면에서 선택한다(멘티 필수, 멘토 선택).
 * 멘티는 [신규 등록] 외에 [기존 정보 갱신(update)] 모드가 있다 — 같은 그룹의 기존 케이스를 찾아 값이 있는 셀만 덮어쓴다.
 */
export type ImportKind = 'mentor' | 'mentee' | 'nextlab' | 'institution';
export type ImportMode = 'create' | 'update';

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

export function columnsOf(kind: ImportKind): readonly string[] {
  if (kind === 'mentor') return MENTOR_COLUMNS;
  if (kind === 'mentee') return MENTEE_COLUMNS;
  return STAFF_COLUMNS;
}

/* ── 헤더 인식 (P31) ───────────────────────────────────────────────────── */

/** 헤더 정규화: NFKC → 공백·괄호·구두점 제거 → 소문자 */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .normalize('NFKC')
    .replace(/[\s()（）[\]【】·・.:：/\\_-]/g, '')
    .toLowerCase();
}

/** 별칭 → 표준 컬럼. 키는 normalizeHeader 결과 */
const HEADER_ALIASES: Record<string, string> = {
  성명: '이름', 멘티명: '이름', 멘토명: '이름', 멘티이름: '이름', 멘토이름: '이름', 담당자명: '이름', 담당자: '이름', name: '이름',
  핸드폰: '휴대폰', 연락처: '휴대폰', 전화: '휴대폰', 전화번호: '휴대폰', 휴대전화: '휴대폰', 휴대폰번호: '휴대폰', 휴대전화번호: '휴대폰', 핸드폰번호: '휴대폰', 폰: '휴대폰', phone: '휴대폰', mobile: '휴대폰', tel: '휴대폰',
  메일: '이메일', 이메일주소: '이메일', 메일주소: '이메일', email: '이메일', 'e-mail': '이메일', emailaddress: '이메일',
  팀명: '닉네임', 활동명: '닉네임', 닉네임팀명: '닉네임', nickname: '닉네임',
  관리번호: '고유번호', 고유no: '고유번호', 고유번호선택: '고유번호',
  지역: '권역', 권역지역: '권역', region: '권역',
  멘티유형: '유형', 창업유형: '유형', type: '유형',
  아이템: '아이디어', 사업아이템: '아이디어', 아이템명: '아이디어', 창업아이템: '아이디어', 아이디어아이템: '아이디어', idea: '아이디어',
  멘토링희망분야: '희망분야', 희망멘토링분야: '희망분야', needs: '희망분야',
  재배치희망여부: '재배치 희망여부(멘토 이름)', 재배치희망여부멘토이름: '재배치 희망여부(멘토 이름)', 재배치희망: '재배치 희망여부(멘토 이름)', 희망멘토: '재배치 희망여부(멘토 이름)', 희망멘토이름: '재배치 희망여부(멘토 이름)', 희망멘토명: '재배치 희망여부(멘토 이름)', 재배치희망멘토: '재배치 희망여부(멘토 이름)',
  전문분야: '분야', 멘토분야: '분야', 분야전문분야: '분야', expertise: '분야',
  직책: '직위', position: '직위',
  회사: '소속', 기업명: '소속', 소속기업: '소속', 부서: '소속', organization: '소속',
  멘토기관: '소속멘토기관', 소속기관: '소속멘토기관', 멘토소속기관: '소속멘토기관',
  메모: '비고', 참고: '비고', note: '비고', 비고메모: '비고',
  등급: '등급(운영사)', 등급운영사: '등급(운영사)', 운영사등급: '등급(운영사)', grade: '등급(운영사)',
  담당역할: '담당역할(운영사)', 담당역할운영사: '담당역할(운영사)', 역할: '담당역할(운영사)', duty: '담당역할(운영사)',
};

/** 명시적으로 무시하는 헤더(내보내기 전용 컬럼·폐지된 그룹 컬럼) — 안내에는 '무시'로 표시 */
const IGNORED_HEADERS = new Set(['사업그룹', '그룹', '그룹코드', '라운드', '라운드정보', '순위', '계정상태', '진행상태', '회차', '담당멘토', '담당멘티', '배정상태', '이행회차', '서명', '이력서', '통장사본', '신분증사본', '멘토확인', '매칭일자', '방식', '만족도', '소속해제일', '가입일', '구분', '멘티순위'].map(normalizeHeader));

/** 정규화된 헤더 → 표준 컬럼 (해당 종류의 컬럼만) */
function resolveHeader(raw: unknown, kind: ImportKind): string | null {
  const n = normalizeHeader(raw);
  if (!n) return null;
  const columns = columnsOf(kind);
  const canon = new Map(columns.map((c) => [normalizeHeader(c), c]));
  const direct = canon.get(n);
  if (direct) return direct;
  const alias = HEADER_ALIASES[n];
  if (alias && columns.includes(alias)) return alias;
  return null;
}

export interface ParsedSheet {
  rows: { line: number; values: Record<string, string> }[];
  /** 파일에서 인식한 표준 컬럼 */
  recognized: string[];
  /** 파일에 있었지만 쓰지 않은 헤더 */
  ignored: string[];
  /** 헤더가 있던 엑셀 행 번호(1-based) */
  headerLine: number;
}
export type ParseResult = { ok: true; sheet: ParsedSheet } | { ok: false; error: string };

function cell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).normalize('NFKC').replace(/ /g, ' ').trim();
}

const XLSX_MAGIC = [0x50, 0x4b];
const XLS_MAGIC = [0xd0, 0xcf];
const UTF8_BOM = [0xef, 0xbb, 0xbf];

/**
 * 파일 → 워크북. CSV(텍스트)는 UTF-8 로 먼저 시도하고, BOM 없이 깨지는 바이트가 있으면 EUC-KR(코드페이지 949)로 다시 읽는다 (P31).
 * 엑셀 바이너리(xlsx/xls)는 그대로 읽는다.
 */
function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  const startsWith = (sig: number[]) => sig.every((b, i) => buffer[i] === b);
  if (startsWith(XLSX_MAGIC) || startsWith(XLS_MAGIC)) return XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (startsWith(UTF8_BOM)) return XLSX.read(buffer, { type: 'buffer', cellDates: true });
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (!text.includes('�')) return XLSX.read(text, { type: 'string', cellDates: true });
  } catch {
    /* utf-8 아님 → 아래 949 */
  }
  try {
    const text = new TextDecoder('euc-kr').decode(buffer);
    return XLSX.read(text, { type: 'string', cellDates: true });
  } catch {
    return XLSX.read(buffer, { type: 'buffer', cellDates: true, codepage: 949 });
  }
}

/**
 * 시트 파싱 — 첫 5행 안에서 헤더 행을 찾고(표준 컬럼·별칭 일치가 가장 많은 행), 표준 컬럼 키로 값을 매핑한다.
 * 이름·휴대폰 헤더가 없으면 '인식한 헤더 / 없는 필수 헤더' 를 담아 실패한다.
 */
export function parseSheet(buffer: Buffer, kind: ImportKind): ParseResult {
  const wb = readWorkbook(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws) return { ok: false, error: '시트가 없습니다.' };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: true });
  if (aoa.length === 0) return { ok: false, error: '데이터 행이 없습니다. (1행은 헤더)' };

  // 헤더 행 탐지
  let headerIdx = -1;
  let best = 0;
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    const hits = (aoa[i] ?? []).filter((h) => resolveHeader(h, kind)).length;
    if (hits > best) {
      best = hits;
      headerIdx = i;
    }
  }
  if (headerIdx < 0) return { ok: false, error: `헤더 행을 찾지 못했습니다(첫 5행 안에 '${columnsOf(kind).slice(0, 3).join('·')}…' 헤더가 있어야 합니다). 템플릿을 내려받아 사용하세요.` };
  const headerRow = aoa[headerIdx] ?? [];
  const colMap = new Map<number, string>();
  const recognized: string[] = [];
  const ignored: string[] = [];
  headerRow.forEach((h, idx) => {
    const raw = cell(h);
    if (!raw) return;
    const std = resolveHeader(raw, kind);
    if (std && !recognized.includes(std)) {
      colMap.set(idx, std);
      recognized.push(std);
    } else if (!std && !IGNORED_HEADERS.has(normalizeHeader(raw))) ignored.push(raw); // 내보내기 전용 컬럼(순위·진행상태 등)은 조용히 건너뛴다
  });
  const required = ['이름', '휴대폰'];
  const missing = required.filter((c) => !recognized.includes(c));
  if (missing.length) {
    const ignoredNote = ignored.length ? ` / 무시한 헤더: ${ignored.join(', ')}` : '';
    return { ok: false, error: `필수 헤더가 없습니다. 인식한 헤더: ${recognized.join(', ') || '(없음)'} / 없는 필수 헤더: ${missing.join(', ')}${ignoredNote}` };
  }
  const columns = columnsOf(kind);
  const rows: ParsedSheet['rows'] = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const line = r + 1; // 엑셀 행 번호 (__rowNum__ + 1 과 동일)
    const src = aoa[r] ?? [];
    const values: Record<string, string> = {};
    for (const col of columns) values[col] = '';
    let any = false;
    for (const [idx, col] of Array.from(colMap.entries())) {
      const v = cell(src[idx]);
      values[col] = v;
      if (v) any = true;
    }
    if (!any) continue;
    rows.push({ line, values });
  }
  return { ok: true, sheet: { rows, recognized, ignored: Array.from(new Set(ignored)), headerLine: headerIdx + 1 } };
}

/** 템플릿 xlsx 생성 (헤더 + 안내 1행 + 예시 1행). 휴대폰·고유번호 열은 텍스트 서식 (앞자리 0 보존, P31) */
export function buildTemplate(kind: ImportKind): Buffer {
  const columns = [...columnsOf(kind)];
  const example =
    kind === 'mentor'
      ? ['홍길동', '○○컨설팅', '010-1234-5678', 'mentor@example.com', '마케팅, 재무, 투자유치', '대표', '○○멘토단', '세종', '비고 메모']
      : kind === 'mentee'
        ? ['김멘티', '팀모두', 'M-001', '010-9876-5432', 'mentee@example.com', '세종', '예비창업', '앱 서비스', '사업계획서, 마케팅', '', '비고 메모']
        : ['박담당', 'staff@example.com', '010-5555-1234', kind === 'nextlab' ? '운영사' : '발주기관', '주임', kind === 'nextlab' ? 'pm' : '', kind === 'nextlab' ? '정산 담당' : '', '비고 메모'];
  const hint = columns.map((c) => {
    if (c === '이름') return '필수';
    if (c === '휴대폰') return '필수 · 숫자만 또는 010-0000-0000';
    if (c === '이메일') return '선택 · 없으면 자동 생성';
    if (c === '분야') return `콤마 구분, 최대 ${MAX_MENTOR_FIELDS}개`;
    if (c === '희망분야') return `콤마 구분, 최대 ${MAX_MENTEE_NEEDS}개`;
    if (c === '재배치 희망여부(멘토 이름)') return '희망 멘토 이름 (선택)';
    if (c === '등급(운영사)') return 'pl / pm / deputy_pm / observer 또는 한글 라벨';
    if (c === '고유번호') return '선택 · 재업로드·갱신 시 식별에 사용';
    return '';
  });
  // 2행 = 안내(회색 텍스트 대신 값으로), 3행 = 예시 — 업로드 시 안내 행은 이름/휴대폰이 '필수' 라 형식 오류로 걸러지므로 지우고 쓰도록 안내
  const ws = XLSX.utils.aoa_to_sheet([columns, hint, example]);
  const textCols = columns.map((c, i) => (c === '휴대폰' || c === '고유번호' ? i : -1)).filter((i) => i >= 0);
  for (const c of textCols) {
    for (let r = 0; r < 200; r++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const existing = ws[addr] as XLSX.CellObject | undefined;
      ws[addr] = { ...(existing ?? { t: 's', v: '' }), z: '@', t: 's' } as XLSX.CellObject;
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 199, c: columns.length - 1 } });
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.length * 2 + 2) }));
  const guide = XLSX.utils.aoa_to_sheet([
    ['안내'],
    ['· 1행 헤더는 수정하지 마세요. 2행(안내)·3행(예시)은 지우고 입력하세요. 헤더는 공백·괄호가 달라도 인식하며 "성명/핸드폰/연락처/메일" 같은 별칭도 인식합니다.'],
    ['· 휴대폰은 필수(로그인 아이디·임시 비밀번호). 숫자만 적어도 됩니다(앞자리 0 이 지워져도 복원). 이메일이 없으면 자동 생성됩니다.'],
    ['· 사업그룹은 파일이 아니라 업로드 화면에서 선택합니다. (멘티는 필수)'],
    ['· 이미 있는 계정(휴대폰/이메일 일치)은 새로 만들지 않고 이 행사에 초대만 합니다. 휴대폰과 이메일이 서로 다른 계정을 가리키면 오류로 표시됩니다.'],
    ['· 같은 파일 안에서 휴대폰·이메일·고유번호가 중복되면 오류입니다.'],
    ...(kind === 'mentor' ? [[`· 분야: 콤마(,)로 구분, 최대 ${MAX_MENTOR_FIELDS}개. 예) 마케팅, 재무, 투자유치. 운영 설정의 태그 사전에 없는 값은 경고로 표시됩니다.`]] : []),
    ...(kind === 'mentee'
      ? [
          [`· 희망분야: 콤마(,)로 구분, 최대 ${MAX_MENTEE_NEEDS}개.`],
          ['· 닉네임은 팀명·활동명입니다. 화면의 "이름/소속" 표기에 사용됩니다(비우면 이름).'],
          ['· 재배치 희망여부: 재배치(배정)를 희망하는 멘토 이름을 적습니다. 비우면 희망 없음. 등록된 멘토가 아니면 경고로 표시됩니다.'],
          ['· [기존 정보 갱신] 모드로 올리면 같은 그룹의 기존 멘티(휴대폰/이메일 또는 고유번호로 식별)의 값이 있는 셀만 덮어씁니다.'],
        ]
      : []),
    ...(kind === 'nextlab' ? [['· 등급: pl(메인 담당) / pm / deputy_pm(부PM) / observer(옵저버) — 한글 라벨(메인 담당(PL)·PM·부PM·옵저버)도 인식. 비우면 observer. pl 지정은 메인 담당자(PL)만 가능합니다.'], ['· 이미 소속된 운영사 담당자의 등급은 재업로드로 바뀌지 않습니다(PL 이 값을 적은 경우만).'], ['· 담당역할(운영사)은 운영사 담당자에게만 적용됩니다.']] : []),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, IMPORT_KIND_LABELS[kind]);
  XLSX.utils.book_append_sheet(wb, guide, '안내');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

/** 복수 값 분리 — 콤마·세미콜론·전각 콤마·가운뎃점·슬래시 (P31) */
export const splitList = (v: string) =>
  (v ?? '')
    .normalize('NFKC')
    .split(/[;,，、/·]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** 등급 셀 해석 — 코드·한글 라벨 모두 (P31) */
export function parseGradeCell(raw: string): StaffGrade | null {
  const v = (raw ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s/g, '');
  if (!v) return null;
  const norm = v.replace('sub_pm', 'deputy_pm').replace('subpm', 'deputy_pm').replace('부pm', 'deputy_pm');
  if ((STAFF_GRADES as string[]).includes(norm)) return norm as StaffGrade;
  for (const g of STAFF_GRADES) {
    const label = GRADE_LABELS[g].toLowerCase().replace(/\s/g, '');
    if (label === v || label.replace(/\(.*\)/, '') === v) return g;
  }
  if (v === '메인담당' || v === '메인담당자' || v === '메인') return 'pl';
  return null;
}

/* ── 미리보기 ──────────────────────────────────────────────────────────── */

export interface ImportRow {
  line: number;
  values: Record<string, string>;
  errors: string[];
  /** 경고 — 등록은 되지만 확인이 필요한 항목 (P31) */
  warnings: string[];
  /** 이미 존재하는 계정(휴대폰/이메일)과 연결됨 */
  existingUserId?: string;
  /** 갱신 모드: 찾은 기존 케이스 */
  existingCaseId?: string;
  /** 갱신 모드: 바뀔 필드 라벨 */
  changes?: string[];
  flags?: {
    /** 같은 그룹에 같은 이름의 멘티가 이미 있음 (동일인 의심) */
    suspectDuplicate?: boolean;
    /** 기존 계정이 이 행사 소속 해제 상태 — 재소속 체크 필요 */
    inactiveMembership?: boolean;
    /** 그룹 지정이 없던 기존 멘토가 이 그룹 전용으로 바뀜 */
    groupExclusive?: boolean;
  };
}

export interface ImportPreview {
  kind: ImportKind;
  mode: ImportMode;
  rows: ImportRow[];
  validCount: number;
  errorCount: number;
  warningCount: number;
  /** 확정 영향 집계 — 확인창에 표시 */
  counts: { new: number; linked: number; reactivate: number; groupExclusive: number; suspect: number; update: number };
  headers?: { recognized: string[]; ignored: string[]; headerLine: number };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface UserLite { id: string; name: string; email: string | null; phone: string | null; role: string }

/** 휴대폰(정규화 숫자)·이메일로 기존 계정 조회 — 청크·페이지 안전. 조회 오류는 throw (미리보기 실패) */
async function lookupAccounts(phones: string[], emails: string[]): Promise<{ byPhone: Map<string, UserLite[]>; byEmail: Map<string, UserLite>; all: Map<string, UserLite> }> {
  const admin = createAdminClient();
  const phoneKeys = Array.from(new Set(phones.flatMap((p) => [p, toStoredPhone(p) ?? p])));
  const [byPhoneRows, byEmailRows] = await Promise.all([
    fetchAllIn<UserLite>(phoneKeys, (chunk, from, to) => admin.from('users').select('id, name, email, phone, role').in('phone', chunk).range(from, to)),
    fetchAllIn<UserLite>(emails, (chunk, from, to) => admin.from('users').select('id, name, email, phone, role').in('email', chunk).range(from, to)),
  ]);
  const byPhone = new Map<string, UserLite[]>();
  for (const u of byPhoneRows) {
    const key = normalizePhone(u.phone) ?? (u.phone ?? '').replace(/\D/g, '');
    if (!key) continue;
    (byPhone.get(key) ?? byPhone.set(key, []).get(key)!).push(u);
  }
  const byEmail = new Map(byEmailRows.map((u) => [normalizeEmail(u.email), u]));
  const all = new Map<string, UserLite>();
  for (const u of [...byPhoneRows, ...byEmailRows]) all.set(u.id, u);
  return { byPhone, byEmail, all };
}

/** 태그 사전 (권역/유형/분야/희망분야) — 비어 있는 카테고리는 검사하지 않는다 */
async function loadTagDictionary(programId: string): Promise<Record<'권역' | '유형' | '분야' | '희망분야', Set<string> | null>> {
  const tags = await listTags(programId).catch(() => []);
  const by = (cats: string[]) => {
    const set = new Set(tags.filter((t) => cats.includes(t.category)).map((t) => t.label.normalize('NFKC').trim()));
    return set.size ? set : null;
  };
  return { 권역: by(['region']), 유형: by(['stage', 'custom']), 분야: by(['expertise']), 희망분야: by(['need', 'expertise']) };
}

/** 이 행사의 멘토 이름 → 인원 수 (희망 멘토 검증) */
async function loadMentorNames(programId: string): Promise<Map<string, number>> {
  const admin = createAdminClient();
  const members = await fetchAll<{ user_id: string }>((from, to) => admin.from('program_members').select('user_id').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true).range(from, to));
  const users = await fetchAllIn<{ id: string; name: string }>(members.map((m) => m.user_id), (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to));
  const map = new Map<string, number>();
  for (const u of users) {
    const k = (u.name ?? '').replace(/\s+/g, '');
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

interface GroupCase { id: string; mentee_id: string | null; owner_name: string; business_name: string; item: string | null; status: string }
interface GroupProfile { case_id: string; nickname: string | null; external_no: string | null; region: string | null; mentee_type: string | null; needs: string[]; preferred_mentor: string | null; note: string | null }

/** 그룹의 진행 중 케이스 + 프로필 (멘티 미리보기 — 동일인 의심·갱신 매칭) */
async function loadGroupCases(groupId: string): Promise<{ cases: GroupCase[]; profiles: Map<string, GroupProfile> }> {
  const admin = createAdminClient();
  const cases = await fetchAll<GroupCase>((from, to) => admin.from('cases').select('id, mentee_id, owner_name, business_name, item, status').eq('support_type_id', groupId).neq('status', 'withdrawn').range(from, to));
  const profiles = await fetchAllIn<GroupProfile>(cases.map((c) => c.id), (chunk, from, to) => admin.from('mentee_profiles').select('case_id, nickname, external_no, region, mentee_type, needs, preferred_mentor, note').in('case_id', chunk).range(from, to));
  return { cases, profiles: new Map(profiles.map((p) => [p.case_id, p])) };
}

/**
 * 검증 — DB 는 조회만. 필수값·형식·복수값 상한·파일 내 중복·기존 계정 매칭·태그 사전·희망 멘토·동일인 의심·소속 해제 계정 (그룹은 액션에서 검증)
 * rows 는 `{ line, values }` 또는 값만(구 호출: 행 번호는 i+2) 둘 다 받는다.
 */
export async function previewImport(
  programId: string,
  kind: ImportKind,
  rows: (Record<string, string> | { line: number; values: Record<string, string> })[],
  groupId?: string | null,
  mode: ImportMode = 'create',
): Promise<ImportPreview> {
  const admin = createAdminClient();
  const normalized = rows.map((r, i) => ('values' in r && typeof (r as { line?: unknown }).line === 'number' ? (r as { line: number; values: Record<string, string> }) : { line: i + 2, values: r as Record<string, string> }));
  if (mode === 'update' && kind !== 'mentee') mode = 'create';

  const phones = normalized.map((r) => normalizePhone(r.values['휴대폰'])).filter((p): p is string => !!p);
  const emails = normalized.map((r) => normalizeEmail(r.values['이메일'])).filter(Boolean);
  const [{ byPhone, byEmail, all }, tagDict, mentorNames, group] = await Promise.all([
    lookupAccounts(phones, emails),
    kind === 'mentee' || kind === 'mentor' ? loadTagDictionary(programId) : Promise.resolve(null),
    kind === 'mentee' ? loadMentorNames(programId) : Promise.resolve(new Map<string, number>()),
    kind === 'mentee' && groupId ? loadGroupCases(groupId) : Promise.resolve(null),
  ]);
  const matchedIds = Array.from(all.keys());
  // 역할 충돌·소속 상태는 "이 행사 안의 역할" 기준 (설계 B — users.role 로 사람을 거르지 말 것)
  const memberships = await fetchAllIn<{ user_id: string; role: string; is_active: boolean; left_at: string | null }>(matchedIds, (chunk, from, to) =>
    admin.from('program_members').select('user_id, role, is_active, left_at').eq('program_id', programId).in('user_id', chunk).range(from, to),
  );
  const membershipByUser = new Map(memberships.map((m) => [m.user_id, m]));
  // 기존 멘토의 그룹 지정 (그룹 전용화 경고)
  const designations = new Map<string, number>();
  if (kind === 'mentor' && groupId && matchedIds.length) {
    const rows2 = await fetchAllIn<{ user_id: string; support_type_id: string; support_types: { program_id: string } | null }>(matchedIds, (chunk, from, to) =>
      admin.from('support_type_members').select('user_id, support_type_id, support_types!inner(program_id)').eq('member_role', 'mentor').eq('is_active', true).eq('support_types.program_id', programId).in('user_id', chunk).range(from, to),
    );
    for (const r of rows2) designations.set(r.user_id, (designations.get(r.user_id) ?? 0) + 1);
  }
  const openCaseByUser = new Map<string, GroupCase>();
  const caseByExternalNo = new Map<string, GroupCase[]>();
  const casesByName = new Map<string, GroupCase[]>();
  if (group) {
    for (const c of group.cases) {
      if (c.mentee_id) openCaseByUser.set(c.mentee_id, c);
      const nameKey = c.owner_name.replace(/\s+/g, '');
      (casesByName.get(nameKey) ?? casesByName.set(nameKey, []).get(nameKey)!).push(c);
      const no = group.profiles.get(c.id)?.external_no?.trim();
      if (no) (caseByExternalNo.get(no) ?? caseByExternalNo.set(no, []).get(no)!).push(c);
    }
  }

  // 파일 안 중복 (휴대폰·이메일·고유번호·(멘토)이름)
  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const seenNo = new Map<string, number>();
  const seenName = new Map<string, number>();
  const out: ImportRow[] = [];
  const counts = { new: 0, linked: 0, reactivate: 0, groupExclusive: 0, suspect: 0, update: 0 };

  for (const { line, values } of normalized) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const flags: NonNullable<ImportRow['flags']> = {};
    const name = (values['이름'] ?? '').trim();
    const nameKey = name.replace(/\s+/g, '');
    const phoneDigits = normalizePhone(values['휴대폰']);
    const email = normalizeEmail(values['이메일']);
    if (email !== (values['이메일'] ?? '')) values['이메일'] = email;
    if (!name) errors.push('이름 누락');
    if (!phoneDigits) errors.push(values['휴대폰'] ? `휴대폰 형식(${values['휴대폰']}) — 01X 로 시작하는 10~11자리` : '휴대폰 누락');
    if (email && !EMAIL_RE.test(email)) errors.push('이메일 형식');
    if (kind === 'mentor' && splitList(values['분야'] ?? '').length > MAX_MENTOR_FIELDS) errors.push(`분야는 최대 ${MAX_MENTOR_FIELDS}개`);
    if (kind === 'mentee' && splitList(values['희망분야'] ?? '').length > MAX_MENTEE_NEEDS) errors.push(`희망분야는 최대 ${MAX_MENTEE_NEEDS}개`);
    if (phoneDigits) {
      const prev = seenPhone.get(phoneDigits);
      if (prev) errors.push(`파일 안 휴대폰 중복 (${prev}행)`);
      else seenPhone.set(phoneDigits, line);
    }
    if (email) {
      const prev = seenEmail.get(email);
      if (prev) errors.push(`파일 안 이메일 중복 (${prev}행)`);
      else seenEmail.set(email, line);
    }
    const externalNo = (values['고유번호'] ?? '').trim();
    if (kind === 'mentee' && externalNo) {
      const prev = seenNo.get(externalNo);
      if (prev) errors.push(`파일 안 고유번호 중복 (${prev}행)`);
      else seenNo.set(externalNo, line);
    }
    if (kind === 'mentor' && nameKey) {
      const prev = seenName.get(nameKey);
      if (prev) errors.push(`파일 안 멘토 이름 중복 (${prev}행) — 동명이인이면 휴대폰으로 구분됩니다`);
      else seenName.set(nameKey, line);
    }
    // 태그 사전 (경고)
    if (tagDict) {
      const check = (col: keyof typeof tagDict, multi: boolean) => {
        const dict = tagDict[col];
        const raw = values[col] ?? '';
        if (!dict || !raw) return;
        const vals = multi ? splitList(raw) : [raw.normalize('NFKC').trim()];
        const unknown = vals.filter((v) => !dict.has(v));
        if (unknown.length) warnings.push(`${col} 사전에 없는 값: ${unknown.join(', ')}`);
      };
      if (kind === 'mentee') {
        check('권역', false);
        check('유형', false);
        check('희망분야', true);
      } else if (kind === 'mentor') {
        check('권역', true);
        check('분야', true);
      }
    }
    // 희망 멘토 (경고)
    if (kind === 'mentee') {
      const pref = (values['재배치 희망여부(멘토 이름)'] ?? '').replace(/\s+/g, '');
      if (pref) {
        const n = mentorNames.get(pref) ?? 0;
        if (n === 0) warnings.push(`희망 멘토 '${values['재배치 희망여부(멘토 이름)']}' 은(는) 이 행사에 등록된 멘토가 아닙니다`);
        else if (n > 1) warnings.push(`희망 멘토 '${values['재배치 희망여부(멘토 이름)']}' 동명이인 ${n}명 — 자동 확정에서 제외됩니다`);
      }
    }

    // 기존 계정 매칭 — 휴대폰과 이메일이 서로 다른 계정이면 오류
    let existingUserId: string | undefined;
    const phoneHits = phoneDigits ? (byPhone.get(phoneDigits) ?? []) : [];
    const emailHit = email ? byEmail.get(email) : undefined;
    if (phoneHits.length > 1) errors.push('같은 휴대폰의 계정이 2개 이상입니다 — 회원 명단에서 정리하세요');
    const phoneHit = phoneHits.length === 1 ? phoneHits[0] : undefined;
    if (phoneHit && emailHit && phoneHit.id !== emailHit.id) errors.push(`휴대폰은 '${phoneHit.name}' 계정, 이메일은 '${emailHit.name}' 계정을 가리킵니다 — 하나로 맞추세요`);
    const existing = phoneHit ?? emailHit;
    if (existing && errors.length === 0) {
      const mem = membershipByUser.get(existing.id);
      const programRole = mem?.role;
      if (programRole && programRole !== kind) errors.push(`이 행사에서 이미 ${IMPORT_KIND_LABELS[programRole as ImportKind] ?? programRole} 역할로 등록된 계정`);
      else if (mode === 'create' && kind === 'mentee' && openCaseByUser.has(existing.id)) errors.push('이 그룹에 이미 등록된 멘티(중복 행 또는 재업로드) — 정보를 고치려면 [기존 정보 갱신] 모드');
      else if (existing.name && name && existing.name.replace(/\s+/g, '') !== nameKey) errors.push(`같은 휴대폰/이메일의 기존 계정 이름(${existing.name})과 다릅니다 — 번호를 확인하세요`);
      else {
        existingUserId = existing.id; // 이 행사 소속이 아니면 기존 계정을 이 역할로 초대(설계 B)
        if (mem && (!mem.is_active || mem.left_at)) {
          flags.inactiveMembership = true;
          warnings.push('이 행사 소속이 해제된 계정 — "소속 해제 회원 재추가" 를 켜야 등록됩니다');
        }
        if (kind === 'mentor' && groupId && mem?.role === 'mentor' && (designations.get(existing.id) ?? 0) === 0) {
          flags.groupExclusive = true;
          warnings.push('그룹 지정이 없던 멘토 — 등록 후 이 그룹 전용으로 바뀝니다');
        }
      }
    }

    // 갱신 모드 — 기존 케이스 찾기 + 변경 필드
    let existingCaseId: string | undefined;
    let changes: string[] | undefined;
    if (mode === 'update' && group) {
      const byAccount = existingUserId ? openCaseByUser.get(existingUserId) : undefined;
      const byNo = externalNo ? (caseByExternalNo.get(externalNo) ?? []) : [];
      const target = byAccount ?? (byNo.length === 1 ? byNo[0] : undefined);
      if (byNo.length > 1 && !byAccount) errors.push(`고유번호 '${externalNo}' 케이스가 ${byNo.length}건 — 휴대폰/이메일로 식별하세요`);
      else if (!target) errors.push('이 그룹에서 기존 케이스를 찾지 못했습니다 (휴대폰·이메일·고유번호로 식별). 신규 등록은 [신규 등록] 모드');
      else if (byAccount && byNo.length === 1 && byNo[0]!.id !== byAccount.id) errors.push('휴대폰/이메일의 케이스와 고유번호의 케이스가 다릅니다');
      else {
        existingCaseId = target.id;
        const p = group.profiles.get(target.id);
        changes = [];
        const diff = (label: string, cellVal: string, current: string | null | undefined) => {
          if (cellVal && cellVal !== (current ?? '')) changes!.push(label);
        };
        diff('닉네임', values['닉네임'] ?? '', p?.nickname ?? target.business_name);
        diff('고유번호', externalNo, p?.external_no);
        diff('권역', values['권역'] ?? '', p?.region);
        diff('유형', values['유형'] ?? '', p?.mentee_type);
        diff('아이디어', values['아이디어'] ?? '', target.item);
        diff('희망분야', splitList(values['희망분야'] ?? '').join(', '), (p?.needs ?? []).join(', '));
        diff('희망 멘토', values['재배치 희망여부(멘토 이름)'] ?? '', p?.preferred_mentor);
        diff('비고', values['비고'] ?? '', p?.note);
        if (changes.length === 0) warnings.push('바뀌는 값이 없습니다');
      }
    }
    // 동일인 의심 (신규 등록·멘티): 같은 그룹에 같은 이름의 다른 멘티
    if (mode === 'create' && kind === 'mentee' && group && nameKey && errors.length === 0) {
      const same = (casesByName.get(nameKey) ?? []).filter((c) => !existingUserId || c.mentee_id !== existingUserId);
      if (same.length) {
        flags.suspectDuplicate = true;
        counts.suspect += 1;
        warnings.push(`동일인 의심: 이 그룹에 같은 이름의 멘티 ${same.length}명이 이미 있습니다 (${same.map((c) => c.business_name).join(', ')})`);
      }
    }

    if (errors.length === 0) {
      if (mode === 'update') counts.update += 1;
      else if (existingUserId) counts.linked += 1;
      else counts.new += 1;
      if (flags.inactiveMembership) counts.reactivate += 1;
      if (flags.groupExclusive) counts.groupExclusive += 1;
    }
    out.push({ line, values, errors, warnings, existingUserId, existingCaseId, changes, flags: Object.keys(flags).length ? flags : undefined });
  }
  return {
    kind,
    mode,
    rows: out,
    validCount: out.filter((r) => r.errors.length === 0).length,
    errorCount: out.filter((r) => r.errors.length > 0).length,
    warningCount: out.filter((r) => r.warnings.length > 0).length,
    counts,
  };
}

/* ── 확정 ──────────────────────────────────────────────────────────────── */

export type ImportRowStatus = 'created' | 'linked' | 'updated' | 'failed' | 'skipped';

export interface ImportResultRow {
  line: number;
  name: string;
  phone: string;
  /** 로그인 아이디(이메일) */
  email: string;
  tempPassword?: string;
  status: ImportRowStatus;
  reason?: string;
}

export interface ImportResult {
  created: number;
  linked: number;
  updated: number;
  reactivated: number;
  failed: { line: number; error: string }[];
  /** 건너뛴 행 (재소속·동일인 의심 미허용 등) */
  skipped: { line: number; reason: string }[];
  credentials: { line: number; name: string; email: string; tempPassword: string }[];
  /** 행별 결과 — 결과 엑셀용 */
  rows: ImportResultRow[];
}

export interface CommitOptions {
  actorIsPL?: boolean;
  mode?: ImportMode;
  /** 청크 커밋: 마지막 청크가 아니면 자동 매칭을 건너뛴다 (P31) */
  skipAutoMatch?: boolean;
  /** 소속 해제(비활성) 회원을 다시 소속시킨다 */
  allowReactivate?: boolean;
  /** 동일인 의심 행도 등록한다 */
  allowSuspectDuplicates?: boolean;
}

/**
 * 확정 — 유효 행만 생성. 기존 계정은 멤버십·명부만 추가. groupId 는 액션이 검증해 넘긴다(멘티 필수, 멘토 선택).
 * 재업로드 보호: 기존 계정은 **값이 있는 셀만** 반영한다(빈 셀로 분야·권역·비고를 지우지 않음).
 * 운영사 등급: 빈 셀 = observer(신규). 기존 운영사 담당자의 등급은 actor 가 PL 이고 셀에 값이 있을 때만 바뀐다. 'pl' 지정은 PL 만.
 * 멘티 갱신 모드: 기존 케이스의 프로필·아이디어·닉네임만 값이 있는 셀로 덮어쓴다(계정·상태는 건드리지 않음).
 */
export async function commitImport(programId: string, kind: ImportKind, rows: ImportRow[], actorId: string, groupId?: string | null, opts: CommitOptions = {}): Promise<ImportResult> {
  const admin = createAdminClient();
  const result: ImportResult = { created: 0, linked: 0, updated: 0, reactivated: 0, failed: [], skipped: [], credentials: [], rows: [] };
  const actorIsPL = opts.actorIsPL === true;
  const mode: ImportMode = opts.mode === 'update' && kind === 'mentee' ? 'update' : 'create';
  const push = (row: ImportRow, status: ImportRowStatus, extra: Partial<ImportResultRow> = {}) =>
    result.rows.push({ line: row.line, name: row.values['이름'] ?? '', phone: toStoredPhone(row.values['휴대폰']) ?? row.values['휴대폰'] ?? '', email: row.values['이메일'] ?? '', status, ...extra });

  /** 소속 해제 계정의 재소속 (program_members 활성화) */
  const reactivate = async (userId: string, role: ImportKind) => {
    const { error } = await admin.from('program_members').update({ is_active: true, left_at: null, role }).eq('program_id', programId).eq('user_id', userId);
    if (error) throw new Error(`재소속 실패: ${error.message}`);
    result.reactivated += 1;
  };

  for (const row of rows) {
    if (row.errors.length > 0) continue;
    const v = row.values;
    if (row.flags?.inactiveMembership && !opts.allowReactivate) {
      const reason = '소속 해제된 회원 — "소속 해제 회원 재추가" 를 켜야 등록됩니다';
      result.skipped.push({ line: row.line, reason });
      push(row, 'skipped', { reason });
      continue;
    }
    if (row.flags?.suspectDuplicate && !opts.allowSuspectDuplicates) {
      const reason = '동일인 의심 — "동일인 의심 행도 등록" 을 켜야 등록됩니다';
      result.skipped.push({ line: row.line, reason });
      push(row, 'skipped', { reason });
      continue;
    }
    try {
      const phone = toStoredPhone(v['휴대폰'] ?? '') ?? v['휴대폰']!;
      const phoneDigits = normalizePhone(phone) ?? phone.replace(/\D/g, '');
      if (kind === 'mentor') {
        let userId = row.existingUserId;
        const email = normalizeEmail(v['이메일']) || `m-${phoneDigits}@mentor.local`;
        let status: ImportRowStatus = 'linked';
        let tempPassword: string | undefined;
        if (!userId) {
          const acc = await createStaffOrMentorAccount({ email, name: v['이름']!, phone, role: 'mentor', organization: v['소속'] || undefined, position: v['직위'] || undefined, actorId, programId });
          userId = acc.userId;
          result.created += 1;
          status = 'created';
          tempPassword = acc.tempPassword;
          result.credentials.push({ line: row.line, name: v['이름']!, email: acc.email, tempPassword: acc.tempPassword });
        } else {
          result.linked += 1;
          // 기존 계정은 파일에 값이 있을 때만 갱신 — 빈 칸으로 기존 소속·직위를 지우지 않는다
          const patch: { organization?: string; position?: string } = {};
          if (v['소속']) patch.organization = v['소속'];
          if (v['직위']) patch.position = v['직위'];
          if (Object.keys(patch).length > 0) await admin.from('users').update(patch).eq('id', userId);
        }
        if (row.flags?.inactiveMembership) await reactivate(userId, 'mentor');
        const { error: memberError } = await admin.from('program_members').upsert({ program_id: programId, user_id: userId, role: 'mentor', is_active: true, left_at: null }, { onConflict: 'program_id,user_id' });
        if (memberError) throw new Error(`행사 소속 등록 실패: ${memberError.message}`);
        if (groupId) {
          const { error: rosterError } = await admin.from('support_type_members').upsert({ support_type_id: groupId, user_id: userId, member_role: 'mentor', is_active: true, left_at: null }, { onConflict: 'support_type_id,user_id' });
          if (rosterError) throw new Error(`그룹 지정 실패: ${rosterError.message}`);
        }
        if (row.existingUserId) {
          // 기존 계정: 값이 있는 셀만 반영 (빈 셀로 기존 프로필을 지우지 않는다)
          const profilePatch: { expertise?: string[]; regions?: string[]; mentor_institution?: string; note?: string } = {};
          const expertise = splitList(v['분야'] ?? '').slice(0, MAX_MENTOR_FIELDS);
          const regions = splitList(v['권역'] ?? '');
          if (expertise.length) profilePatch.expertise = expertise;
          if (regions.length) profilePatch.regions = regions;
          if (v['소속멘토기관']) profilePatch.mentor_institution = v['소속멘토기관'];
          if (v['비고']) profilePatch.note = v['비고'];
          const { data: existingProfile } = await admin.from('mentor_profiles').select('user_id').eq('program_id', programId).eq('user_id', userId).maybeSingle();
          if (existingProfile) {
            if (Object.keys(profilePatch).length) await admin.from('mentor_profiles').update(profilePatch).eq('program_id', programId).eq('user_id', userId);
          } else {
            await admin.from('mentor_profiles').insert({ program_id: programId, user_id: userId, expertise, regions, mentor_institution: v['소속멘토기관'] || null, note: v['비고'] || null });
          }
        } else {
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
        }
        push(row, status, { email, tempPassword });
      } else if (kind === 'nextlab' || kind === 'institution') {
        let userId = row.existingUserId;
        const email = normalizeEmail(v['이메일']) || `s-${phoneDigits}@staff.local`;
        let status: ImportRowStatus = 'linked';
        let tempPassword: string | undefined;
        if (!userId) {
          const acc = await createStaffOrMentorAccount({ email, name: v['이름']!, phone, role: kind, organization: v['소속'] || undefined, position: v['직위'] || undefined, actorId, programId });
          userId = acc.userId;
          result.created += 1;
          status = 'created';
          tempPassword = acc.tempPassword;
          result.credentials.push({ line: row.line, name: v['이름']!, email: acc.email, tempPassword: acc.tempPassword });
        } else {
          result.linked += 1;
          // 기존 계정: 소속·직위는 값이 있을 때만
          const patch: { organization?: string; position?: string } = {};
          if (v['소속']) patch.organization = v['소속'];
          if (v['직위']) patch.position = v['직위'];
          if (Object.keys(patch).length > 0) await admin.from('users').update(patch).eq('id', userId);
        }
        if (row.flags?.inactiveMembership) result.reactivated += 1;
        const gradeCell = parseGradeCell(v['등급(운영사)'] ?? '');
        // pl 지정은 PL 만 — 아니면 옵저버로 낮춘다 (자기 승격·대량 PL 발급 차단)
        const requestedGrade = gradeCell === 'pl' && !actorIsPL ? 'observer' : gradeCell;
        const { data: existingMember } = await admin.from('program_members').select('role, grade, duty, note').eq('program_id', programId).eq('user_id', userId).maybeSingle();
        let grade: string | null = null;
        if (kind === 'nextlab') {
          if (existingMember?.role === 'nextlab' && existingMember.grade) {
            // 기존 운영사 담당자의 등급은 PL 이 값을 적은 경우에만 변경
            grade = actorIsPL && requestedGrade ? requestedGrade : existingMember.grade;
          } else grade = requestedGrade ?? 'observer';
        }
        const duty = kind === 'nextlab' ? (v['담당역할(운영사)'] || existingMember?.duty || null) : null;
        const note = v['비고'] || existingMember?.note || null;
        const { error: memberError } = await admin
          .from('program_members')
          .upsert({ program_id: programId, user_id: userId, role: kind, grade, duty, note, is_active: true, left_at: null }, { onConflict: 'program_id,user_id' });
        if (memberError) throw new Error(`행사 소속 등록 실패: ${memberError.message}`);
        push(row, status, { email, tempPassword });
      } else if (mode === 'update') {
        if (!groupId) throw new Error('사업그룹을 선택하세요');
        if (!row.existingCaseId) throw new Error('기존 케이스를 찾지 못했습니다');
        const { data: c } = await admin.from('cases').select('id, support_type_id, status').eq('id', row.existingCaseId).eq('program_id', programId).maybeSingle();
        if (!c || c.support_type_id !== groupId || c.status === 'withdrawn') throw new Error('기존 케이스가 이 그룹의 진행 중 케이스가 아닙니다');
        const casePatch: { item?: string; business_name?: string } = {};
        if (v['아이디어']) casePatch.item = v['아이디어'];
        if (v['닉네임']) casePatch.business_name = v['닉네임'];
        if (Object.keys(casePatch).length) {
          const { error } = await admin.from('cases').update(casePatch).eq('id', c.id);
          if (error) throw new Error(`케이스 갱신 실패: ${error.message}`);
        }
        const profilePatch: { nickname?: string; external_no?: string; region?: string; mentee_type?: string; needs?: string[]; preferred_mentor?: string; note?: string } = {};
        if (v['닉네임']) profilePatch.nickname = v['닉네임'];
        if (v['고유번호']) profilePatch.external_no = v['고유번호'];
        if (v['권역']) profilePatch.region = v['권역'];
        if (v['유형']) profilePatch.mentee_type = v['유형'];
        const needs = splitList(v['희망분야'] ?? '').slice(0, MAX_MENTEE_NEEDS);
        if (needs.length) profilePatch.needs = needs;
        if (v['재배치 희망여부(멘토 이름)']) profilePatch.preferred_mentor = v['재배치 희망여부(멘토 이름)'];
        if (v['비고']) profilePatch.note = v['비고'];
        if (Object.keys(profilePatch).length) {
          const { data: existingProfile } = await admin.from('mentee_profiles').select('case_id').eq('case_id', c.id).maybeSingle();
          const { error } = existingProfile
            ? await admin.from('mentee_profiles').update(profilePatch).eq('case_id', c.id)
            : await admin.from('mentee_profiles').insert({ case_id: c.id, program_id: programId, ...profilePatch });
          if (error) throw new Error(`프로필 갱신 실패: ${error.message}`);
        }
        result.updated += 1;
        push(row, 'updated', { reason: (row.changes ?? []).join(', ') || '변경 없음' });
      } else {
        if (!groupId) throw new Error('사업그룹을 선택하세요');
        const created = await createCase({
          programId,
          createdBy: actorId,
          support_type_id: groupId,
          // 닉네임(팀명·활동명)이 "이름/소속" 표기의 소속 자리 — 비우면 이름으로 채운다
          business_name: v['닉네임'] || v['이름']!,
          owner_name: v['이름']!,
          phone,
          email: normalizeEmail(v['이메일']) || undefined,
          item: v['아이디어'] || undefined,
          business_reg_no: undefined,
          address: undefined,
          business_type: undefined,
          opened_at: undefined,
          employee_count: undefined,
          menteeId: row.existingUserId ?? null,
        });
        if (!created.ok) throw new Error(created.error);
        // 계정 발급 실패는 createCase 가 삼키므로 케이스의 mentee_id 로 다시 확인한다 (P31) — 연결 실패를 '기존 연결'로 세지 않는다
        const { data: caseRow } = await admin.from('cases').select('mentee_id').eq('id', created.caseId).maybeSingle();
        const menteeId = caseRow?.mentee_id ?? null;
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
        if (!menteeId) {
          const reason = '멘티 계정 발급 실패(케이스는 생성됨) — 회원 명단에서 계정을 연결하세요';
          result.failed.push({ line: row.line, error: reason });
          push(row, 'failed', { reason });
          continue;
        }
        if (row.flags?.inactiveMembership) await reactivate(menteeId, 'mentee');
        if (created.menteeCredential) {
          result.created += 1;
          result.credentials.push({ line: row.line, name: v['이름']!, email: created.menteeCredential.email, tempPassword: created.menteeCredential.tempPassword });
          push(row, 'created', { email: created.menteeCredential.email, tempPassword: created.menteeCredential.tempPassword });
        } else {
          result.linked += 1;
          push(row, 'linked');
        }
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : '알 수 없는 오류';
      result.failed.push({ line: row.line, error: reason });
      push(row, 'failed', { reason });
    }
  }

  // P24 자동 매칭 — 행마다 돌리면 O(행수 × 미배정 케이스수) 쿼리가 되어 일괄 등록이 분 단위로 느려진다.
  // 전체 등록이 끝난 뒤 배치로 1회만 실행한다(자동 확정 + 추천 재계산 + 전원 배정 문자). 청크 커밋은 마지막 청크에서만 (P31).
  if ((kind === 'mentor' || kind === 'mentee') && !opts.skipAutoMatch) {
    try {
      await runProgramAutoMatch(programId, actorId);
    } catch (err) {
      console.error('batch auto match after import failed:', err instanceof Error ? err.message : err);
    }
  }

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: actorId,
    program_id: programId,
    action: `import.${kind}`,
    entity_type: 'programs',
    entity_id: programId,
    metadata: { mode, created: result.created, linked: result.linked, updated: result.updated, reactivated: result.reactivated, failed: result.failed.length, skipped: result.skipped.length, group_id: groupId ?? null, chunk: opts.skipAutoMatch ? 'partial' : 'final' },
  });
  if (auditError) console.error('[bulk-import] audit insert failed:', auditError.message);
  return result;
}

/** 자동 매칭만 실행 (청크 커밋 마무리, P31) */
export async function finishImportAutoMatch(programId: string, actorId: string): Promise<void> {
  try {
    await runProgramAutoMatch(programId, actorId);
  } catch (err) {
    console.error('batch auto match after import failed:', err instanceof Error ? err.message : err);
  }
}
