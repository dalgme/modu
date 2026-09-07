'use client';

import { useState, useTransition } from 'react';
import { Eye, Plus, Trash2 } from 'lucide-react';

import type { ReportTemplateRow } from '@/lib/settings/data';
import { deleteReportTemplateAction, saveReportTemplateAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/**
 * 컨설팅 보고서 양식 — 행사 공통(그룹 없음) 1건 + 그룹별 override. HTML + 플레이스홀더.
 * previews 는 서버에서 예시 데이터로 치환한 HTML(iframe srcDoc).
 */
export function ReportTemplatesManager({
  templates,
  groups,
  placeholders,
  defaultHtml,
  previews,
}: {
  templates: ReportTemplateRow[];
  groups: { id: string; name: string }[];
  placeholders: { key: string; label: string; raw?: boolean }[];
  defaultHtml: string;
  previews: Record<string, string>;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [html, setHtml] = useState('');

  const hasSign = (h: string, who: 'mentor' | 'mentee') => new RegExp(`\\{\\{\\{?\\s*sign_${who}\\s*\\}?\\}\\}`).test(h);

  const submit = (fd: FormData) =>
    start(async () => {
      const r = await saveReportTemplateAction(Object.fromEntries(fd.entries()));
      toast(r.ok ? { title: '양식을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) setEditing(null);
    });

  const form = (t?: ReportTemplateRow) => (
    <form action={submit} className="grid gap-3 rounded-lg border border-primary/30 bg-muted/20 p-3">
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label>적용 범위</Label>
          <select name="support_type_id" defaultValue={t?.support_type_id ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm" disabled={!!t}>
            <option value="">행사 공통</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                그룹: {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>양식 이름</Label>
          <Input name="name" defaultValue={t?.name ?? '컨설팅 보고서'} required />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="is_active" value="true" defaultChecked={t?.is_active ?? true} /> 활성
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <Label>양식 HTML</Label>
        <Textarea name="html_content" rows={18} defaultValue={t?.html_content ?? defaultHtml} className="font-mono text-xs" onChange={(e) => setHtml(e.target.value)} required />
        <p className="text-[11px] text-muted-foreground">
          {hasSign(html || t?.html_content || defaultHtml, 'mentor') ? '✔ 멘토 서명 컬럼 포함 — 서명 정책 사용 가능' : '✖ 멘토 서명 컬럼({{{sign_mentor}}}) 없음 — 서명 정책을 켤 수 없습니다'} ·{' '}
          {hasSign(html || t?.html_content || defaultHtml, 'mentee') ? '✔ 멘티 서명 컬럼 포함' : '멘티 서명 컬럼({{{sign_mentee}}}) 없음'}
        </p>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold">사용 가능한 플레이스홀더</summary>
        <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
          {placeholders.map((p) => (
            <li key={p.key}>
              <code>{p.raw ? `{{{${p.key}}}}` : `{{${p.key}}}`}</code> — {p.label}
            </li>
          ))}
        </ul>
      </details>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={pending}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          저장
        </Button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">해석 순서: 그룹 양식 → 행사 공통 양식 → 내장 기본 양식. 웹으로 작성한 회차는 저장·수정·멘티 서명 때 이 양식으로 PDF 가 다시 만들어집니다.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setPreview(preview === '__default__' ? null : '__default__')}>
            <Eye className="h-4 w-4" /> 기본 양식 미리보기
          </Button>
          <Button size="sm" className="gap-1" onClick={() => setEditing(editing === 'new' ? null : 'new')} disabled={pending}>
            <Plus className="h-4 w-4" /> 양식 등록
          </Button>
        </div>
      </div>
      {preview === '__default__' && previews.__default__ && <iframe title="기본 양식" srcDoc={previews.__default__} className="h-[520px] w-full rounded-lg border bg-white" />}
      {editing === 'new' && form()}
      {templates.length === 0 && <p className="text-sm text-muted-foreground">등록된 양식이 없어 내장 기본 양식(멘토·멘티 서명 컬럼 포함)을 사용합니다.</p>}
      {templates.map((t) => (
        <section key={t.id} className="rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <b>{t.name}</b> · {t.support_type_id ? `그룹: ${groups.find((g) => g.id === t.support_type_id)?.name ?? '?'}` : '행사 공통'} ·{' '}
              <span className={t.is_active ? 'text-emerald-700' : 'text-muted-foreground'}>{t.is_active ? '활성' : '비활성'}</span> ·{' '}
              {hasSign(t.html_content, 'mentor') ? '멘토 서명 컬럼 ✔' : <span className="text-destructive">멘토 서명 컬럼 없음</span>}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setPreview(preview === t.id ? null : t.id)}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(editing === t.id ? null : t.id); setHtml(''); }} disabled={pending}>
                {editing === t.id ? '닫기' : '수정'}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (!confirm('양식을 삭제할까요? 이미 생성된 PDF 는 유지됩니다.')) return; start(async () => { const r = await deleteReportTemplateAction(t.id); toast(r.ok ? { title: '삭제했습니다.' } : { title: r.error, variant: 'destructive' }); }); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {preview === t.id && previews[t.id] && <iframe title={t.name} srcDoc={previews[t.id]} className="mt-3 h-[520px] w-full rounded-lg border bg-white" />}
          {editing === t.id && <div className="mt-3">{form(t)}</div>}
        </section>
      ))}
    </div>
  );
}
