'use client';

import { useTransition } from 'react';

import { saveMenteeProfileAction, saveMentorProfileAction } from '@/lib/matching/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export type TagOptions = Record<string, string[]>; // category → labels

const split = (v: FormDataEntryValue | null) => String(v ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);

function TagField({ name, label, defaultValue, options, hint }: { name: string; label: string; defaultValue: string[]; options: string[]; hint?: string }) {
  const id = `dl-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue.join('; ')} list={id} placeholder="세미콜론(;)으로 구분" />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <p className="text-[11px] text-muted-foreground">{hint ?? (options.length ? `사전: ${options.slice(0, 8).join(', ')}${options.length > 8 ? ' …' : ''}` : '키워드 사전은 운영 설정에서 관리')}</p>
    </div>
  );
}

export interface MenteeProfileValue {
  industry: string | null;
  stage: string | null;
  region: string | null;
  preferred_mode: 'online' | 'offline' | null;
  needs: string[];
  keywords: string[];
  summary: string | null;
}

/** 멘티 프로필(매칭 키워드) — 운영사 케이스 상세 */
export function MenteeProfileForm({ caseId, value, tags }: { caseId: string; value: MenteeProfileValue | null; tags: TagOptions }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">멘티 프로필 (매칭 키워드)</CardTitle>
        <p className="text-xs text-muted-foreground">AI 매칭 추천의 입력입니다. 엑셀 일괄 등록 값이 채워져 있으면 그대로 두거나 보완하세요.</p>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          action={(fd) =>
            start(async () => {
              const r = await saveMenteeProfileAction(caseId, { industry: fd.get('industry'), stage: fd.get('stage'), region: fd.get('region'), preferred_mode: fd.get('preferred_mode'), needs: split(fd.get('needs')), keywords: split(fd.get('keywords')), summary: fd.get('summary') });
              toast(r.ok ? { title: '멘티 프로필을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
            })
          }
        >
          <TagField name="industry" label="업종" defaultValue={value?.industry ? [value.industry] : []} options={tags.industry ?? []} hint="하나만" />
          <TagField name="stage" label="창업 단계" defaultValue={value?.stage ? [value.stage] : []} options={tags.stage ?? []} hint="하나만" />
          <TagField name="region" label="지역" defaultValue={value?.region ? [value.region] : []} options={tags.region ?? []} hint="하나만" />
          <div className="flex flex-col gap-1">
            <Label>선호 유형</Label>
            <select name="preferred_mode" defaultValue={value?.preferred_mode ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">무관</option>
              <option value="online">온라인</option>
              <option value="offline">오프라인</option>
            </select>
          </div>
          <TagField name="needs" label="필요 분야 (복수)" defaultValue={value?.needs ?? []} options={tags.need ?? []} />
          <TagField name="keywords" label="자유 키워드 (복수)" defaultValue={value?.keywords ?? []} options={tags.custom ?? []} />
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="summary">사업 소개·현황·고민 (모델 근거 재료, 연락처 등 개인정보 제외)</Label>
            <Textarea id="summary" name="summary" rows={3} defaultValue={value?.summary ?? ''} maxLength={2000} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>저장</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export interface MentorProfileValue {
  industries: string[];
  expertise: string[];
  regions: string[];
  stages: string[];
  modes: ('online' | 'offline')[];
  capacity: number;
  career: string | null;
  bio: string | null;
  keywords: string[];
}

/** 멘토 프로필 — 멘토 본인(/mentor/profile) */
export function MentorProfileForm({ programId, mentorId, value, tags }: { programId: string; mentorId: string; value: MentorProfileValue | null; tags: TagOptions }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          const r = await saveMentorProfileAction(programId, mentorId, { industries: split(fd.get('industries')), expertise: split(fd.get('expertise')), regions: split(fd.get('regions')), stages: split(fd.get('stages')), modes: fd.getAll('modes'), capacity: fd.get('capacity'), career: fd.get('career'), bio: fd.get('bio'), keywords: split(fd.get('keywords')) });
          toast(r.ok ? { title: '프로필을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
        })
      }
    >
      <TagField name="expertise" label="전문 분야 (복수)" defaultValue={value?.expertise ?? []} options={tags.expertise?.length ? tags.expertise : (tags.need ?? [])} />
      <TagField name="industries" label="업종 (복수)" defaultValue={value?.industries ?? []} options={tags.industry ?? []} />
      <TagField name="regions" label="가능 지역 (복수)" defaultValue={value?.regions ?? []} options={tags.region ?? []} />
      <TagField name="stages" label="선호 창업 단계 (복수)" defaultValue={value?.stages ?? []} options={tags.stage ?? []} />
      <div className="flex flex-col gap-1">
        <Label>가능 유형</Label>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" name="modes" value="online" defaultChecked={value?.modes.includes('online') ?? true} /> 온라인</label>
          <label className="flex items-center gap-1"><input type="checkbox" name="modes" value="offline" defaultChecked={value?.modes.includes('offline') ?? true} /> 오프라인</label>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="capacity">동시 담당 가능 멘티 수</Label>
        <Input id="capacity" name="capacity" type="number" min={0} max={100} defaultValue={value?.capacity ?? 5} />
      </div>
      <TagField name="keywords" label="자유 키워드 (복수)" defaultValue={value?.keywords ?? []} options={tags.custom ?? []} />
      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label htmlFor="career">경력</Label>
        <Textarea id="career" name="career" rows={3} defaultValue={value?.career ?? ''} maxLength={2000} />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label htmlFor="bio">소개 (멘티에게 어떤 도움을 줄 수 있는지)</Label>
        <Textarea id="bio" name="bio" rows={3} defaultValue={value?.bio ?? ''} maxLength={2000} />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending}>저장</Button>
      </div>
    </form>
  );
}
