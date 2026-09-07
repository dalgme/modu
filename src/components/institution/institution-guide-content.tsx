import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PwaGuide } from '@/components/common/pwa-guide';
import { Building2, Users, UserCog, Store, ArrowRight, AlertTriangle } from 'lucide-react';

/** 본 사업 주체 */
const ROLES = [
  {
    icon: Building2,
    name: '진흥원',
    desc: '멘티기업 등록(사업신청서 PDF 업로드·회원가입), 지원·지급 신청 승인/반려. 운영사(넥스트랩)에 처리 요청.',
  },
  {
    icon: UserCog,
    name: '넥스트랩(운영사)',
    desc: '멘토 배정, 서류 검수, 지급신청서 작성, 회원·문자·문의 관리 등 전반 운영.',
  },
  { icon: Users, name: '멘토', desc: '멘토링 진행·일지·서명, 지원신청서·부속서류 작성, 결과보고서 제출.' },
  { icon: Store, name: '멘티기업', desc: '공사업체·증빙 서류 등록, 진행현황 확인, 문의.' },
];

type StepDetail = {
  actor: string;
  tone: string;
  title: string;
  points: string[];
  caution?: string;
};

/** 단계별 사용법 (개조식) — 담당 주체 · 하는 일 · 유의사항 */
const STEP_DETAILS: StepDetail[] = [
  {
    actor: '진흥원',
    tone: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    title: '멘티기업 등록',
    points: [
      '대시보드 우측 상단 ‘멘티기업 등록’ 클릭',
      '사업신청서(붙임1·2) PDF 업로드 → 업체·대표·연락처 등 정보가 자동으로 채워짐',
      '지원유형(경영개선 / 폐업정리) 확인 후 ‘케이스 등록’',
    ],
    caution:
      '등록 시 멘티 로그인 계정이 자동 발급됩니다(임시비밀번호 = 휴대폰 번호). 자격심사·선정은 진흥원 별도 절차이며, 이름·회사명은 띄어쓰기 없이 통일됩니다.',
  },
  {
    actor: '넥스트랩',
    tone: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    title: '멘토 배정',
    points: [
      '넥스트랩이 접수내용을 확인하고 담당 멘토를 배정',
      '필요 시 멘토 재배정 또는 배정 회수 가능',
    ],
    caution:
      '배정이 회수되면 해당 기업은 진흥원 대시보드의 ‘회수 및 재등록 필요 기업’ 박스에 표시됩니다. 클릭해 PDF 재업로드·내용 보완 후 다시 등록하면 재배정 대기로 넘어갑니다.',
  },
  {
    actor: '멘토',
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    title: '멘토링 · 멘티 미팅 서명',
    points: [
      '멘토가 멘티기업을 방문해 현장 미팅 진행',
      '‘멘티별 업무진행’에서 멘티(대표) 확인 서명을 받아둠',
    ],
    caution:
      '멘티 서명을 한 번 받아두면 멘토링보고서·지원신청서 등 서식의 신청업체 서명 자리에 자동으로 재사용됩니다(매번 다시 받지 않아도 됨).',
  },
  {
    actor: '멘토',
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    title: '멘토링 일지 · 사진',
    points: [
      '방문 회차별로 일지(방문일·주제·내용) 작성 + 현장 사진 첨부',
      '유형별 필수 회차 충족 시 다음 단계로 진행',
    ],
    caution:
      '경영개선은 컨설팅 2회 필수(필요시 1회 추가), 폐업정리는 1회 필수(필요시 1회 추가)입니다. 컨설팅은 1회 1시간·시간당 12만원 기준입니다.',
  },
  {
    actor: '멘티기업',
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    title: '지원신청(사전) · 공사업체 등록',
    points: [
      '멘티가 상단 ‘지원신청(사전)’에서 신청단위(간판·싱크대·POS 등)를 최대 3개까지 추가',
      '단위별 공사업체 사업자등록증·견적서 업로드',
      '상단 ‘공사업체 서명받기’에서 납품업체 대표 서명 수령',
    ],
    caution:
      '신청금액 100만원 이상이면 비교견적서, 간판·옥외광고 공사면 옥외광고물 설치 허가서가 추가로 필요합니다. 멘티가 어려우면 담당 멘토가 대신 업로드할 수 있습니다.',
  },
  {
    actor: '멘토',
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    title: '지원신청서 · 부속서류 작성',
    points: [
      '멘토가 지원신청서(붙임5)를 작성 — 업체·첨부서류가 자동 반영',
      '동의·확약 등 부속서류를 PDF로 생성',
    ],
    caution: '제출 시 붙임서식 PDF가 자동 생성됩니다. 서명 자리는 저장된 서명으로 자동 채워집니다.',
  },
  {
    actor: '넥스트랩',
    tone: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    title: '검수',
    points: ['넥스트랩이 제출된 지원신청서·서류를 검수', '보완 필요 시 반려 후 재작성 요청'],
    caution: '검수를 통과해야 진흥원 승인 단계로 넘어갑니다.',
  },
  {
    actor: '진흥원',
    tone: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    title: '지원 승인 / 반려',
    points: [
      '대시보드 ‘승인 대기’에서 해당 건을 열어 내용 확인',
      '‘승인’ 또는 사유를 적어 ‘반려’ 처리',
    ],
    caution:
      '승인하면 멘티기업에 통보되고 시공·증빙 단계로 진행됩니다. 반려 사유는 멘티·멘토에게 전달되니 명확히 작성하세요.',
  },
  {
    actor: '멘티기업',
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    title: '자금신청(사후) · 시공 증빙 등록',
    points: [
      '공사 완료 후 상단 ‘자금신청(사후)’에서 지급 증빙 업로드',
      '세금계산서·거래명세서·이체확인서 + 시공 전/후 사진 첨부',
    ],
    caution: '시공 전/후 사진과 대금 지급 증빙(이체확인서)이 함께 있어야 정산이 빠릅니다.',
  },
  {
    actor: '넥스트랩 → 진흥원',
    tone: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    title: '지급신청서 작성 · 지급 승인',
    points: ['넥스트랩이 지급신청서 작성', '진흥원이 ‘승인 대기’에서 지급 건을 최종 승인'],
    caution: '지급 승인으로 해당 케이스가 종결됩니다. 금액·계좌 정보를 다시 한 번 확인하세요.',
  },
];

