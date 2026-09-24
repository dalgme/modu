import Link from 'next/link';
import { CheckCircle2, ChevronDown, Circle, Rocket } from 'lucide-react';

/** 운영 시작 체크리스트 (운영사 대시보드, P28) — 그룹·단가·회원이 비어 있는 첫날에만 보인다. */
export interface SetupState {
  groups: number;
  rates: number;
  mentors: number;
  mentees: number;
  assigned: number;
}

function buildItems(s: SetupState) {
  return [
    { done: s.groups > 0, label: '사업그룹(라운드) 개설', desc: '멘티가 소속될 그룹을 만듭니다. 그룹마다 목표 회차·필수서류를 정합니다.', href: '/nextlab/settings?tab=groups' },
    { done: s.rates > 0, label: '단가 · 1일 한도 확인', desc: '온라인/오프라인 회차 단가와 일일 상한 — 정산 금액의 기준입니다.', href: '/nextlab/settings?tab=rates' },
    { done: s.mentors > 0, label: '멘토 등록', desc: '이름·연락처·분야로 등록하거나 엑셀로 일괄 등록합니다.', href: '/nextlab/roster?tab=register&reg=mentor' },
    { done: s.mentees > 0, label: '멘티 등록', desc: '그룹을 고르고 멘티를 등록하면 희망 멘토·희망분야로 자동 매칭·추천이 시작됩니다.', href: '/nextlab/roster?tab=register&reg=mentee' },
    { done: s.assigned > 0, label: '멘토 배정(매칭 확정)', desc: '멘티 매칭 리스트에서 추천을 확정하거나 수동 검색으로 배정합니다. 전원 배정되면 멘토에게 로그인 안내 문자가 자동 발송됩니다.', href: '/nextlab/roster?tab=mentee-match' },
  ];
}

function ItemList({ items }: { items: ReturnType<typeof buildItems> }) {
  return (
    <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
      {items.map((i, idx) => (
        <li key={i.href}>
          <Link href={i.href} className={`flex h-full items-start gap-2 rounded-xl border bg-background p-3 text-sm transition-colors hover:border-primary ${i.done ? 'opacity-70' : ''}`}>
            {i.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <span className="flex flex-col">
              <span className="font-semibold">
                {idx + 1}. {i.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{i.desc}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function SetupChecklist({ s }: { s: SetupState }) {
  const items = buildItems(s);
  const doneCount = items.filter((i) => i.done).length;
  const box = 'rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4';
  return (
    <>
      {/* (P31) 폰: <details> 로 접어 "운영 시작 n/5" 한 줄만 — 알람 카드 아래에 놓여 첫 화면을 가리지 않는다 */}
      <details className={`${box} sm:hidden`}>
        <summary className="flex list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-base font-bold">
            <Rocket className="h-5 w-5 text-primary" /> 운영 시작 {doneCount}/{items.length}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </summary>
        <div className="mt-3">
          <ItemList items={items} />
          <a href="/guide.html#tab-op" target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-primary underline underline-offset-2">이용안내 보기</a>
        </div>
      </details>
      {/* 데스크톱: 항상 펼침 */}
      <section className={`hidden ${box} sm:block`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Rocket className="h-5 w-5 text-primary" /> 운영 시작 체크리스트
            <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">{doneCount}/{items.length}</span>
          </h2>
          <a href="/guide.html#tab-op" target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary underline underline-offset-2">이용안내 보기</a>
        </div>
        <ItemList items={items} />
      </section>
    </>
  );
}
