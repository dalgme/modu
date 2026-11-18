import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { listTopicJobs } from '@/lib/files/report-topics';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * 회차 보고서 "멘토링 주제" 읽기 목록 (2026-11-18) — `?group=<라운드 id>`(없으면 행사 전체).
 * 운영사·발주처. 아직 읽지 않았거나 보고서가 바뀐 회차만, 60건씩 1시간 서명 URL 과 함께 준다.
 */
export async function GET(request: Request): Promise<Response> {
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (!staff) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  const ctx = await contextOrNull(staff);
  if (!ctx) return NextResponse.json({ error: '행사를 먼저 선택하세요.' }, { status: 400 });
  const g = new URL(request.url).searchParams.get('group');
  const groupId = g && UUID.test(g) ? g : null;
  try {
    const list = await listTopicJobs(ctx.programId, groupId);
    return NextResponse.json(list, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '목록을 만들지 못했습니다.' }, { status: 500 });
  }
}
