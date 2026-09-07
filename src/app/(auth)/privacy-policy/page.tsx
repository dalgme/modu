import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: '멘토링 운영관리 플랫폼 개인정보처리방침',
};

/** 개인정보처리방침 (상용화 출시 §14 법적문서). 세부 문구는 기관 최종 검토 후 확정. */
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        본 플랫폼의 각 행사 발주처(이하 &lsquo;발주처&rsquo;)는 「개인정보 보호법」 제30조에 따라 정보주체의
        개인정보를 보호하고 관련 고충을 신속히 처리하기 위하여 다음과 같이 개인정보처리방침을
        수립·공개합니다.
      </p>

      <section className="prose prose-sm mt-8 max-w-none space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-semibold">1. 개인정보의 처리 목적</h2>
          <p>
            멘토링 프로그램 참여자 등록·멘토 배정·컨설팅 회차 관리·정산, 만족도 조사, 사후관리 및
            통계·감사를 위하여 개인정보를 처리합니다. 처리한 개인정보는 명시한 목적 이외의 용도로
            이용하지 않습니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">2. 수집하는 개인정보 항목</h2>
          <ul className="list-disc pl-5">
            <li>필수: 성명, 연락처, 사업자등록번호, 사업장 주소·업종, 이메일, 계좌정보</li>
            <li>사업 수행 과정: 멘토링 일지·서명, 현장 사진, 증빙서류(견적서·통장사본·신분증 등)</li>
            <li>자동 수집: 접속 로그, 쿠키, 접속 IP, 서비스 이용 기록</li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold">3. 개인정보의 보유 및 이용 기간</h2>
          <p>
            관계 법령 및 보조금 관리 규정에 따라 사업 종료 후 5년간 보유하며, 기간 경과 시 지체 없이
            파기합니다. 다른 법령에서 별도의 보존기간을 정한 경우 이에 따릅니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">4. 개인정보의 제3자 제공 및 처리 위탁</h2>
          <p>
            원칙적으로 정보주체의 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만 사업 운영을 위해
            운영기관(운영사)에 처리를 위탁하며, 법령에 근거가 있거나 정보주체의 동의가 있는 경우에
            한하여 제공합니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">5. 정보주체의 권리·의무 및 행사 방법</h2>
          <p>
            정보주체는 언제든지 개인정보 열람·정정·삭제·처리정지를 요구할 수 있으며, 발주처는 지체 없이
            필요한 조치를 취합니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">6. 개인정보의 안전성 확보 조치</h2>
          <p>
            접근권한 관리, 접속기록 보관·점검, 개인정보 암호화, 접근통제 등 관리적·기술적 보호조치를
            시행합니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">7. 개인정보 보호책임자</h2>
          <p>
            발주처는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 정보주체의 불만처리 및 피해구제를
            위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
          </p>
          <ul className="mt-1 list-disc pl-5">
            <li>개인정보 보호책임자: 각 행사 발주처의 개인정보 보호 담당 부서장</li>
            <li>문의·열람·정정·삭제 접수: 각 행사 발주처 대표 연락처 및 운영사(행사 기본 설정에 등록된 연락처)</li>
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
            본 개인정보처리방침은 2026년 7월 7일부터 적용되며, 법령·정책 또는 보안기술의 변경에 따라
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
