import 'server-only';

import * as XLSX from 'xlsx';
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import PptxGenJS from 'pptxgenjs';

import { htmlToPdf } from '@/lib/documents/render';
import { renderSummaryHtml, sections, type SummarySnapshot } from '@/lib/reports/summary';

export { SUMMARY_FORMATS, type SummaryFormat } from '@/lib/reports/summary-formats';
import { type SummaryFormat } from '@/lib/reports/summary-formats';

const sub = (s: SummarySnapshot) => `${s.programName}${s.groupName ? ` · ${s.groupName}` : ' · 행사 전체'} · 생성 ${new Date(s.generatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}`;

export async function exportSummary(s: SummarySnapshot, format: SummaryFormat): Promise<Buffer> {
  switch (format) {
    case 'html':
      return Buffer.from(renderSummaryHtml(s), 'utf8');
    case 'pdf':
      return htmlToPdf(renderSummaryHtml(s));
    case 'xlsx':
      return toXlsx(s);
    case 'docx':
      return toDocx(s);
    case 'pptx':
      return toPptx(s);
  }
}

function toXlsx(s: SummarySnapshot): Buffer {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  const cover: unknown[][] = [[s.title], [sub(s)], []];
  for (const sec of sections(s)) {
    cover.push([sec.title]);
    for (const [k, v] of sec.kv ?? []) cover.push([k, v]);
    for (const l of sec.lines ?? []) cover.push([l]);
    cover.push([]);
  }
  add('종합', cover);
  for (const sec of sections(s)) for (const t of sec.tables ?? []) add(t.title, [[t.title], t.header, ...t.rows]);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function toDocx(s: SummarySnapshot): Promise<Buffer> {
  const cell = (text: string | number, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(text), bold, size: 18 })] })] });
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: s.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: sub(s), color: '5B6472', size: 20 })] }),
  ];
  for (const sec of sections(s)) {
    children.push(new Paragraph({ text: sec.title, heading: HeadingLevel.HEADING_1 }));
    if (sec.kv) children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: sec.kv.map(([k, v]) => new TableRow({ children: [cell(k, true), cell(v)] })) }));
    for (const l of sec.lines ?? []) children.push(new Paragraph({ text: l, bullet: { level: 0 } }));
    for (const t of sec.tables ?? []) {
      children.push(new Paragraph({ text: t.title, heading: HeadingLevel.HEADING_2 }));
      if (t.rows.length === 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: '해당 없음', color: '8A93A0' })] }));
        continue;
      }
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: t.header.map((h) => cell(h, true)) }), ...t.rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))] }));
    }
  }
  children.push(new Paragraph({ children: [new TextRun({ text: '이 리포트는 생성 시점의 데이터를 고정한 스냅샷입니다.', color: '8A93A0', size: 16 })], alignment: AlignmentType.LEFT }));
  const doc = new Document({ creator: s.operatorName || 'platform', title: s.title, sections: [{ children }] });
  return Packer.toBuffer(doc);
}

async function toPptx(s: SummarySnapshot): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const NAVY = '103355';
  const TEAL = '2AD1BF';
  const title = pptx.addSlide();
  title.background = { color: NAVY };
  title.addText('MENTORING OPERATIONS', { x: 0.6, y: 0.5, w: 8, h: 0.4, fontSize: 12, color: TEAL, bold: true, charSpacing: 4 });
  title.addText(s.title, { x: 0.6, y: 2.2, w: 12, h: 1.2, fontSize: 30, color: 'FFFFFF', bold: true });
  title.addText(sub(s), { x: 0.6, y: 3.5, w: 12, h: 0.5, fontSize: 14, color: 'CBD5E1' });
  title.addText(`${s.clientName} · ${s.operatorName}`, { x: 0.6, y: 6.6, w: 12, h: 0.4, fontSize: 11, color: 'CBD5E1' });

  const slideHead = (sl: PptxGenJS.Slide, t: string) => {
    sl.addText(t, { x: 0.5, y: 0.35, w: 12, h: 0.6, fontSize: 22, bold: true, color: NAVY });
    sl.addShape(pptx.ShapeType.line, { x: 0.5, y: 0.95, w: 12.3, h: 0, line: { color: TEAL, width: 2 } });
  };
  for (const sec of sections(s)) {
    if (sec.kv || sec.lines) {
      const sl = pptx.addSlide();
      slideHead(sl, sec.title);
      if (sec.kv) {
        sl.addTable(
          sec.kv.map(([k, v]) => [{ text: k, options: { bold: true, fill: { color: 'F3F5F8' } } }, { text: v }]),
          { x: 0.5, y: 1.2, w: 12.3, colW: [3.5, 8.8], fontSize: 12, border: { type: 'solid', color: 'D9DDE3', pt: 0.5 }, autoPage: true },
        );
      }
      if (sec.lines) {
        sl.addText(
          sec.lines.map((l) => ({ text: l, options: { bullet: true, breakLine: true } })),
          { x: 0.5, y: 1.2, w: 12.3, h: 5.5, fontSize: 13, color: '1F2430', valign: 'top', paraSpaceAfter: 6 },
        );
      }
    }
    for (const t of sec.tables ?? []) {
      const sl = pptx.addSlide();
      slideHead(sl, `${sec.title} — ${t.title}`);
      if (t.rows.length === 0) {
        sl.addText('해당 없음', { x: 0.5, y: 1.2, w: 12, h: 0.5, fontSize: 12, color: '8A93A0' });
        continue;
      }
      sl.addTable(
        [t.header.map((h) => ({ text: h, options: { bold: true, fill: { color: 'F3F5F8' }, color: NAVY } })), ...t.rows.map((r) => r.map((c) => ({ text: String(c) })))],
        { x: 0.5, y: 1.2, w: 12.3, fontSize: 10.5, border: { type: 'solid', color: 'D9DDE3', pt: 0.5 }, autoPage: true, autoPageRepeatHeader: true },
      );
    }
  }
  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer | Uint8Array;
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
