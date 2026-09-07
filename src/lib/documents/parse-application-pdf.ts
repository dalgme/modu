import 'server-only';

/**
 * 진흥원 멘티기업 등록 자동화: 업로드된 신청서 PDF(공식 붙임1 사업신청서 + 붙임2 추진계획서)에서
 * 디지털 텍스트를 추출해 케이스 등록 필드로 파싱한다.
 * - 디지털(텍스트) PDF 대상. 스캔 이미지 PDF 는 텍스트가 없어 추출값이 비며, 이 경우 수기 입력한다.
 * - 파싱값은 등록 폼에 자동 채워지고, 진흥원이 확인 후 등록한다(자동 채움 → 확인 → 이관).
 */

export interface ParsedApplicationFields {
  business_name?: string;
  owner_name?: string;
  business_reg_no?: string;
  phone?: string;
  address?: string;
  email?: string;
  business_type?: string;
  item?: string;
  opened_at?: string;
  employee_count?: string;
  revenue_last_year?: string;
}

export interface ParseApplicationResult {
  fields: ParsedApplicationFields;
  /** 추출·매핑된 필드 수 (0 이면 스캔본 등으로 판단 → 수기 입력 안내) */
  matchedCount: number;
  /** 신청서 제목의 사업명 괄호에서 감지한 지원유형 코드 (없으면 undefined) */
  supportTypeCode?: 'management_improvement' | 'closure';
}

/**
 * 신청서 제목 "…재기지원사업(컨설팅·경영개선)" / "…(폐업정리)" 괄호로 지원유형을 감지한다.
 * 괄호를 못 찾으면 전체 텍스트에서 '폐업정리'/'경영개선' 키워드로 보조 판정한다.
 */
export function detectSupportTypeCode(
  text: string,
): 'management_improvement' | 'closure' | undefined {
  const m = text.match(/재기지원사업\s*[（(]\s*([^）)]*)\s*[）)]/);
  const scope = m?.[1] ?? '';
  if (/폐업/.test(scope)) return 'closure';
  if (/경영\s*개선|컨설팅/.test(scope)) return 'management_improvement';
  // 보조 판정 (제목 괄호 미검출 시)
  if (/폐업정리/.test(text)) return 'closure';
  if (/경영개선/.test(text)) return 'management_improvement';
  return undefined;
}

/** 라벨(공백 유연) → 필드 키. 문서 순서대로 슬라이싱한다. */
const ANCHORS: { key: string; re: RegExp }[] = [
  { key: 'business_name', re: /업\s*체\s*명/ },
  { key: 'owner_name', re: /대\s*표\s*자/ },
  { key: 'business_reg_no', re: /사업자등록번호/ },
  { key: '_phoneBiz', re: /사업장\s*연락처/ },
  { key: '_corp', re: /법인등록번/ },
  { key: 'phone', re: /대표\s*휴대번호/ },
  { key: 'opened_at', re: /개업연월일/ },
  { key: '_form', re: /사업장형태/ },
  { key: 'address', re: /사\s*업\s*장\s*주\s*소/ },
  { key: 'email', re: /이\s*메\s*일/ },
  { key: 'business_type', re: /업\s*태/ },
  { key: 'item', re: /종목\s*\/\s*주요상품/ },
  { key: 'employee_count', re: /근로자수/ },
  { key: 'revenue_last_year', re: /매출액/ },
  { key: '_hope', re: /컨설팅\s*희망분야/ },
  { key: '_end', re: /위와\s*같이/ },
];

function sliceFields(text: string): Record<string, string> {
  const found: { key: string; start: number; end: number }[] = [];
  let pos = 0;
  for (const a of ANCHORS) {
    const m = text.slice(pos).match(a.re);
    if (!m || m.index === undefined) {
      found.push({ key: a.key, start: -1, end: -1 });
      continue;
    }
    const start = pos + m.index;
    const end = start + m[0].length;
    found.push({ key: a.key, start, end });
    pos = end;
  }
  const out: Record<string, string> = {};
  for (let i = 0; i < found.length; i++) {
    const cur = found[i]!;
    if (cur.start < 0 || cur.key.startsWith('_')) continue;
    let nextStart = text.length;
    for (let j = i + 1; j < found.length; j++) {
      const nxt = found[j]!;
      if (nxt.start > cur.end) {
        nextStart = nxt.start;
        break;
      }
    }
    out[cur.key] = text.slice(cur.end, nextStart).trim();
  }
  return out;
}

const onlyDigits = (s: string): string => (s.match(/[0-9]/g) ?? []).join('');

function normBizNo(s: string): string {
  const d = onlyDigits(s);
  return d.length >= 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5, 10)}` : s.trim();
}

function normPhone(s: string): string {
  const d = onlyDigits(s);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return s.trim();
}

function normOpenedAt(s: string): string | undefined {
  const m = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  const iso = s.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`;
  return undefined;
}

