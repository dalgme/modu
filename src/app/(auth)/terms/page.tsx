import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '시스템 이용수칙',
  description: '대전 소상공인·자영업자 재기지원 플랫폼 시스템 이용수칙',
};

/** 시스템 이용수칙 (상용화 출시 §14 법적문서). 세부 문구는 기관 최종 검토 후 확정. */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">시스템 이용수칙</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        본 수칙은 대전 소상공인·자영업자 재기지원 플랫폼(이하 &lsquo;서비스&rsquo;)의 이용 조건과 절차,
        이용자와 운영기관의 권리·의무를 규정합니다.
      </p>

      <section className="prose prose-sm mt-8 max-w-none space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-semibold">1. 계정</h2>
          <p>
            계정은 운영기관이 발급하며, 이용자는 발급받은 계정을 본인이 직접 관리합니다. 최초 로그인 시
            임시 비밀번호를 변경해야 하며, 계정 정보의 유출·양도·대여는 금지됩니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">2. 이용자의 의무</h2>
          <ul className="list-disc pl-5">
            <li>신청·증빙 서류는 사실에 근거하여 작성·제출합니다.</li>
            <li>타인의 정보를 도용하거나 허위 정보를 등록하지 않습니다.</li>
            <li>서비스의 정상 운영을 방해하는 행위를 하지 않습니다.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-base font-semibold">3. 금지 행위</h2>
          <p>
            서류 위·변조, 중복지원, 부당한 이익 수수, 시스템 무단 접근·자동화 수집, 지식재산권 침해 등의
            행위를 금지합니다. 위반 시 지원 탈락·지원금 환수·이용 제한 등의 조치가 취해질 수 있습니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">4. 서비스 제공 및 변경</h2>
          <p>
            운영기관은 사업 일정에 따라 서비스를 제공하며, 점검·장애·정책 변경 등의 사유로 서비스의 전부
            또는 일부를 변경·중단할 수 있습니다. 중요한 변경은 사전에 공지합니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">5. 책임의 한계</h2>
          <p>
            이용자의 귀책사유 또는 천재지변 등 불가항력으로 발생한 손해에 대해 운영기관은 책임을 지지
            않습니다.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold">6. 문의</h2>
          <p>서비스 이용 관련 문의는 운영기관((주)넥스트랩) 및 대전일자리경제진흥원 담당 부서로 접수합니다.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold">7. 시행</h2>
          <p>본 시스템 이용수칙은 2026년 7월 7일부터 시행합니다. 수칙이 변경되는 경우 변경 내용을 본
            페이지를 통해 사전 공지합니다.</p>
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
