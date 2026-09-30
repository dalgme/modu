import { TRANSITIONS } from '@/lib/workflow/transitions';

/**
 * 관찰의견서 업로드 열림 규칙 (2026-09-29 사용자 결정) — 서버·클라이언트 중립 파일.
 * "계획된 멘토링 회차별 보고서를 모두 업로드한 뒤에 관찰의견서 [파일 업로드]가 열린다."
 *  - 계획 회차 = 그룹 필수 회차(required_rounds). 등록된 회차가 그보다 적으면 닫힘
 *  - 등록된 회차는 전부 보고서(2단계)까지 등록돼 있어야 함 (추가 회차 포함)
 * 멘토 화면 버튼 조건과 서버 게이트(uploadObservationFile)가 이 함수 하나를 읽는다 — CLAUDE.md §3 불변 규칙.
 */
export interface ObservationGateRound {
  round_no: number;
  report_registered_at: string | null;
}

export function observationUploadGate(rounds: ObservationGateRound[], requiredRounds: number): { ok: boolean; hint: string } {
  const reported = rounds.filter((r) => r.report_registered_at).length;
  if (rounds.length < requiredRounds || reported < requiredRounds) {
    return { ok: false, hint: `회차 보고서 ${reported} / ${requiredRounds}건 등록 — 계획된 회차의 보고서를 모두 올리면 관찰의견서 업로드가 열립니다.` };
  }
  const missing = rounds.filter((r) => !r.report_registered_at).map((r) => r.round_no);
  if (missing.length > 0) return { ok: false, hint: `보고서가 없는 회차(${missing.join('·')}회차)가 있습니다. 모든 회차의 보고서를 올리면 관찰의견서 업로드가 열립니다.` };
  return { ok: true, hint: '모든 회차 보고서가 등록되었습니다. 관찰의견서 파일을 올려 주세요.' };
}

/**
 * 관찰의견서 올리기·교체·삭제가 가능한 케이스 상태 (2026-09-30) — 회차 등록 가능 단계와 같다(멘토 배정·진행 중·보완 요청).
 * 종결 요청(검수 중) 이후에는 멘토가 바꿀 수 없다. 멘토 화면의 [수정 업로드]·[삭제] 버튼과 서버 게이트가 이 함수를 같이 읽는다.
 */
export function observationEditable(status: string): boolean {
  return (TRANSITIONS.submit_round.from as readonly string[]).includes(status);
}
