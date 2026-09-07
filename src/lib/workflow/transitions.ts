/**
 * 상태 전이 상수 — docs/MODU-DESIGN.md §3-2 의 T1~T12 를 코드로 옮긴 **단일 원천**.
 *
 * 규칙(CLAUDE.md §3): 화면 버튼의 활성 조건과 서버 액션의 상태 게이트는 반드시 같은 상수를 읽는다.
 *  - 화면: `canTransition(key, status)` 로 버튼 노출/활성.
 *  - 서버: `assertTransition(key, status)` 로 거부 문구를 얻고, DB update 에는 `.in('status', TRANSITIONS[key].from)`.
 * 역할(who)은 버튼 노출과 액션 가드가 공유하지만, 실제 권한 판정은 guards.ts 의 함수로 한다(대행·실제 신원 분리).
 */
import type { CaseStatus } from '@/types/case-status';
import type { UserRole } from '@/lib/auth/roles';

export type TransitionKey =
  | 'create' // T1  ∅ → registered
  | 'assign_mentor' // T2/T12 registered | reassignment_pending → mentor_assigned | in_progress
  | 'reassign_mentor' // T3  상태 유지(활성 배정 교체)
  | 'recall_mentor' // 멘토 회수 → registered (회차 없을 때만)
  | 'submit_round' // T4  mentor_assigned → in_progress (1회차), 이후 상태 유지
  | 'request_closure' // T5  in_progress | revision_requested → closure_requested
  | 'review_revision' // T6  closure_requested → revision_requested
  | 'review_approve' // T7  closure_requested → settlement_pending (+ 정산 확정)
  | 'add_to_batch' // T8  settlement_pending → settlement_batched
  | 'remove_from_batch' // T8' settlement_batched → settlement_pending
  | 'confirm_settlement' // T9  settlement_batched → closed (발주처)
  | 'withdraw_case' // T10 비종결 → withdrawn
  | 'request_mentor_withdrawal' // T11a 멘토 자진 중도 종료 요청 (상태 유지)
  | 'approve_mentor_withdrawal' // T11a in_progress | mentor_assigned → reassignment_pending
  | 'force_end_mentor'; // T11b in_progress | mentor_assigned → reassignment_pending (운영사 강제)

export interface Transition {
  /** 허용 출발 상태 */
  from: readonly CaseStatus[];
  /** 도착 상태. 배열이면 출발 상태에 따라 분기(인덱스 대응), null 이면 상태 유지 */
  to: CaseStatus | null;
  /** 실행 역할 */
  who: readonly UserRole[];
  /** 서버 거부 문구 (버튼 툴팁에도 사용) */
  denied: string;
}

export const TRANSITIONS: Record<TransitionKey, Transition> = {
  create: { from: [], to: 'registered', who: ['nextlab'], denied: '멘티 등록 권한이 없습니다.' },
  assign_mentor: {
    from: ['registered', 'reassignment_pending'],
    to: null, // registered → mentor_assigned, reassignment_pending → in_progress (assignTarget 참조)
    who: ['nextlab'],
    denied: '멘토 배정은 멘티 등록 또는 재배정 대기 단계에서만 가능합니다.',
  },
  reassign_mentor: {
    from: ['mentor_assigned', 'in_progress', 'revision_requested', 'closure_requested'],
    to: null,
    who: ['nextlab'],
    denied: '진행 중인 케이스에서만 멘토를 교체할 수 있습니다.',
  },
  recall_mentor: {
    from: ['mentor_assigned'],
    to: 'registered',
    who: ['nextlab'],
    denied: '회차가 등록되기 전(멘토 배정 단계)에만 배정을 회수할 수 있습니다.',
  },
  submit_round: {
    from: ['mentor_assigned', 'in_progress', 'revision_requested'],
    to: null, // mentor_assigned 에서 첫 회차면 in_progress 로
    who: ['mentor'],
    denied: '컨설팅 회차는 멘토 배정 이후, 종결 요청 전까지만 등록할 수 있습니다.',
  },
  request_closure: {
    from: ['in_progress', 'revision_requested'],
    to: 'closure_requested',
    who: ['mentor'],
    denied: '컨설팅 진행 중(또는 보완 요청) 단계에서만 종결을 요청할 수 있습니다.',
  },
  review_revision: {
    from: ['closure_requested'],
    to: 'revision_requested',
    who: ['nextlab'],
    denied: '종결 요청 단계에서만 보완을 요청할 수 있습니다.',
  },
  review_approve: {
    from: ['closure_requested'],
    to: 'settlement_pending',
    who: ['nextlab'],
    denied: '종결 요청 단계에서만 검수 승인할 수 있습니다.',
  },
  add_to_batch: {
    from: ['settlement_pending'],
    to: 'settlement_batched',
    who: ['nextlab'],
    denied: '지급 대기 상태의 정산 건만 품의에 넣을 수 있습니다.',
  },
  remove_from_batch: {
    from: ['settlement_batched'],
    to: 'settlement_pending',
    who: ['nextlab'],
    denied: '품의 편성 상태에서만 제외할 수 있습니다(제출 전 품의만).',
  },
  confirm_settlement: {
    from: ['settlement_batched'],
    to: 'closed',
    who: ['institution'],
    denied: '지급 품의에 편성된 케이스만 정산 확인할 수 있습니다.',
  },
  withdraw_case: {
    from: [
      'registered',
      'mentor_assigned',
      'in_progress',
      'reassignment_pending',
      'closure_requested',
      'revision_requested',
    ],
    to: 'withdrawn',
    who: ['nextlab', 'institution'],
    denied: '이미 종결(또는 정산 확정)된 케이스는 중도 종료할 수 없습니다.',
  },
  request_mentor_withdrawal: {
    from: ['mentor_assigned', 'in_progress', 'revision_requested'],
    to: null,
    who: ['mentor'],
    denied: '진행 중인 케이스에서만 중도 종료를 요청할 수 있습니다.',
  },
  approve_mentor_withdrawal: {
    from: ['mentor_assigned', 'in_progress', 'revision_requested'],
    to: 'reassignment_pending',
    who: ['nextlab'],
    denied: '진행 중인 케이스에서만 중도 종료를 확정할 수 있습니다.',
  },
  force_end_mentor: {
    from: ['mentor_assigned', 'in_progress', 'revision_requested', 'closure_requested'],
    to: 'reassignment_pending',
    who: ['nextlab'],
    denied: '활성 멘토가 있는 진행 중 케이스에서만 강제 종료할 수 있습니다.',
  },
};

/** 화면용: 이 상태에서 전이 버튼을 보여줘도 되는가 */
export function canTransition(key: TransitionKey, status: CaseStatus): boolean {
  return (TRANSITIONS[key].from as readonly string[]).includes(status);
}

/** 서버용: 허용되지 않으면 거부 문구, 허용되면 null */
export function assertTransition(key: TransitionKey, status: CaseStatus): string | null {
  return canTransition(key, status) ? null : TRANSITIONS[key].denied;
}

/** 멘토 배정의 도착 상태 (T2 vs T12) */
export function assignTarget(status: CaseStatus): CaseStatus {
  return status === 'reassignment_pending' ? 'in_progress' : 'mentor_assigned';
}

/** 역할이 이 전이의 실행 주체인가 (버튼 노출용 — 실제 권한은 guards 로 재검증) */
export function roleCan(key: TransitionKey, role: UserRole): boolean {
  return (TRANSITIONS[key].who as readonly string[]).includes(role);
}
