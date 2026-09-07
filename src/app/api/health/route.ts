import { NextResponse } from 'next/server';

// 헬스체크용 Route Handler (배포 상태 확인).
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
