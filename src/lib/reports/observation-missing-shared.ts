/**
 * 관찰의견서 미제출 확인 · 요청 문자 (2026-11-22) — 서버·화면·테스트 공용 순수 규칙.
 *
 * ① 보고서 파일 탭의 멘티 수에서 빼는 멘티 — 회차를 한 번도 진행하지 않고 끝난 멘티
 *    (멘토링 포기·종료 표시, 중도 종료(withdrawn), 비활성화) 만 뺀다.
 *    1회 이상 진행(보고서 등록 또는 회차 종료 시각 경과)한 뒤 포기·종료한 멘티는 그대로 센다.
 * ② 관찰의견서 미제출 = 관찰의견서를 내는 라운드 · ①에서 세는 멘티 · 검수 승인 전 진행 단계 ·
 *    중도 종결(관찰의견서 면제)이 아님 · 관찰의견서 파일 없음.
 * ③ 요청 문자 문구 — 미리보기와 발송이 같은 함수(renderObservationRequest).
 */

export interface FileCountCase {
  menteeInactive: boolean;
  outcome: string | null;
  status: string;
  /** 진행한 회차 수(보고서 등록 또는 회차 종료 시각 경과) */
  progressedRounds: number;
}

/** 보고서 파일 탭 멘티 수에서 뺄지 — 진행 없이 끝난(포기·종료 표시·중도 종료·비활성화) 멘티만 */
export function excludedFromFileCounts(c: FileCountCase): boolean {
  if (c.progressedRounds >= 1) return false;
  return c.menteeInactive || !!c.outcome || c.status === 'withdrawn';
}

/** 관찰의견서를 아직 낼 수 있는(요청할) 진행 단계 — 검수 승인 이후·중도 종료는 제외 */
export const OBS_REQUEST_STATUSES: readonly string[] = ['mentor_assigned', 'in_progress', 'reassignment_pending', 'closure_requested', 'revision_requested'];

export interface ObsMissingCase {
  status: string;
  observationRequired: boolean;
  hasObservation: boolean;
  earlyClosure: boolean;
  countedInFiles: boolean;
}

export function isObservationMissing(c: ObsMissingCase): boolean {
  return c.observationRequired && c.countedInFiles && !c.hasObservation && !c.earlyClosure && OBS_REQUEST_STATUSES.includes(c.status);
}

/* ── 화면 데이터 ─────────────────────────────────────────────────────── */

export interface ObsMissingRow {
  caseId: string;
  menteeName: string;
  groupId: string;
  groupName: string;
  /** 지금 담당 멘토(활성 배정). 없으면 null — 재배정 대기 등 */
  mentorId: string | null;
  mentorName: string | null;
  mentorPhone: string | null;
  statusLabel: string;
  /** 포기·종료 표시(1회 이상 진행 후) — '중도 포기'·'중도 종료' */
  outcomeLabel: string | null;
  reportsDone: number;
  requiredRounds: number;
}

export interface ObsGroupSummary {
  groupId: string;
  groupName: string;
  /** 관찰의견서를 내는 라운드인지 */
  required: boolean;
  /** 관찰의견서 대상 멘티(보고서 파일 탭 멘티 수와 같은 기준) */
  target: number;
  submitted: number;
  missing: number;
}

export interface ObsMissingData {
  groups: ObsGroupSummary[];
  rows: ObsMissingRow[];
  /** 멘토별 최근 요청 문자 시각(ISO) */
  lastRequested: Record<string, string>;
}

/* ── 요청 문자 문구 ──────────────────────────────────────────────────── */

export const OBS_REQUEST_MAX_LENGTH = 1000;
export const OBS_REQUEST_MAX_LINES = 10;

export const DEFAULT_OBS_REQUEST_TEMPLATE = `[{program}] {name} 멘토님, 관찰의견서 제출 기한이 다가왔습니다.
아직 관찰의견서가 등록되지 않은 멘티 {count}명:
{mentees}
{link} 에서 멘티 화면의 [관찰의견서]에 PDF 파일로 올려 주세요.`;

export const OBS_REQUEST_FIELDS = [
  { key: '{program}', label: '행사명', example: '2026 창업 멘토링' },
  { key: '{name}', label: '멘토 이름', example: '홍길동' },
  { key: '{count}', label: '미제출 멘티 수', example: '2' },
  { key: '{mentees}', label: '미제출 멘티 목록(한 줄에 한 명)', example: '· 김멘티' },
  { key: '{link}', label: '멘토 화면 주소', example: 'https://…/mentor/dashboard' },
] as const;

const ALLOWED = new Set<string>(OBS_REQUEST_FIELDS.map((f) => f.key));

export function renderObservationRequest(template: string | null | undefined, v: { program: string; name: string; mentees: string[]; link: string }): string {
  const tpl = template && template.trim() ? template : DEFAULT_OBS_REQUEST_TEMPLATE;
  const lines = v.mentees.slice(0, OBS_REQUEST_MAX_LINES).map((m) => `· ${m}`);
  if (v.mentees.length > OBS_REQUEST_MAX_LINES) lines.push(`외 ${v.mentees.length - OBS_REQUEST_MAX_LINES}명`);
  const map: Record<string, string> = {
    '{program}': v.program,
    '{name}': v.name,
    '{count}': String(v.mentees.length),
    '{mentees}': lines.join('\n'),
    '{link}': v.link,
  };
  return tpl.replace(/\{[a-z_]+\}/g, (m) => (m in map ? map[m]! : m)).trim();
}

/** 발송 전 검사 — 오류 문구 또는 null */
export function validateObservationRequest(template: string): string | null {
  const t = template.trim();
  if (!t) return '문구를 입력하세요.';
  if (t.length > OBS_REQUEST_MAX_LENGTH) return `문구는 ${OBS_REQUEST_MAX_LENGTH}자 이내로 입력하세요.`;
  const unknown = Array.from(new Set(t.match(/\{[^{}\s]*\}/g) ?? [])).filter((k) => !ALLOWED.has(k));
  if (unknown.length) return `알 수 없는 필드가 있습니다: ${unknown.join(', ')} — 필드 버튼으로 넣어 주세요.`;
  return null;
}
