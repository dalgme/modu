import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { workbookBuffer, xlsxResponse } from '@/lib/excel/sheet';

export const dynamic = 'force-dynamic';

/** 멘토 희망 멘티 수 업로드 템플릿 (2026-10-23) — GET /api/nextlab/desired-template. 전화번호 열은 텍스트 서식 */
export async function GET(): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ws = XLSX.utils.aoa_to_sheet([
    ['멘토명', '전화번호', '이메일', '희망 멘티 수'],
    ['홍길동', '010-1234-5678', 'mentor1@example.com', 3],
    ['김멘토', '010-2345-6789', 'mentor2@example.com', 2],
  ]);
  for (let r = 0; r < 300; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 1 });
    const existing = ws[addr] as XLSX.CellObject | undefined;
    ws[addr] = { ...(existing ?? { t: 's', v: '' }), z: '@', t: 's' } as XLSX.CellObject;
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 299, c: 3 } });
  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 26 }, { wch: 12 }];
  const guide = XLSX.utils.aoa_to_sheet([
    ['안내'],
    ['· 1행 헤더는 그대로 두세요. "멘토명"과 "희망 멘티 수"는 꼭 있어야 하고, 전화번호·이메일은 동명이인 구분에 씁니다.'],
    ['· 멘토명으로 찾습니다. 같은 이름의 멘토가 여럿이면 등록된 전화번호(없으면 이메일)로 구분합니다.'],
    ['· 희망 멘티 수는 0~99 정수입니다. 비우거나 "-" 로 쓰면 그 멘토의 값을 지웁니다.'],
    ['· 업로드 화면에서 고른 라운드(사업그룹)에만 저장됩니다. 파일에 없는 멘토의 값은 그대로 둡니다.'],
    ['· 희망 멘티 수는 매칭 수동 검색 화면에 표시되는 참고값이며, 배정 정원(운영 설정 › 매칭 규칙)은 바꾸지 않습니다.'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '희망 멘티 수');
  XLSX.utils.book_append_sheet(wb, guide, '안내');
  return xlsxResponse(workbookBuffer(wb), '멘토_희망멘티수_템플릿.xlsx');
}
