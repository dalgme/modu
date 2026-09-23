import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/** 멘티 순위 업로드 템플릿 (P27-01) — GET /api/nextlab/rank-template */
export async function GET(): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ws = XLSX.utils.aoa_to_sheet([
    ['멘티명', '멘티 순위', '고유번호(선택)'],
    ['홍길동', 1, ''],
    ['김멘티', 2, 'M-002'],
  ]);
  const guide = XLSX.utils.aoa_to_sheet([
    ['안내'],
    ['· 1행 헤더는 수정하지 마세요. "멘티명(이름)"과 "순위" 컬럼만 있으면 됩니다.'],
    ['· 이름으로 케이스를 찾습니다. 동명이인이 있으면 고유번호 컬럼을 채우세요(멘티 정보의 고유번호와 일치).'],
    ['· 현재 범위(행사 전체 또는 선택한 그룹)의 멘티만 갱신됩니다. 파일에 없는 멘티의 순위는 그대로 둡니다.'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '멘티 순위');
  XLSX.utils.book_append_sheet(wb, guide, '안내');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer;
  return new Response(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('멘티순위_템플릿.xlsx')}`,
    },
  });
}