function normEmployeeCount(s: string): string | undefined {
  const m = s.replace(/\([^)]*\)/g, ' ').match(/\d+/);
  return m ? m[0] : undefined;
}

/** 한글 금액(7천만원·1.5억·8,500만 등) → 원 단위 정수 문자열 */
function normRevenue(s: string): string | undefined {
  const t = s.replace(/[,\s]/g, '');
  let m: RegExpMatchArray | null;
  if ((m = t.match(/([\d.]+)억/))) return String(Math.round(parseFloat(m[1]!) * 1e8));
  if ((m = t.match(/([\d.]+)천만/))) return String(Math.round(parseFloat(m[1]!) * 1e7));
  if ((m = t.match(/([\d.]+)백만/))) return String(Math.round(parseFloat(m[1]!) * 1e6));
  if ((m = t.match(/([\d.]+)만/))) return String(Math.round(parseFloat(m[1]!) * 1e4));
  const d = onlyDigits(t);
  return d ? d : undefined;
}

const clean = (s: string | undefined): string | undefined => {
  const v = s?.replace(/\s+/g, ' ').trim();
  return v ? v : undefined;
};

/** 사람 이름: 모든 공백 제거. "강 종 복"·"강 종복" → "강종복". */
export function normalizePersonName(s: string | undefined): string | undefined {
  const v = (s ?? '').replace(/\s+/g, '').trim();
  return v || undefined;
}

/**
 * 회사명 표준화: 모든 공백 제거 + 법인격 표기를 표준 약어 접두로 통일한다.
 *  - 주식회사·㈜·(주)·주) → (주),  유한(책임)회사·㈲·(유)·유) → (유)
 *  - 합자/합명회사 → (합),  협동조합 → (협),  사단법인 → (사),  재단법인 → (재)
 *  - 접두·접미 어느 위치든 인식해 접두 약어로 옮긴다. "가나 식품(주)"·"주식회사가나식품" → "(주)가나식품"
 */
export function normalizeBusinessName(s: string | undefined): string | undefined {
  const compact = (s ?? '').replace(/\s+/g, '').trim();
  if (!compact) return undefined;

  const ENTITIES: { abbr: string; token: string }[] = [
    { abbr: '(주)', token: '주식회사' },
    { abbr: '(주)', token: '㈜' },
    { abbr: '(주)', token: '(주)' },
    { abbr: '(주)', token: '주)' },
    { abbr: '(유)', token: '유한책임회사' },
    { abbr: '(유)', token: '유한회사' },
    { abbr: '(유)', token: '㈲' },
    { abbr: '(유)', token: '(유)' },
    { abbr: '(유)', token: '유)' },
    { abbr: '(합)', token: '합자회사' },
    { abbr: '(합)', token: '합명회사' },
    { abbr: '(합)', token: '(합)' },
    { abbr: '(협)', token: '협동조합' },
    { abbr: '(협)', token: '(협)' },
    { abbr: '(사)', token: '사단법인' },
    { abbr: '(사)', token: '(사)' },
    { abbr: '(재)', token: '재단법인' },
    { abbr: '(재)', token: '(재)' },
  ];

  for (const { abbr, token } of ENTITIES) {
    let core: string | null = null;
    if (compact.startsWith(token)) core = compact.slice(token.length);
    else if (compact.endsWith(token)) core = compact.slice(0, compact.length - token.length);
    if (core !== null) {
      core = core.trim();
      if (core) return `${abbr}${core}`;
    }
  }
  return compact;
}

/** 추출된 병합 텍스트 → 케이스 등록 필드 */
export function parseApplicationText(text: string): ParseApplicationResult {
  const raw = sliceFields(text);
  const fields: ParsedApplicationFields = {
    business_name: normalizeBusinessName(raw.business_name),
    owner_name: normalizePersonName(raw.owner_name),
    business_reg_no: raw.business_reg_no ? normBizNo(raw.business_reg_no) : undefined,
    phone: raw.phone ? normPhone(raw.phone) : raw._phoneBiz ? normPhone(raw._phoneBiz) : undefined,
    address: clean(raw.address),
    email: clean(raw.email),
    business_type: clean(raw.business_type),
    item: raw.item ? raw.item.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim() : undefined,
    opened_at: raw.opened_at ? normOpenedAt(raw.opened_at) : undefined,
    employee_count: raw.employee_count ? normEmployeeCount(raw.employee_count) : undefined,
    revenue_last_year: raw.revenue_last_year ? normRevenue(raw.revenue_last_year) : undefined,
  };
  const matchedCount = Object.values(fields).filter((v) => v !== undefined && v !== '').length;
  return { fields, matchedCount, supportTypeCode: detectSupportTypeCode(text) };
}

/** PDF 바이너리 → 텍스트 추출(unpdf, 서버리스 안전) → 필드 파싱 */
export async function parseApplicationPdf(buffer: Buffer): Promise<ParseApplicationResult> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join(' ') : text;
  return parseApplicationText(merged);
}
