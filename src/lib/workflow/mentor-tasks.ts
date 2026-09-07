import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';

/**
 * 멘토 '해야할 일' 플래너 (순수 함수 · 클라이언트/서버 공용).
 *
 * 지원유형별 멘토링 일지 요구 회차:
 *  - 경영개선(management_improvement): 최소 2회 · 최대 3회
 *  - 폐업정리(closure):               최소 1회 · 최대 2회
 * 필수 회차를 마친 뒤 지원신청서 등 후속 절차를 진행한다.
 */

export type TaskState = 'done' | 'current' | 'todo' | 'waiting';

export interface MentorTask {
  key: string;
  label: string;
  detail?: string;
  state: TaskState;
  /** /mentor/cases/[id] 뒤에 붙는 경로 (없으면 이동 링크 없음) */
  href?: string;
  /** 선택(권장) 작업 여부 */
  optional?: boolean;
}

export interface MentorTaskPlan {
  minLogs: number;
  maxLogs: number;
  logCount: number;
  typeLabel: string;
  tasks: MentorTask[];
  /** 한 줄 요약 — 지금 해야 할 일 */
  summary: string;
}

export function logRequirement(supportTypeCode: string | null): { min: number; max: number } {
  return supportTypeCode === 'closure' ? { min: 1, max: 2 } : { min: 2, max: 3 };
}

export function planMentorTasks(
  status: CaseStatus,
  supportTypeCode: string | null,
  logCount: number,
): MentorTaskPlan {
  const isClosure = supportTypeCode === 'closure';
  const { min: minLogs, max: maxLogs } = logRequirement(supportTypeCode);
  const typeLabel = isClosure ? '폐업정리' : '경영개선';

  const step = CASE_STATUS_META[status].step;
  const CONTACTED = CASE_STATUS_META.contacted.step; // 3
  const APPLIED = CASE_STATUS_META.application_drafted.step; // 5
  const APPROVED = CASE_STATUS_META.approved.step; // 7

  const terminated = status === 'withdrawn';
  const rejected = status === 'rejected';

  const contactDone = logCount > 0 || step >= CONTACTED;
  const logsDone = logCount >= minLogs;
  const appliedDone = step >= APPLIED;

  const tasks: MentorTask[] = [];

  // 1. 멘티 확인·연락
  tasks.push({
    key: 'contact',
    label: '멘티 확인·연락',
    detail: '배정된 멘티기업에 연락해 멘토링 일정을 잡습니다.',
    state: contactDone ? 'done' : 'current',
    href: '',
  });

  // 2. 멘토링 일지 (유형별 최소·최대)
  const logState: TaskState = logsDone ? 'done' : contactDone ? 'current' : 'todo';
  const logDetail = logsDone
    ? logCount >= maxLogs
      ? `${logCount}회 작성 · 최대 회차(${maxLogs}회) 도달`
      : `${logCount}회 작성 · 필수 ${minLogs}회 완료 · 최대 ${maxLogs}회까지 추가 가능`
    : `${logCount}/${minLogs}회 작성 · ${typeLabel}은 최소 ${minLogs}회 · 최대 ${maxLogs}회`;
  tasks.push({
    key: 'logs',
    label: '멘토링 일지 작성',
    detail: logDetail,
    state: logState,
    href: '/log',
  });

  // 3. 컨설팅 결과보고서 (선택·권장)
  tasks.push({
    key: 'report',
    label: '컨설팅 결과보고서 생성',
    detail: '멘토링 일지 작성 후 케이스 상세에서 결과보고서를 생성할 수 있습니다.',
    state: logsDone ? (appliedDone ? 'done' : 'todo') : 'todo',
    href: '',
    optional: true,
  });

  // 4. 지원신청서 작성
  const applyState: TaskState = appliedDone ? 'done' : logsDone ? 'current' : 'todo';
  tasks.push({
    key: 'apply',
    label: '지원신청서 작성',
    detail: logsDone
      ? '필수 멘토링을 마쳤습니다. 지원신청서를 작성해 제출하세요.'
      : `멘토링 일지 필수 ${minLogs}회 완료 후 작성할 수 있습니다.`,
    state: applyState,
    href: '/apply',
  });

  // 5. 후속 (넥스트랩 검수·진흥원 승인 — 멘토 대기)
  tasks.push({
    key: 'followup',
    label: '넥스트랩 검수 · 진흥원 승인',
    detail: '지원신청서 제출 후 넥스트랩·진흥원이 처리합니다. (멘토 대기)',
    state: appliedDone ? (step >= APPROVED ? 'done' : 'waiting') : 'todo',
  });

  // 요약 (다음 할 일)
  let summary: string;
  if (terminated) {
    summary = '종결(지원 포기)된 케이스입니다.';
  } else if (rejected) {
    summary = '진흥원 반려 — 보완 후 재제출이 필요할 수 있습니다.';
  } else {
    const cur = tasks.find((t) => t.state === 'current' && !t.optional);
    if (cur) summary = `${cur.label}`;
    else if (appliedDone && step < APPROVED) summary = '넥스트랩 검수 · 진흥원 승인 대기 중';
    else summary = '모든 멘토 단계 완료';
  }

  return { minLogs, maxLogs, logCount, typeLabel, tasks, summary };
}
