/**
 * 지연 독려 문자 문구 (2026-11-09) — 순수 함수(서버·화면·테스트 공용).
 * 운영사가 문자 발송 › 자동발송 탭에서 행사별 문구를 고친다(없으면 기본 문구). 미리보기·발송이 이 함수 하나로 만든다.
 *
 * 자동 기입 필드
 *  {program} 행사명 · {name} 멘토 이름 · {count} 멈춘 멘토링 건수
 *  {cases}   멈춘 멘티 목록(한 줄에 한 명, 최대 5명 + "외 N건") · {link} 멘토 화면 주소
 */

export const DELAY_NUDGE_MAX_LENGTH = 1000;
export const DELAY_NUDGE_MAX_LINES = 5;

export const DEFAULT_DELAY_NUDGE_TEMPLATE = `[{program}] {name} 멘토님, 진행이 멈춘 멘토링이 {count}건 있습니다.
{cases}
{link} 에서 일정을 등록해 주세요.`;

export const DELAY_NUDGE_FIELDS = [
  { key: '{program}', label: '행사명', example: '2026 창업 멘토링' },
  { key: '{name}', label: '멘토 이름', example: '홍길동' },
  { key: '{count}', label: '멈춘 멘토링 건수', example: '2' },
  { key: '{cases}', label: '멈춘 멘티 목록(한 줄에 한 명)', example: '· 김멘티 (0/4회, 38일 경과)' },
  { key: '{link}', label: '멘토 화면 주소', example: 'https://…/mentor/dashboard' },
] as const;

const ALLOWED = new Set<string>(DELAY_NUDGE_FIELDS.map((f) => f.key));

export interface DelayNudgeCase {
  menteeName: string;
  roundsDone: number;
  requiredRounds: number;
  days: number;
}

/** 멘티 한 줄 — 기본 문구와 같은 모양 */
export function delayNudgeCaseLine(c: DelayNudgeCase): string {
  return `· ${c.menteeName} (${c.roundsDone}/${c.requiredRounds}회, ${c.days}일 경과)`;
}

export function renderDelayNudge(template: string | null | undefined, v: { program: string; name: string; cases: DelayNudgeCase[]; link: string }): string {
  const tpl = template && template.trim() ? template : DEFAULT_DELAY_NUDGE_TEMPLATE;
  const lines = v.cases.slice(0, DELAY_NUDGE_MAX_LINES).map(delayNudgeCaseLine);
  if (v.cases.length > DELAY_NUDGE_MAX_LINES) lines.push(`외 ${v.cases.length - DELAY_NUDGE_MAX_LINES}건`);
  const map: Record<string, string> = {
    '{program}': v.program,
    '{name}': v.name,
    '{count}': String(v.cases.length),
    '{cases}': lines.join('\n'),
    '{link}': v.link,
  };
  return tpl.replace(/\{[a-z_]+\}/g, (m) => (m in map ? map[m]! : m)).trim();
}

/** 저장 전 검사 — 오류 문구 또는 null */
export function validateDelayNudgeTemplate(template: string): string | null {
  const t = template.trim();
  if (!t) return '문구를 입력하세요.';
  if (t.length > DELAY_NUDGE_MAX_LENGTH) return `문구는 ${DELAY_NUDGE_MAX_LENGTH}자 이내로 입력하세요.`;
  const unknown = Array.from(new Set(t.match(/\{[^{}\s]*\}/g) ?? [])).filter((k) => !ALLOWED.has(k));
  if (unknown.length) return `알 수 없는 필드가 있습니다: ${unknown.join(', ')} — 아래 필드 버튼으로 넣어 주세요.`;
  return null;
}

/** 자동발송 탭 미리보기용 예시 */
export function sampleDelayNudge(template: string | null | undefined, program: string, appUrl: string): string {
  return renderDelayNudge(template, {
    program,
    name: '홍길동',
    link: `${appUrl}/mentor/dashboard`,
    cases: [
      { menteeName: '김멘티', roundsDone: 0, requiredRounds: 4, days: 38 },
      { menteeName: '이멘티', roundsDone: 1, requiredRounds: 4, days: 34 },
    ],
  });
}
