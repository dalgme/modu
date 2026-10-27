import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

import { assembleRoundPackage } from './round-package-build';
import { pairPdfName, paymentPdfName, type RoundPackageManifest } from './round-package-shared';

const PNG_1PX = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

async function pdfOf(pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage();
  return d.save();
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe('assembleRoundPackage', () => {
  it('멘토별: 20명씩 내부 ZIP, 지급서류·보고서 합본, 한글 파일은 원본 동봉', async () => {
    const files: Record<string, Uint8Array> = { r1: await pdfOf(2), r2: await pdfOf(3), obs: await pdfOf(1), pay: await pdfOf(1), img: PNG_1PX, hwp: new TextEncoder().encode('HWP') };
    const folders: RoundPackageManifest['folders'] = Array.from({ length: 21 }, (_, i) => ({ folder: `멘토${String(i + 1).padStart(2, '0')}`, docs: [] }));
    folders[0] = {
      folder: '강석우',
      docs: [
        { name: paymentPdfName('강석우'), parts: [{ label: '통장', sourceName: '통장.pdf', kind: 'pdf', url: 'pay' }, { label: '신분증', sourceName: '신분증.png', kind: 'png', url: 'img' }] },
        {
          name: pairPdfName('강석우', '남준현', true),
          parts: [
            { label: '1회차 보고서', sourceName: 'a.pdf', kind: 'pdf', url: 'r1' },
            { label: '2회차 보고서', sourceName: 'b.hwp', kind: 'other', url: 'hwp' },
            { label: '3회차 보고서', sourceName: 'c.pdf', kind: 'pdf', url: 'r2' },
            { label: '관찰의견서', sourceName: 'o.pdf', kind: 'pdf', url: 'obs' },
          ],
        },
      ],
    };
    const manifest: RoundPackageManifest = { kind: 'mentor', groupName: '2기', zipName: 'x.zip', folders, notes: [] };
    const r = await assembleRoundPackage(manifest, async (u) => files[u]!);
    const outer = await JSZip.loadAsync(await r.zip.generateAsync({ type: 'uint8array' }));
    const names = Object.keys(outer.files).filter((n) => !outer.files[n]!.dir);
    expect(names.sort()).toEqual([
      '멘토별 멘토링 보고서 및 수당지급 서류/(붙임2)멘토링 보고서 및 관찰의견서(1~20번).zip',
      '멘토별 멘토링 보고서 및 수당지급 서류/(붙임2)멘토링 보고서 및 관찰의견서(21~21번).zip',
    ]);
    const inner = await JSZip.loadAsync(await outer.file(names.sort()[0]!)!.async('uint8array'));
    const innerFiles = Object.keys(inner.files).filter((n) => !inner.files[n]!.dir);
    expect(innerFiles).toContain('강석우/1.수당지급서류 일체_강석우.pdf');
    expect(innerFiles).toContain('강석우/책임멘토 멘토링 보고서 및 관찰 의견서(강석우멘토-남준현멘티).pdf');
    expect(innerFiles).toContain('강석우/책임멘토 멘토링 보고서 및 관찰 의견서(강석우멘토-남준현멘티) - 2회차 보고서.hwp');
    expect(Object.keys(inner.files).filter((n) => inner.files[n]!.dir)).toHaveLength(20);
    expect(await pageCount(await inner.file('강석우/책임멘토 멘토링 보고서 및 관찰 의견서(강석우멘토-남준현멘티).pdf')!.async('uint8array'))).toBe(6);
    expect(await pageCount(await inner.file('강석우/1.수당지급서류 일체_강석우.pdf')!.async('uint8array'))).toBe(2);
    expect(r.pdfCount).toBe(2);
    expect(r.problems).toHaveLength(1);
  });

  it('멘티별: 번호 폴더(빈 폴더 포함), 받지 못한 파일은 문제 목록', async () => {
    const manifest: RoundPackageManifest = {
      kind: 'mentee',
      groupName: '2기',
      zipName: 'x.zip',
      folders: [
        { folder: '001. 남준현', docs: [{ name: pairPdfName('강석우', '남준현', false), parts: [{ label: '1회차 보고서', sourceName: 'a.pdf', kind: 'pdf', url: 'ok' }, { label: '2회차 보고서', sourceName: 'b.pdf', kind: 'pdf', url: 'missing' }] }] },
        { folder: '002. 양승성', docs: [] },
      ],
      notes: [],
    };
    const ok = await pdfOf(1);
    const r = await assembleRoundPackage(manifest, async (u) => {
      if (u !== 'ok') throw new Error('404');
      return ok;
    });
    const z = await JSZip.loadAsync(await r.zip.generateAsync({ type: 'uint8array' }));
    expect(z.files['001. 남준현/책임멘토 멘토링 보고서(강석우멘토-남준현멘티).pdf']).toBeTruthy();
    expect(z.files['002. 양승성/']?.dir).toBe(true);
    expect(r.problems).toEqual(['001. 남준현 / 책임멘토 멘토링 보고서(강석우멘토-남준현멘티).pdf — 2회차 보고서: 파일을 받지 못함']);
  });
});
