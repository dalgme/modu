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
  nickname: string | null;
  external_no: string | null;
  mentee_type: string | null;
  preferred_mentor: string | null;
  note: string | null;
}

/** 멘티 프로필(매칭 키워드) — 운영사 케이스 상세 */
export function MenteeProfileForm({ caseId, value, tags }: { caseId: string; value: MenteeProfileValue | null; tags: TagOptions }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">멘티 정보 · 매칭 프로필</CardTitle>
        <p className="text-xs text-muted-foreground">명단 컬럼(닉네임·고유번호·권역·유형·희망분야·재배치 희망·비고)과 AI 매칭 입력입니다. 엑셀 일괄 등록 값이 채워져 있으면 그대로 두거나 보완하세요.</p>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          action={(fd) =>
            start(async () => {
              const r = await saveMenteeProfileAction(caseId, { industry: fd.get('industry'), stage: fd.get('stage'), region: fd.get('region'), preferred_mode: fd.get('preferred_mode'), needs: split(fd.get('needs')), keywords: split(fd.get('keywords')), summary: fd.get('summary'), nickname: fd.get('nickname'), external_no: fd.get('external_no'), mentee_type: fd.get('mentee_type'), preferred_mentor: fd.get('preferred_mentor'), note: fd.get('note') });
              toast(r.ok ? { title: '멘티 프로필을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
            })
          }
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="nickname">닉네임 (팀명·활동명)</Label>
            <Input id="nickname" name="nickname" defaultValue={value?.nickname ?? ''} />
            <p className="text-[11px] text-muted-foreground">&ldquo;이름/소속&rdquo; 표기에 사용</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="external_no">고유번호</Label>
            <Input id="external_no" name="external_no" defaultValue={value?.external_no ?? ''} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mentee_type">유형</Label>
            <Input id="mentee_type" name="mentee_type" defaultValue={value?.mentee_type ?? ''} placeholder="예) 예비창업 / 기창업" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="preferred_mentor">재배치 희망여부 (멘토 이름)</Label>
            <Input id="preferred_mentor" name="preferred_mentor" defaultValue={value?.preferred_mentor ?? ''} placeholder="비우면 희망 없음" />
          </div>
          <TagField name="industry" label="업종" defaultValue={value?.industry ? [value.industry] : []} options={tags.industry ?? []} hint="하나만" />
          <TagField name="stage" label="창업 단계" defaultValue={value?.stage ? [value.stage] : []} options={tags.stage ?? []} hint="하나만" />
          <TagField name="region" label="권역" defaultValue={value?.region ? [value.region] : []} options={tags.region ?? []} hint="하나만" />
          <div className="flex flex-col gap-1">
            <Label>선호 유형</Label>
            <select name="preferred_mode" defaultValue={value?.preferred_mode ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">무관</option>
              <option value="online">온라인</option>
              <option value="offline">오프라인</option>
            </select>
          </div>
          <TagField name="needs" label="희망분야 (콤마 구분, 최대 6개)" defaultValue={value?.needs ?? []} options={tags.need ?? []} />
          <TagField name="keywords" label="자유 키워드 (복수)" defaultValue={value?.keywords ?? []} options={tags.custom ?? []} />
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="summary">사업 소개·현황·고민 (모델 근거 재료, 연락처 등 개인정보 제외)</Label>
            <Textarea id="summary" name="summary" rows={3} defaultValue={value?.summary ?? ''} maxLength={2000} />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="note">비고 (운영사 메모)</Label>
            <Textarea id="note" name="note" rows={2} defaultValue={value?.note ?? ''} maxLength={1000} />
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
  mentor_institution: string | null;
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
          const r = await saveMentorProfileAction(programId, mentorId, { industries: split(fd.get('industries')), expertise: split(fd.get('expertise')), regions: split(fd.get('regions')), stages: split(fd.get('stages')), modes: fd.getAll('modes'), capacity: fd.get('capacity'), career: fd.get('career'), bio: fd.get('bio'), keywords: split(fd.get('keywords')), mentor_institution: fd.get('mentor_institution') });
          toast(r.ok ? { title: '프로필을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
        })
      }
    >
      <TagField name="expertise" label="분야 (콤마 구분, 최대 10개)" defaultValue={value?.expertise ?? []} options={tags.expertise?.length ? tags.expertise : (tags.need ?? [])} />
      <TagField name="industries" label="업종 (복수)" defaultValue={value?.industries ?? []} options={tags.industry ?? []} />
      <TagField name="regions" label="권역 (복수)" defaultValue={value?.regions ?? []} options={tags.region ?? []} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="mentor_institution">소속멘토기관</Label>
        <Input id="mentor_institution" name="mentor_institution" defaultValue={value?.mentor_institution ?? ''} />
      </div>
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
