import type { Metadata } from 'next';

import { OperatorRegisterForm } from '@/components/auth/operator-register-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: '운영사 총괄담당자 등록' };
export const dynamic = 'force-dynamic';

/**
 * 운영사 총괄담당자 셀프 등록 (공개 페이지, P16).
 * 확인코드를 아는 운영사 담당자가 아이디(이메일)·비밀번호를 직접 정해 등록한다.
 * 등록 즉시 해당 행사의 운영사 메인 담당(PL) — 추가 담당자·옵저버는 로그인 후 회원 관리에서 발급한다.
 */
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">운영사 총괄담당자 등록</CardTitle>
          <CardDescription>
            행사 운영을 총괄하는 담당자 계정을 만듭니다. 등록에는 운영사 내부로 전달된 <b>확인코드</b>가 필요하며,
            <b>행사당 1명</b>이 등록하면 코드가 소진되어 이 창구는 자동으로 닫힙니다.
            등록 후에는 회원 관리에서 추가 담당자·옵저버 계정을 직접 발급할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperatorRegisterForm />
        </CardContent>
      </Card>
    </main>
  );
}
