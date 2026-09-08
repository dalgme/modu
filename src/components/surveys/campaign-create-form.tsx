'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { createCampaignAction } from '@/lib/surveys/campaign-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export interface TemplateOpt { id: string; name: string; groupName: string | null }
export interface GroupOpt { id: string; name: string }
export interface MemberOpt { id: string; name: string; role: string; phone: string | null; groupNames: string[] }

/** 조사 개설 — 양식 · 기간 · 대상(행사 전체 역할 / 그룹 / 개별 선택) */
export function CampaignCreateForm({ templates, groups, members }: { templates: TemplateOpt[]; groups: GroupOpt[]; members: MemberOpt[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<'role' | 'users'>('role');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const shown = members.filter((m) => !filter.trim() || m.name.includes(filter.trim()) || m.groupNames.some((g) => g.includes(filter.trim())));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">조사 개설</CardTitle>
        <CardDescription>
          만족도·사전선호도·중간 점검 등 어떤 조사든 양식을 골라 개설합니다. 대상자는 개설 시점에 확정(스냅샷)되어, 문자 링크로만 응답해도 미참여자를 파악할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          action={(fd) =>
            start(async () => {
              const r = await createCampaignAction({
                templateId: fd.get('templateId'),
                title: fd.get('title'),
                description: fd.get('description'),
                startsAt: fd.get('startsAt'),
                endsAt: fd.get('endsAt'),
                audienceKind: kind,
                roles: fd.getAll('roles'),
                groupId: fd.get('groupId'),
                userIds: Array.from(picked),
              });
              if (!r.ok) {
                toast({ title: r.error, variant: 'destructive' });
                return;
              }
              toast({ title: `조사를 개설했습니다 (대상 ${r.targets}명). 상세 화면에서 초대 문자를 발송하세요.` });
              router.push(`/nextlab/surveys/${r.id}`);
            })
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="c-title">조사 이름 *</Label>
              <Input id="c-title" name="title" required placeholder="예: 사전선호도 조사, 중간 만족도 조사" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="c-template">조사 양식 *</Label>
              <select id="c-template" name="templateId" required className="h-10 rounded-md border border-input bg-background px-3 text-sm" defaultValue="">
                <option value="" disabled>양식 선택 (운영 설정 → 만족도 양식에서 관리)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.groupName ? ` (${t.groupName})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="c-desc">안내 문구</Label>
              <Input id="c-desc" name="description" placeholder="응답 페이지 상단에 표시" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="c-starts">시작 일시</Label>
              <Input id="c-starts" name="startsAt" type="datetime-local" />
              <p className="text-[11px] text-muted-foreground">비우면 즉시 시작</p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="c-ends">마감 일시</Label>
              <Input id="c-ends" name="endsAt" type="datetime-local" />
              <p className="text-[11px] text-muted-foreground">비우면 수동 종료까지</p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">대상</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'role'} onChange={() => setKind('role')} /> 역할·그룹으로 지정</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={kind === 'users'} onChange={() => setKind('users')} /> 개별 구성원 선택</label>
            </div>
            {kind === 'role' ? (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5"><input type="checkbox" name="roles" value="mentee" defaultChecked /> 멘티</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="roles" value="mentor" /> 멘토</label>
                <select name="groupId" className="h-9 rounded-md border border-input bg-background px-2 text-sm" defaultValue="">
                  <option value="">행사 전체</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} 만</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="이름·그룹으로 검색" className="h-9 max-w-xs" />
                <div className="max-h-56 overflow-auto rounded-md border">
                  {shown.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0 hover:bg-accent/50">
                      <input type="checkbox" checked={picked.has(m.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} />
                      <b>{m.name}</b>
                      <span className="text-xs text-muted-foreground">{m.role === 'mentee' ? '멘티' : m.role === 'mentor' ? '멘토' : m.role}{m.groupNames.length ? ` · ${m.groupNames.join(', ')}` : ''}{!m.phone ? ' · 휴대폰 없음(문자 불가)' : ''}</span>
                    </label>
                  ))}
                  {shown.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">검색 결과가 없습니다.</p>}
                </div>
                <p className="text-xs text-muted-foreground">선택 {picked.size}명</p>
              </div>
            )}
          </fieldset>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>{pending ? '개설 중…' : '조사 개설'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
