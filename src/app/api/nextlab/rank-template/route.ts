import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { workbookBuffer, xlsxResponse } from '@/lib/excel/sheet';

export const dynamic = 'force-dynamic';

/** 멘티 순위 업로드 템플릿 (P27-01) — GET /api/nextlab/rank-template. 고유번호 열은 텍스트 서식 (P31) */
export async function GET(): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ws = XLSX.utils.aoa_to_sheet([
    ['멘티명', '멘티 순위', '고유번호(선택)'],
    ['홍길동', 1, ''],
    ['김멘티', 2, 'M-002'],
  ]);
  for (let r = 0; r < 200; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 2 });
    const existing = ws[addr] as XLSX.CellObject | undefined;
    ws[addr] = { ...(existing ?? { t: 's', v: '' }), z: '@', t: 's' } as XLSX.CellObject;
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 199, c: 2 } });
  ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 16 }];
  const guide = XLSX.utils.aoa_to_sheet([
    ['안내'],
    ['· 1행 헤더는 수정하지 마세요. "멘티명(이름)"과 "순위" 컬럼만 있으면 됩니다.'],
    ['· 이름으로 케이스를 찾습니다. 동명이인이 있으면 고유번호 컬럼을 채우세요(멘티 정보의 고유번호와 일치).'],
    ['· 순위를 비우거나 "-" 로 쓰면 그 멘티의 순위가 해제됩니다.'],
    ['· 현재 범위(행사 전체 또는 선택한 그룹)의 진행 중 멘티만 갱신됩니다(중도 종료 제외). 파일에 없는 멘티의 순위는 그대로 둡니다.'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '멘티 순위');
  XLSX.utils.book_append_sheet(wb, guide, '안내');
  return xlsxResponse(workbookBuffer(wb), '멘티순위_템플릿.xlsx');
}
