import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';

export interface PlatformProgramItem {
  program: Tables<'programs'>;
  groups: number;
  cases: number;
  members: { nextlab: number; institution: number; mentor: number; mentee: number };
}

/** 플랫폼 콘솔 — 모든 행사 + 규모 요약 (service_role, 호출부 플랫폼 관리자 가드) */
export async function listAllPrograms(): Promise<PlatformProgramItem[]> {
  const admin = createAdminClient();
  const { data: programs } = await admin.from('programs').select('*').order('status').order('created_at', { ascending: false });
  const rows = programs ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);
  const [{ data: groups }, { data: cases }, { data: members }] = await Promise.all([
    admin.from('support_types').select('program_id').in('program_id', ids),
    admin.from('cases').select('program_id').in('program_id', ids),
    admin.from('program_members').select('program_id, user_id, users!inner(role)').in('program_id', ids).eq('is_active', true),
  ]);
  return rows.map((p) => {
    const m = { nextlab: 0, institution: 0, mentor: 0, mentee: 0 };
    for (const x of members ?? []) {
      if (x.program_id !== p.id) continue;
      const role = (x.users as unknown as { role: keyof typeof m } | null)?.role;
      if (role && role in m) m[role] += 1;
    }
    return { program: p, groups: (groups ?? []).filter((g) => g.program_id === p.id).length, cases: (cases ?? []).filter((c) => c.program_id === p.id).length, members: m };
  });
}

export async function listPlatformAdmins(): Promise<Pick<Tables<'users'>, 'id' | 'name' | 'email' | 'role' | 'is_active'>[]> {
  const { data } = await createAdminClient().from('users').select('id, name, email, role, is_active').eq('is_platform_admin', true).order('name');
  return data ?? [];
}

export async function getProgramWithStaff(programId: string): Promise<{ program: Tables<'programs'>; staff: { id: string; name: string; email: string | null; role: string; is_active: boolean }[] } | null> {
  const admin = createAdminClient();
  const { data: program } = await admin.from('programs').select('*').eq('id', programId).maybeSingle();
  if (!program) return null;
  const { data: members } = await admin.from('program_members').select('user_id, users!inner(id, name, email, role, is_active)').eq('program_id', programId).eq('is_active', true);
  const staff = (members ?? [])
    .map((m) => m.users as unknown as { id: string; name: string; email: string | null; role: string; is_active: boolean })
    .filter((u) => u.role === 'nextlab' || u.role === 'institution')
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name, 'ko'));
  return { program, staff };
}
