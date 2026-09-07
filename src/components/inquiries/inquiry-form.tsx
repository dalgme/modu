'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { submitInquiryAction } from '@/lib/workflow/inquiry-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = [
  { value: 'complaint', label: '불편 신고' },
  { value: 'feature', label: '기능 요청' },
  { value: 'guide', label: '가이드 문의' },
  { value: 'other', label: '기타' },
];

/** 멘티 문의 등록 폼 — 제출 시 넥스트랩 대시보드에 즉시 접수된다. */
export function InquiryForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState('complaint');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await submitInquiryAction({ category, subject, body });
    setSubmitting(false);
    if (result.ok) {
      toast({ title: '문의가 접수되었습니다.', description: '운영기관(넥스트랩)이 확인 후 답변드립니다.' });
      setSubject('');
      setBody('');
      setCategory('complaint');
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: '문의 접수 실패', description: result.error, variant: 'destructive' });
    }
  }

  if (!open) {
    return (
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        문의하기
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inq-category">문의 유형</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="inq-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inq-subject">제목</Label>
        <Input
          id="inq-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="문의 제목"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inq-body">내용</Label>
        <Textarea
          id="inq-body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="불편사항·요청·문의 내용을 자세히 적어 주세요."
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
          취소
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? '접수 중…' : '문의 접수'}
        </Button>
      </div>
    </form>
  );
}
