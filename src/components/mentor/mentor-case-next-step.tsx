import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb } from 'lucide-react';

import type { CaseStatus } from '@/types/case-status';
import { formatDateTime } from '@/lib/utils/format';

/** 멘토 케이스 상세 상단 "다음 할 일" 배너 (P28) — 대시보드의 판단과 같은 순서: 보고서 미등록 → 보완 → 첫 회차 → 관찰의견서 → 종결. */
export function MentorCaseNextStep(p: {
  status: CaseStatus;
  reported: number;
  planned: number;
  required: number;
  maxRounds: number;
  hasObservation: boolean;
  closureOk: boolean;
  closureHint: string;
  revisionNote: { comment: string | null; at: string } | null;
  reportPending: number[];
  nextPlanned: { roundNo: number; startedAt: string } | null;
}) {
  let title = '';
  let desc = '';
  let anchor: string | null = null;
  let tone: 'action' | 'wait' | 'done' = 'wait';
  switch (p.status) {
    case 'revision_requested':
      title = '운영사가 보완을 요청했습니다';
      desc = p.revisionNote?.comment ? `사유: ${p.revisionNote.comment} (${formatDateTime(p.revisionNote.at)})` : '요청 내용을 확인해 회차·관찰의견서를 수정한 뒤 다시 [종결 요청]을 누르세요.';
      anchor = '#requests';
      tone = 'action';
      break;
    case 'closure_requested':
      title = '종결 요청 접수 — 운영사 검수 대기';
      desc = '검수가 끝나면 정산이 확정되고 문자로 통보됩니다. 회차·관찰의견서는 잠깁니다.';
      break;
    case 'settlement_pending':
    case 'settlement_batched':
      title = '정산 확정 — 지급 절차 진행 중';
      desc = '내 정산 내역에서 확정 금액과 정산서를 확인할 수 있습니다.';
      tone = 'done';
      break;
    case 'closed':
      title = '종결 완료';
      desc = '모든 절차가 끝났습니다. 수고하셨습니다.';
      tone = 'done';
      break;
    case 'withdrawn':
      title = '중도 종료된 케이스';
      desc = '이행한 회차가 있으면 부분 정산으로 처리됩니다.';
      tone = 'done';
      break;
    default:
      if (p.reportPending.length > 0) {
        title = `${p.reportPending[0]}회차 보고서를 등록하세요`;
        desc = `진행됐지만 보고서(2단계)가 없는 회차 ${p.reportPending.length}개. 보고서를 올려야 이행으로 인정되어 정산에 포함됩니다.`;
        anchor = '#rounds';
        tone = 'action';
      } else if (p.nextPlanned) {
        title = `${p.nextPlanned.roundNo}회차 예정 · ${formatDateTime(p.nextPlanned.startedAt)}`;
        desc = '진행 후 해당 회차의 [보고서 등록]을 눌러 2단계를 마무리하세요.';
        anchor = '#rounds';
      } else if (p.planned === 0) {
        title = '첫 회차 일정을 등록하세요';
        desc = '멘티와 일정을 잡고 [회차 등록]에서 일자·시간·방법·참가자를 남깁니다(사전 등록 가능).';
        anchor = '#rounds';
        tone = 'action';
      } else if (p.reported < p.required) {
        title = `${p.reported + 1}회차 일정을 등록하세요`;
        desc = `필수 ${p.required}회 중 ${p.reported}회 이행(보고서 기준)${p.maxRounds > p.required ? ` · 추가 회차 승인으로 최대 ${p.maxRounds}회` : ''}.`;
        anchor = '#rounds';
      } else if (!p.hasObservation) {
        title = '관찰의견서를 작성하세요';
        desc = '필수 회차를 모두 이행했습니다. 관찰의견서(멘티당 1건)를 쓰면 종결을 요청할 수 있습니다.';
        anchor = '#observation';
        tone = 'action';
      } else if (p.closureOk) {
        title = '종결을 요청하세요';
        desc = p.closureHint;
        anchor = '#requests';
        tone = 'action';
      } else {
        title = '종결 요청 전 확인할 것';
        desc = p.closureHint;
        anchor = '#requests';
        tone = 'action';
      }
  }
  const toneCls = tone === 'action' ? 'border-brand-coral bg-orange-50/70 dark:bg-orange-950/20' : tone === 'done' ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-sky-300 bg-sky-50/60 dark:bg-sky-950/20';
  const Icon = tone === 'action' ? (p.status === 'revision_requested' ? AlertTriangle : Lightbulb) : tone === 'done' ? CheckCircle2 : Lightbulb;
  return (
    <div className={`flex flex-col gap-2 rounded-xl border-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${toneCls}`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone === 'action' ? 'text-brand-coral' : tone === 'done' ? 'text-emerald-600' : 'text-sky-600'}`} />
        <div>
          <p className="text-sm font-bold">
            <span className="mr-2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{tone === 'action' ? '다음 할 일' : tone === 'done' ? '완료' : '대기 중'}</span>
            {title}
          </p>
          {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {anchor && (
        <a href={anchor} className="inline-flex shrink-0 items-center gap-1 self-start rounded-md bg-background px-2.5 py-1.5 text-xs font-semibold shadow-sm hover:bg-accent sm:self-auto">
          바로 가기 <ArrowRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
