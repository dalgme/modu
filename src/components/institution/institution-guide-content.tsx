import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PwaGuide } from '@/components/common/pwa-guide';
import { Building2, Users, UserCog, Store, ArrowRight, AlertTriangle } from 'lucide-react';

import type { Branding } from '@/lib/programs/branding';
import { fmt, PLATFORM_BRANDING } from '@/lib/programs/branding';

/** 본 사업 주체 — 기관명은 행사 브랜딩({client}/{operator})으로 치환 */
const ROLES = [
  { icon: Building2, name: '{client}', desc: '발주처. 멘토·멘티별 실시간 진행현황 열람, 리포트, 지급 품의 정산 확인(종결 확정).' },
  { icon: UserCog, name: '{operator}', desc: '운영사. 사업그룹 개설, 멘토·멘티 등록, 멘토 배정·변경, 종결 검수, 정산 확정·지급 품의, 설정 전반.' },
  { icon: Users, name: '멘토', desc: '담당 멘티 컨설팅 회차 등록(웹 작성/보고서 업로드·사진), 관찰의견서 작성, 종결 요청, 추가 회차·중도 종료 요청.' },
  { icon: Store, name: '멘티', desc: '진행현황 열람, 회차 확인 서명, 필수서류·관련 서류 제출, 만족도 조사, 멘토 변경 요청.' },
];

type StepDetail = { actor: string; tone: string; title: string; points: string[]; caution?: string };

const T_CLIENT = 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
const T_OP = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';
const T_MENTOR = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
const T_MENTEE = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';

/** 단계별 사용법 (개조식) — 상태머신 v2 순서 */
const STEP_DETAILS: StepDetail[] = [
  {
    actor: '{operator}',
    tone: T_OP,
    title: '① 멘티 등록',
    points: ['운영 설정에서 사업그룹(회차 수·필수서류·단가) 준비', '멘티 등록 폼 또는 엑셀 일괄 등록으로 케이스 생성', '멘티 계정이 자동 발급됨(임시 비밀번호 = 휴대폰 번호)'],
    caution: '이전 단계 그룹의 멘티는 승계 개설로 새 케이스를 만들어 이력을 이어갑니다.',
  },
  {
    actor: '{operator}',
    tone: T_OP,
    title: '② 멘토 배정',
    points: ['케이스 상세에서 멘토 선택(AI 매칭 추천 참고) → 배정', '진행 중 멘토 교체(회차는 케이스 단위로 이어짐)·회수 가능'],
    caution: '자동 배정은 없습니다. 추천은 근거와 함께 기록되고 배정은 항상 운영사가 클릭합니다.',
  },
  {
    actor: '멘토',
    tone: T_MENTOR,
    title: '③ 컨설팅 회차 등록',
    points: ['회차마다 일시·장소·유형(온라인/오프라인)·내용(또는 보고서 파일)·사진 등록', '단가는 등록 시점에 스냅샷으로 고정', '필요 시 추가 회차·중도 종료 요청'],
    caution: '같은 멘티·같은 날 회차 수와 금액 상한, 멘토 1일 최대 건수, 시간 겹침을 서버가 검증합니다.',
  },
  {
    actor: '멘티',
    tone: T_MENTEE,
    title: '④ 회차 확인 서명 · 서류',
    points: ['알림을 받고 회차 내용을 확인한 뒤 서명(정책 설정 시)', '그룹 필수서류·관련 서류 업로드(멘토 공개/비공개 선택)'],
    caution: '멘티가 서명한 회차는 멘토가 내용을 수정할 수 없습니다.',
  },
  {
    actor: '멘토',
    tone: T_MENTOR,
    title: '⑤ 관찰의견서 · 종결 요청',
    points: ['필수 회차를 채운 뒤 관찰의견서(멘티당 1건) 작성 또는 업로드', '종결 요청 → PDF 단일본으로 제출'],
  },
  {
    actor: '{operator}',
    tone: T_OP,
    title: '⑥ 검수 · 정산 확정',
    points: ['종결 검수: 승인 또는 보완 요청', '승인 시 정산 스냅샷(회차·단가·원천징수·실지급액) 확정, 멘토에게 통보', '지급 대기 건을 골라 지급 품의 편성 → 제출'],
    caution: '확정 스냅샷은 이후 단가·세율 변경에 영향을 받지 않습니다. 취소는 품의 편성 전에만 가능합니다.',
  },
  {
    actor: '{client}',
    tone: T_CLIENT,
    title: '⑦ 정산 확인 · 종결',
    points: ['정산 확인 메뉴에서 제출된 품의 확인', '확인하면 포함된 케이스가 종결 확정'],
    caution: '이후 운영사가 실제 지급 후 "지급 완료"를 표시합니다.',
  },
];

/** 발주처 이용방법 본문 (참여 주체 + 단계별 사용법 + PWA 안내). 발주처 이용방법 페이지와 운영사 회원 열람(view-as) 탭에서 공용. */
export function InstitutionGuideContent({ branding = PLATFORM_BRANDING }: { branding?: Branding }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">이 플랫폼은</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          멘티와 멘토를 1:1로 연결·배정하고, 컨설팅 회차·보고서·관찰의견서·정산까지 <b className="text-foreground">전 과정</b>을 하나의 화면에서 관리합니다.{' '}
          {fmt('{client}·{operator}·멘토·멘티가 각자의 역할로 참여하며, 진행현황을 실시간으로 확인할 수 있습니다.', branding)}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">참여 주체</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <Card key={r.name}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">{fmt(r.name, branding)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{r.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">단계별 사용법</h2>
        <ol className="flex flex-col gap-3">
          {STEP_DETAILS.map((s) => (
            <li key={s.title}>
              <Card>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.tone}`}>{fmt(s.actor, branding)}</span>
                    <p className="font-semibold">{s.title}</p>
                  </div>
                  <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{fmt(p, branding)}</span>
                      </li>
                    ))}
                  </ul>
                  {s.caution && (
                    <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{fmt(s.caution, branding)}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </div>

      <PwaGuide />
    </div>
  );
}
