/**
 * 멘티 사업계획서 파일명 → 멘티 귀속 규칙 (2026-09-30) — 서버·클라이언트 공용 순수 함수(DB 접근 없음).
 * 규칙: 파일명 **맨 앞**에 멘티 이름을 적는다. 예) `홍길동_사업계획서.pdf`, `홍길동-참고자료.hwp`, `[홍길동] 사업계획서.docx`
 *  - 이름 사이 공백은 무시(`홍 길동_…` = 홍길동), macOS 한글 자모 분리(NFD) 파일명도 NFKC 로 합쳐 비교한다.
 *  - 이름 뒤에는 구분자(_ - 공백 . ( [ 등)가 와야 한다 — `김민수_…` 가 라운드의 `김민` 에게 붙는 사고를 막는다.
 *    다만 구분자 없이 `홍길동사업계획서.pdf` 처럼 흔한 서류 낱말이 바로 붙은 경우는 허용한다.
 *  - 이름이 긴 멘티부터 대조한다(`홍길동` 과 `홍길` 이 함께 있으면 `홍길동_…` 은 홍길동).
 *  - 동명이인(같은 이름의 다른 사람)은 이름 바로 뒤에 고유번호 또는 닉네임을 적어 구분한다.
 *    예) `홍길동(A-012)_사업계획서.pdf`, `홍길동_A-012_사업계획서.pdf`, `홍길동(길동상회)_사업계획서.pdf`
 * 화면(업로드 전 미리보기)과 서버 액션(최종 판정)이 이 함수 하나를 쓴다.
 */

export interface MenteeMatchCandidate {
  caseId: string;
  /** 멘티 이름 (cases.owner_name) */
  name: string;
  /** 고유번호 (mentee_profiles.external_no) */
  externalNo?: string | null;
  /** 닉네임 (cases.business_name — 이름과 같으면 무시) */
  nickname?: string | null;
}

export type MenteeFileMatch =
  | { ok: true; caseId: string; name: string }
  | { ok: false; reason: 'no_match' | 'ambiguous'; message: string };

