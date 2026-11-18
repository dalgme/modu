import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { assembleObservationBundle, originalProcessors } from './observation-bundle-build';
import type { ObservationBundleManifest } from './observation-redact-shared';

const enc = (s: string) => new TextEncoder().encode(s);

describe('assembleObservationBundle', () => {
  it('번호·순서대로 한 폴더에 넣고, 가리지 못한 파일은 이름과 목록으로 알린다', async () => {
    const manifest: ObservationBundleManifest = {
      order: 'mentor',
      mode: 'blind',
      groupName: 'B그룹',
      base: 'B그룹 관찰의견서(멘토별)',
      notes: [],
      items: [
        { mentorName: '가멘', menteeName: '하나', sourceName: 'a.pdf', kind: 'pdf', url: 'u1' },
        { mentorName: '가멘', menteeName: '둘', sourceName: 'b.hwpx', kind: 'hwp', url: 'u2' },
        { mentorName: '나멘', menteeName: '셋', sourceName: 'c.pdf', kind: 'pdf', url: 'u3' },
        { mentorName: '다멘', menteeName: '넷', sourceName: 'd.docx', kind: 'other', url: 'u4' },
        { mentorName: '라멘', menteeName: '다섯', sourceName: 'e.hwp', kind: 'hwp', url: 'bad' },
        { mentorName: '마멘', menteeName: '여섯', sourceName: 'f.pdf', kind: 'pdf', url: 'gone' },
      ],
    };
    const progress: number[] = [];
    const r = await assembleObservationBundle(
      manifest,
      async (url) => {
        if (url === 'gone') throw new Error('404');
        return enc(url);
      },
      {
        pdf: async (b) => ({ pdf: enc(`R:${new TextDecoder().decode(b)}`), status: new TextDecoder().decode(b) === 'u3' ? 'none' : 'full' }),
        hwp: async (b) => {
          if (new TextDecoder().decode(b) === 'bad') throw new Error('암호');
          return { pdf: enc('H'), status: 'partial' };
        },
      },
      (d) => progress.push(d),
    );
    const zip = await JSZip.loadAsync(await r.zip.generateAsync({ type: 'uint8array' }));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
    expect(names).toEqual([
      'B그룹 관찰의견서(멘토별)/001. 하나멘티 관찰의견서.pdf',
      'B그룹 관찰의견서(멘토별)/002. 둘멘티 관찰의견서 (블라인드 일부 확인 필요).pdf',
      'B그룹 관찰의견서(멘토별)/003. 셋멘티 관찰의견서 (블라인드 미적용).pdf',
      'B그룹 관찰의견서(멘토별)/004. 넷멘티 관찰의견서 (블라인드 미적용).docx',
      'B그룹 관찰의견서(멘토별)/005. 다섯멘티 관찰의견서 (블라인드 미적용).hwp',
    ]);
    expect(await zip.file(names[0]!)!.async('string')).toBe('R:u1');
    expect(r.counts).toEqual({ full: 1, partial: 1, none: 4 });
    expect(r.problems.map((p) => p.name.slice(0, 3))).toEqual(['002', '003', '004', '005', '006']);
    // 직접 가리기 — PDF 로 나온 파일만(일부·미적용), 다 가리면 표시 없는 이름으로
    expect(r.problems.map((p) => p.fix?.fixedName ?? null)).toEqual(['002. 둘멘티 관찰의견서.pdf', '003. 셋멘티 관찰의견서.pdf', null, null, null]);
    expect(new TextDecoder().decode(r.problems[1]!.fix!.pdf)).toBe('R:u3');
    expect(progress.at(-1)).toBe(6);
  });

  it('원본 묶음: PDF 는 받은 그대로, 한글은 PDF 로, 이름에 멘토·멘티', async () => {
    const manifest: ObservationBundleManifest = {
      order: 'mentee',
      mode: 'original',
      groupName: 'B그룹',
      base: 'B그룹 관찰의견서 원본(멘티별)',
      notes: [],
      items: [
        { mentorName: '가멘', menteeName: '하나', sourceName: 'a.pdf', kind: 'pdf', url: 'u1' },
        { mentorName: '나멘', menteeName: '둘', sourceName: 'b.hwp', kind: 'hwp', url: 'u2' },
        { mentorName: '다멘', menteeName: '셋', sourceName: 'c.hwpx', kind: 'hwp', url: 'bad' },
      ],
    };
    const r = await assembleObservationBundle(
      manifest,
      async (url) => enc(url),
      originalProcessors(async (b) => {
        if (new TextDecoder().decode(b) === 'bad') throw new Error('암호');
        return enc('PDF');
      }),
    );
    const zip = await JSZip.loadAsync(await r.zip.generateAsync({ type: 'uint8array' }));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
    expect(names).toEqual([
      'B그룹 관찰의견서 원본(멘티별)/001. 하나멘티-가멘멘토 관찰의견서.pdf',
      'B그룹 관찰의견서 원본(멘티별)/002. 둘멘티-나멘멘토 관찰의견서.pdf',
      'B그룹 관찰의견서 원본(멘티별)/003. 셋멘티-다멘멘토 관찰의견서 (PDF 변환 실패·원본).hwpx',
    ]);
    expect(await zip.file(names[0]!)!.async('string')).toBe('u1');
    expect(r.problems).toHaveLength(1);
  });
});
