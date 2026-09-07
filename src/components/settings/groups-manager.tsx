'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import type { GroupWithDocs } from '@/lib/settings/data';
import { deleteGroupDocAction, upsertGroupAction, upsertGroupDocAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type Policy = { mentee_confirm_signature?: boolean; mentor_auto_sign?: boolean } | null;

/** 사업그룹 관리 — 그룹 추가·수정 + 그룹별 필수서류 슬롯 + 그룹 원천징수/서명 정책 override */
export function GroupsManager({ groups, reportSignAvailable }: { groups: GroupWithDocs[]; reportSignAvailable: Record<string, boolean> }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const submitGroup = (fd: FormData) =>
    start(async () => {
      const r = await upsertGroupAction(Object.fromEntries(fd.entries()));
      toast(r.ok ? { title: '그룹을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) setEditing(null);
    });

  const submitDoc = (fd: FormData) =>
    start(async () => {
      const r = await upsertGroupDocAction(Object.fromEntries(fd.entries()));
      toast(r.ok ? { title: '필수서류를 저장했습니다.' } : { title: r.error, variant: 'destructive' });
    });

  const form = (g?: GroupWithDocs) => {
    const policy = (g?.round_report_policy ?? null) as Policy;
    const canSign = g ? (reportSignAvailable[g.id] ?? true) : true;
    return (
      <form action={submitGroup} className="grid gap-3 rounded-lg border border-primary/30 bg-muted/20 p-3 sm:grid-cols-3">
        {g && <input type="hidden" name="id" value={g.id} />}
        <Field label="코드 *" name="code" defaultValue={g?.code ?? ''} placeholder="A" />
        <Field label="그룹명 *" name="name" defaultValue={g?.name ?? ''} placeholder="1기 2라운드" />
        <Field label="회차 수 *" name="required_rounds" type="number" defaultValue={String(g?.required_rounds ?? 4)} />
        <Field label="회차 명칭" name="round_label" defaultValue={g?.round_label ?? '컨설팅'} />
        <Field label="시작일" name="starts_on" type="date" defaultValue={g?.starts_on ?? ''} />
        <Field label="종료일" name="ends_on" type="date" defaultValue={g?.ends_on ?? ''} />
        <div className="flex flex-col gap-1">
          <Label>승계 원천 그룹</Label>
          <select name="predecessor_support_type_id" defaultValue={g?.predecessor_support_type_id ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">없음</option>
            {groups.filter((x) => x.id !== g?.id).map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} · {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>상태</Label>
          <select name="status" defaultValue={g?.status ?? 'active'} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="active">진행 중</option>
            <option value="ended">종료</option>
          </select>
        </div>
        <Field label="정렬" name="sort_order" type="number" defaultValue={String(g?.sort_order ?? 0)} />
        <div className="flex flex-col gap-1">
          <Label>그룹 원천징수 방식 (일괄)</Label>
          <select name="withholding_method" defaultValue={g?.withholding_method ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">행사 기본 따름</option>
            <option value="other_income">기타소득</option>
            <option value="business_income">사업소득</option>
            <option value="none">원천징수 없음</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label>보고서 서명 정책 (그룹 override)</Label>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="report_policy_mode" value="inherit" defaultChecked={!policy} /> 행사 기본 따름
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="report_policy_mode" value="custom" defaultChecked={!!policy} /> 그룹 지정:
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" name="mentee_confirm_signature" value="true" defaultChecked={policy?.mentee_confirm_signature ?? true} disabled={!canSign} /> 알림 발송 후 멘티 확인 서명
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" name="mentor_auto_sign" value="true" defaultChecked={policy?.mentor_auto_sign ?? false} disabled={!canSign} /> 보고서 저장 시 멘토 서명 자동
            </label>
          </div>
          {!canSign && <p className="text-[11px] text-destructive">이 그룹에 적용되는 보고서 양식에 멘토 서명 컬럼이 없어 서명 정책을 켤 수 없습니다.</p>}
        </div>
        <Field label="설명" name="description" defaultValue={g?.description ?? ''} />
        <div className="sm:col-span-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={pending}>
            취소
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {g ? '수정 저장' : '그룹 추가'}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1" onClick={() => setEditing(editing === 'new' ? null : 'new')} disabled={pending}>
          <Plus className="h-4 w-4" /> 그룹 추가
        </Button>
      </div>
      {editing === 'new' && form()}
      {groups.map((g) => (
        <section key={g.id} className="rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">{g.code}</span>
                {g.name}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${g.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{g.status === 'active' ? '진행 중' : '종료'}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {g.round_label} {g.required_rounds}회 · 케이스 {g.caseCount}건 · 원천징수 {g.withholding_method ?? '행사 기본'} · 서명 정책 {g.round_report_policy ? '그룹 지정' : '행사 기본'}
                {g.predecessor_support_type_id && ` · 승계 원천: ${groups.find((x) => x.id === g.predecessor_support_type_id)?.name ?? '-'}`}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(editing === g.id ? null : g.id)} disabled={pending}>
              {editing === g.id ? '닫기' : '수정'}
            </Button>
          </div>
          {editing === g.id && <div className="mt-3">{form(g)}</div>}

          <div className="mt-3 rounded-lg border p-3">
            <p className="text-sm font-semibold">필수서류 슬롯 ({g.docs.length})</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {g.docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{d.doc_name}</b> <span className="text-xs text-muted-foreground">키 {d.doc_key} · {d.is_required ? '필수' : '선택'} · {d.multiple ? '복수' : '단일본'} · 제출 {d.for_role}</span>
                    {d.condition && <span className="ml-1 text-xs text-muted-foreground">({d.condition})</span>}
                  </span>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (!confirm('이 서류 슬롯을 삭제할까요? 이미 올라온 파일은 유지됩니다.')) return; start(async () => { const r = await deleteGroupDocAction(d.id); toast(r.ok ? { title: '삭제했습니다.' } : { title: r.error, variant: 'destructive' }); }); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <form action={submitDoc} className="mt-2 grid gap-2 sm:grid-cols-6">
              <input type="hidden" name="support_type_id" value={g.id} />
              <Input name="doc_key" placeholder="키 (예: biz_plan)" required className="sm:col-span-1" />
              <Input name="doc_name" placeholder="서류 이름 (예: 사업계획서)" required className="sm:col-span-2" />
              <select name="for_role" defaultValue="mentee" className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="mentee">멘티 제출</option>
                <option value="mentor">멘토 제출</option>
                <option value="staff">운영사 제출</option>
              </select>
              <div className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" name="is_required" value="true" defaultChecked /> 필수</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="multiple" value="true" /> 복수</label>
              </div>
              <Button type="submit" size="sm" disabled={pending}>
                슬롯 추가
              </Button>
              <Input name="condition" placeholder="조건 설명 (선택)" className="sm:col-span-6" />
            </form>
          </div>
        </section>
      ))}
    </div>
  );
}

function Field({ label, name, defaultValue, type = 'text', placeholder }: { label: string; name: string; defaultValue: string; type?: string; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