/** 이름 뒤 구분자로 인정하는 문자 */
const SEP = /^[\s_\-.·,()[\]{}【】「」『』<>~+#&（）［］]/;
/** 구분자 없이 이름 바로 뒤에 붙어도 인정하는 서류 낱말 (소문자·공백 제거 기준) */
const LOOSE_WORDS = ['사업계획', '계획서', '참고', '자료', '사업', '발표', '보고서', '증빙', '제출', '첨부', '최종', '수정', 'ir'];

const nfkc = (s: string) => (s ?? '').normalize('NFKC');
/** 비교 키: NFKC · 공백 제거 · 소문자 */
export const compactKey = (s: string | null | undefined) => nfkc(s ?? '').replace(/\s+/g, '').toLowerCase();

/** 확장자(점 뒤 1~8자) 제거 */
function stripExt(fileName: string): string {
  return fileName.replace(/\.[A-Za-z0-9]{1,8}$/, '');
}

/** 앞쪽 구분자·괄호 제거 */
function stripLeadingSeps(s: string): string {
  let out = s;
  while (out.length > 0 && SEP.test(out)) out = out.slice(1);
  return out;
}

/**
 * base 가 key(공백 제거·소문자)로 시작하는지 — base 쪽 공백은 건너뛴다. 맞으면 base 에서 이름이 끝난 위치, 아니면 -1.
 */
function prefixEnd(base: string, key: string): number {
  let i = 0;
  let k = 0;
  while (k < key.length) {
    if (i >= base.length) return -1;
    const ch = base[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch.toLowerCase() !== key[k]) return -1;
    i++;
    k++;
  }
  return i;
}

/** 이름 뒤에 온 나머지로 이 매칭을 인정할지 (구분자 / 끝 / 흔한 서류 낱말) */
function boundaryOk(rest: string): boolean {
  if (rest.length === 0 || SEP.test(rest)) return true;
  const r = compactKey(rest);
  return LOOSE_WORDS.some((w) => r.startsWith(w));
}

/**
 * 파일명 하나를 라운드 멘티 후보에 귀속시킨다.
 * 후보는 **사람 단위**로 넘긴다(같은 멘티의 케이스가 여럿이면 호출부가 하나로 추린다).
 */
export function matchMenteeFile(fileName: string, candidates: MenteeMatchCandidate[]): MenteeFileMatch {
  const base = stripLeadingSeps(stripExt(nfkc(fileName).trim()));
  // 이름 키별로 묶고 긴 이름부터 대조
  const byKey = new Map<string, MenteeMatchCandidate[]>();
  for (const c of candidates) {
    const k = compactKey(c.name);
    if (!k) continue;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(c);
  }
  const keys = Array.from(byKey.keys()).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const end = prefixEnd(base, key);
    if (end < 0) continue;
    const rest = base.slice(end);
    if (!boundaryOk(rest)) continue;
    const group = byKey.get(key)!;
    if (group.length === 1) return { ok: true, caseId: group[0]!.caseId, name: group[0]!.name };
    // 동명이인 — 이름 바로 뒤의 고유번호·닉네임으로 구분
    const restKey = compactKey(stripLeadingSeps(rest));
    const hits = group.filter((c) => {
      const tokens = [c.externalNo, c.nickname && compactKey(c.nickname) !== key ? c.nickname : null].map(compactKey).filter((t) => t.length > 0);
      return tokens.some((t) => restKey.startsWith(t));
    });
    if (hits.length === 1) return { ok: true, caseId: hits[0]!.caseId, name: hits[0]!.name };
    const name = group[0]!.name;
    return {
      ok: false,
      reason: 'ambiguous',
      message: `동명이인 ${group.length}명 — 이름 뒤에 고유번호나 닉네임을 적어 주세요 (예: ${name}(고유번호)_사업계획서.pdf)`,
    };
  }
  return { ok: false, reason: 'no_match', message: '파일명 맨 앞에서 이 라운드의 멘티 이름을 찾지 못했습니다' };
}

/* ── 허용 형식 ─────────────────────────────────────────────────────────── */

/** 사업계획서: 미리보기 가능한 문서 형식만 */
export const BUSINESS_PLAN_EXTS = ['pdf', 'hwp', 'hwpx', 'doc', 'docx'] as const;
/** 참고파일: 문서 + 이미지·엑셀 */
export const BUSINESS_REF_EXTS = [...BUSINESS_PLAN_EXTS, 'jpg', 'jpeg', 'png', 'xlsx', 'xls'] as const;
/** 파일 1개 최대 크기 */
export const BUSINESS_DOC_MAX_BYTES = 30 * 1024 * 1024;
/** 한 번에 올릴 수 있는 파일 수 */
export const BUSINESS_DOC_MAX_FILES = 100;

export function fileExt(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(nfkc(fileName).trim());
  return m ? m[1]!.toLowerCase() : '';
}

/** 서류 종류별 허용 확장자 검사 */
export function businessDocExtAllowed(docKey: 'business_plan' | 'business_ref', fileName: string): boolean {
  const ext = fileExt(fileName);
  const list: readonly string[] = docKey === 'business_plan' ? BUSINESS_PLAN_EXTS : BUSINESS_REF_EXTS;
  return list.includes(ext);
}

/** 화면 안내용 확장자 목록 문자열 */
export function businessDocExtLabel(docKey: 'business_plan' | 'business_ref'): string {
  return (docKey === 'business_plan' ? BUSINESS_PLAN_EXTS : BUSINESS_REF_EXTS).map((e) => e.toUpperCase()).join(', ');
}

/** 파일 선택창 accept 속성 */
export function businessDocAccept(docKey: 'business_plan' | 'business_ref'): string {
  return (docKey === 'business_plan' ? BUSINESS_PLAN_EXTS : BUSINESS_REF_EXTS).map((e) => `.${e}`).join(',');
}
