import Link from 'next/link';
import type { Metadata } from 'next';

import { DEFAULT_RETENTION_YEARS } from '@/lib/programs/branding';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: '멘토링 운영관리 플랫폼 개인정보처리방침',
};

/**
 * 개인정보처리방침 (P35-B, SECURITY-POLICY R-13a) — 멘토링 운영관리 플랫폼 실제 처리 항목 기준.
 * 보존기간은 사용자 결정(2026-09-28) "사업 종료 후 5년" 으로 멘티 동의문과 통일. 행사별 값은 운영 설정 [행사 기본] 에서 조정(기본 5년).
 * 기관명 리터럴 금지 — 발주처·운영사는 각 행사 설정으로 지정된다.
 */
export default function PrivacyPolicyPage() {
  const years = DEFAULT_RETENTION_YEARS;
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        본 멘토링 운영관리 플랫폼의 각 행사 발주처(이하 &lsquo;발주처&rsquo;)는 「개인정보 보호법」 제30조에 따라 정보주체의
        개인정보를 보호하고 관련 고충을 신속히 처리하기 위하여 다음과 같이 개인정보처리방침을
        수립·공개합니다. 행사 운영은 발주처가 지정한 운영기관(이하 &lsquo;운영사&rsquo;)이 위탁받아 수행합니다.
      </p>

      <section className="prose prose-sm mt-8 max-w-none space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-semibold">1. 개인정보의 처리 목적</h2>
          <p>
            멘토링 프로그램 참여자(멘티·멘토) 등록, 멘토 매칭·배정, 컨설팅 회차 일정 안내와 진행 기록, 회차 확인 서명,
            관찰의견서 작성, 만족도 조사, 멘토 정산(지급 청구·원천징수) 및 결과 보고, 운영 통계·감사, 문자·이메일 안내를
            위하여 개인정보를 처리합니다. 처리한 개인정보는 명시한 목적 이외의 용도로 이용하지 않습니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">2. 수집하는 개인정보 항목</h2>
          <ul className="list-disc pl-5">
            <li>공통(멘티·멘토·운영 담당자): 성명, 휴대폰 번호, 이메일, 소속, 직위, 권역</li>
            <li>멘티: 팀명·창업 아이디어(아이템)·사업 정보, 팀원 명단, 희망 분야, 회차 확인 서명, 만족도 조사 응답, 그룹별 필수 제출 서류</li>
            <li>멘토: 전문 분야·소속 멘토 기관, 전자서명, 지급서류(이력서·통장사본·신분증 사본 — 멘토 정산 지급 목적에 한함)</li>
            <li>멘토링 수행 과정: 회차 기록(일시·방법·장소·참가자), 회차 보고서, 현장 사진, 관찰의견서, 정산서</li>
            <li>자동 수집: 접속 기록(로그인·화면 오류·보안 이벤트 — IP 는 해시로만 저장), 쿠키, 서비스 이용 기록</li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold">3. 개인정보의 보유 및 이용 기간</h2>
          <p>
            개인정보는 <strong>사업(행사) 종료 후 {years}년</strong>간 보유하며, 기간 경과 시 지체 없이 파기합니다.
            다른 법령(국세기본법 등 정산 증빙 보존 의무)에서 별도의 보존기간을 정한 경우 이에 따릅니다.
            행사별 보존기간은 발주처와 운영사가 행사 설정으로 정하며, 멘티 동의문에 같은 기간이 표시됩니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">4. 개인정보의 제3자 제공 및 처리 위탁</h2>
          <p>
            원칙적으로 정보주체의 동의 없이 개인정보를 외부에 제공하지 않습니다. 멘티의 성명·연락처·아이템·팀 정보는 배정된
            담당 멘토에게, 진행현황·결과는 발주처에 제공됩니다. 사업 운영을 위해 운영사에 처리를 위탁하며, 문자·이메일 발송과
            데이터 보관을 위해 클라우드·문자 발송 사업자를 이용합니다. 그 밖에는 법령에 근거가 있거나 정보주체의 동의가 있는
            경우에 한하여 제공합니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">5. 정보주체의 권리·의무 및 행사 방법</h2>
          <p>
            정보주체는 언제든지 개인정보 열람·정정·삭제·처리정지를 요구할 수 있으며, 발주처와 운영사는 지체 없이 필요한
            조치를 취합니다. 요구는 아래 보호책임자 연락처 또는 플랫폼의 문의 기능으로 접수할 수 있습니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">6. 개인정보의 안전성 확보 조치</h2>
          <p>
            역할·등급별 접근권한 관리, 접속기록(감사 로그) 보관·점검, 민감 자격증명 암호화, 암호화된 정기 백업,
            해킹 시도·이상 접근 자동 감지와 관리자 통보, 접근통제 등 관리적·기술적 보호조치를 시행합니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">7. 개인정보 보호책임자</h2>
          <p>
            발주처는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 정보주체의 불만처리 및 피해구제를 위하여 개인정보
            보호책임자를 지정합니다. 각 행사의 보호책임자(발주처)와 운영사 메인 담당자 연락처는 행사 설정에 등록되어
            침해사고 발생 시 통지 책임 주체가 됩니다.
          </p>
          <ul className="mt-1 list-disc pl-5">
            <li>개인정보 보호책임자: 각 행사 발주처가 지정한 개인정보 보호 담당자</li>
            <li>문의·열람·정정·삭제 접수: 각 행사 발주처 대표 연락처 및 운영사 메인 담당자(행사 기본 설정에 등록된 연락처)</li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold">8. 권익침해 구제 방법</h2>
          <p>
            개인정보 침해에 대한 상담·신고는 개인정보분쟁조정위원회(1833-6972), 개인정보침해신고센터
            (privacy.kisa.or.kr, 118), 대검찰청(1301), 경찰청(182)에 문의할 수 있습니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">9. 방침의 변경</h2>
          <p>
            본 개인정보처리방침은 2026년 9월 28일부터 적용되며, 법령·정책 또는 보안기술의 변경에 따라
            내용의 추가·삭제·수정이 있을 경우 변경 최소 7일 전에 본 페이지를 통해 공지합니다.
          </p>
        </div>
      </section>

      <div className="mt-10 border-t pt-6 text-sm">
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          로그인으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
