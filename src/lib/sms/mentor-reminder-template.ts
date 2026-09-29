/**
 * 멘토 리마인더 문자 템플릿 — 서버(발송·cron)·클라이언트(설정 패널 미리보기·필드 예시) 공용 순수 모듈.
 * 'server-only' / 'use client' 없음(§6-10): 미리보기와 실제 발송 문구가 **같은 함수**에서 나온다.
 *
 * 문법: `{program}` `{group}` `{mentor}` `{companies}` 4개만 글자 그대로 바꾼다.
 * (로그인 안내·일반 문자와 달리 줄 생략·'-' 표시 규칙이 없다 — 대상 멘토는 항상 값이 있다)
 */

export type MentorReminderFieldKey = 'program' | 'group' | 'mentor' | 'companies';

export interface MentorReminderFieldDef {
  key: MentorReminderFieldKey;
  label: string;
  desc: string;
}

/** 리마인더 문구 자동 기입 필드 — `renderMentorReminder` 가 지원하는 4개만 */
export const MENTOR_REMINDER_FIELDS: MentorReminderFieldDef[] = [
  { key: 'program', label: '행사명', desc: '지금 운영 중인 행사(사업) 이름' },
  { key: 'group', label: '그룹명', desc: '사업 그룹 이름 (넣으면 그룹마다 한 통씩, 빼면 멘토마다 한 통으로 합쳐 발송)' },
  { key: 'mentor', label: '멘토 이름', desc: '문자를 받는 멘토 이름' },
  { key: 'companies', label: '보고서 남은 멘티', desc: '회차·보고서가 아직 남은 담당 멘티 이름 (여러 명이면 쉼표로 이어서)' },
];

export interface MentorReminderVars {
  program: string;
  group: string;
  mentor: string;
  companies: string[];
}

/** 템플릿 치환: {program} {group} {mentor} {companies} */
export function renderMentorReminder(template: string, vars: MentorReminderVars): string {
  return template
    .split('{program}').join(vars.program)
    .split('{group}').join(vars.group)
    .split('{mentor}').join(vars.mentor)
    .split('{companies}').join(vars.companies.join(', '));
}
