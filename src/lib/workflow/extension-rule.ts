/**
 * 라운드 연장 선정 규칙 (2026-11-25) — 서버·화면·테스트 공용 순수 함수.
 * "1기 3라운드" 진출자는 1기 2라운드 케이스의 연장으로 멘토링을 더 받는다(별도 케이스 없음).
 *  - 그룹 설정: extension_label(이름) · extension_extra_hours(추가 시간 = 더 등록할 수 있는 회차 칸 수) · extension_total_hours(총 시간 상한)
 *  - 선정된 케이스: 회차 칸 = 필수 회차 + 승인 추가 회차 + 추가 시간 수, 모든 회차 운영시간 합계 ≤ 총 시간 상한
 *  - 미선정 케이스는 지금과 같다(시간 상한 없음)
 * 수당 단가·보고서 기준은 그룹 설정 그대로 — 연장 회차도 같은 시간당 단가·같은 보고서 규칙.
 */

export interface GroupExtensionConfig {
  label: string | null;
  extraHours: number;
  totalHours: number | null;
}

export interface CaseExtension {
  /** 그룹에 연장 기능이 있는가 */
  available: boolean;
  /** 이 케이스가 선정됐는가 */
  active: boolean;
  label: string;
  /** 선정 시 더 열리는 회차 칸 수 */
  extraRounds: number;
  /** 선정 시 총 시간 상한(분), 미선정·상한 없음이면 null */
  capMinutes: number | null;
}

export function groupExtensionOf(row: { extension_label?: string | null; extension_extra_hours?: number | null; extension_total_hours?: number | null } | null | undefined): GroupExtensionConfig {
  const label = (row?.extension_label ?? '').trim();
  return { label: label || null, extraHours: Math.max(0, Number(row?.extension_extra_hours ?? 0)), totalHours: row?.extension_total_hours ? Number(row.extension_total_hours) : null };
}

export function caseExtensionOf(group: GroupExtensionConfig, selectedAt: string | null | undefined): CaseExtension {
  const available = !!group.label;
  const active = available && !!selectedAt;
  return {
    available,
    active,
    label: group.label ?? '연장',
    extraRounds: active ? group.extraHours : 0,
    capMinutes: active && group.totalHours ? group.totalHours * 60 : null,
  };
}

export function minutesOf(startedAt: string | Date, endedAt: string | Date): number {
  return Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
}

export function hoursText(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}시간` : `${h.toFixed(1)}시간`;
}

/** 새 회차(또는 바뀐 회차)를 넣으면 총 시간 상한을 넘는지 — 넘으면 안내 문구, 아니면 null */
export function extensionHoursError(ext: CaseExtension, otherMinutes: number, newMinutes: number): string | null {
  if (!ext.active || ext.capMinutes === null) return null;
  if (otherMinutes + newMinutes <= ext.capMinutes) return null;
  const remain = Math.max(0, ext.capMinutes - otherMinutes);
  return `${ext.label} 선정자는 멘토링을 모두 합쳐 ${hoursText(ext.capMinutes)}까지 진행할 수 있습니다. 지금까지 ${hoursText(otherMinutes)} 등록 — 남은 시간 ${hoursText(remain)}.`;
}

/**
 * 연장을 이미 쓰기 시작했는가 — 선정 해제 가능 판단.
 * 기본 회차 칸(필수 + 승인 추가)을 넘는 회차가 있거나, 총 시간이 (상한 − 추가 시간)을 넘으면 연장분을 쓴 것으로 본다.
 */
export function extensionUsed(input: { roundCount: number; baseRounds: number; totalMinutes: number; group: GroupExtensionConfig }): boolean {
  if (input.roundCount > input.baseRounds) return true;
  if (input.group.totalHours !== null && input.totalMinutes > (input.group.totalHours - input.group.extraHours) * 60) return true;
  return false;
}

/** 연장 선정으로 다시 열어야 하는(멘토가 회차를 더 등록할 수 없는) 단계 — 선정 시 진행 중으로 되돌린다 */
export const EXTENSION_REOPEN_STATUSES: readonly string[] = ['closure_requested', 'settlement_pending', 'settlement_batched', 'closed'];

/** 연장 선정이 막히는 케이스 — 문구 또는 null */
export function extensionSelectBlock(status: string): string | null {
  if (status === 'withdrawn') return '중도 종료된 케이스는 선정할 수 없습니다.';
  return null;
}

/**
 * (2026-11-26) 연장 선정 뒤 멘토가 바뀌었는가 — 배정이 선정 시각 이후에 시작됐거나 끝났으면 바뀐 것.
 * 멘토 변경 시 이전 멘토의 확정 정산(품의 진행·정산 완료 포함)은 그대로 두므로, 이런 케이스는 선정 해제로 단계를 되돌리지 않는다
 * (되돌리면 새 멘토 배정이 종결 처리되거나 이전 멘토 정산 흐름과 어긋난다).
 */
export function mentorChangedSinceSelection(
  assignments: { assigned_at: string | null; ended_at: string | null; is_active: boolean }[],
  selectedAt: string | null | undefined,
): boolean {
  if (!selectedAt) return false;
  const t = new Date(selectedAt).getTime();
  return assignments.some((a) => (a.assigned_at && new Date(a.assigned_at).getTime() > t) || (!a.is_active && a.ended_at && new Date(a.ended_at).getTime() > t));
}