/**
 * 진흥원 이용방법 본문 (참여 주체 + 단계별 개조식 사용법 + 요약 흐름 + PWA 안내).
 * 진흥원 이용방법 페이지와 넥스트랩 회원 열람(view-as) 탭에서 공용으로 사용한다.
 */
export function InstitutionGuideContent() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">이 플랫폼은</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          멘티기업 등록부터 멘토링, 붙임서식 자동 생성, 검수·승인, 시공 증빙, 지급까지{' '}
          <b className="text-foreground">전 과정</b>을 하나의 화면에서 투명하게 관리합니다.
          진흥원·넥스트랩·멘토·멘티기업이 각자의 역할로 참여하며, 각 단계의 처리 대기와 진행현황을
          실시간으로 확인할 수 있습니다.
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">참여 주체</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <Card key={r.name}>
                <CardContent className="flex gap-3 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{r.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 단계별 사용법 (개조식) */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">단계별 사용법</h2>
        <div className="flex flex-col gap-3">
          {STEP_DETAILS.map((step, i) => (
            <Card key={step.title} className="overflow-hidden">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:gap-4">
                <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:flex-col sm:items-start">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${step.tone}`}>
                    {step.actor}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold">{step.title}</h3>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {step.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                  {step.caution && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-200">
                        {step.caution}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 전체 흐름 요약 */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">전체 흐름 (요약)</h2>
        <Card>
          <CardContent className="py-4">
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
              {STEP_DETAILS.map((s, i) => (
                <li key={s.title} className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                      {i + 1}
                    </span>
                    {s.title}
                  </span>
                  {i < STEP_DETAILS.length - 1 && (
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* PWA(홈 화면 추가) 설치 안내 */}
      <PwaGuide />
    </div>
  );
}
