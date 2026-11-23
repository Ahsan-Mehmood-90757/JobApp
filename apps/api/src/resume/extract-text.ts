import mammoth from 'mammoth';
import { getDocumentProxy } from 'unpdf';

export type ResumeFileKind = 'pdf' | 'docx';

export function detectKind(filename: string, mimetype: string, head: Buffer): ResumeFileKind | null {
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  // DOCX is a zip ("PK\x03\x04"); trust the name/mime to tell it apart from other zips.
  if (head[0] === 0x50 && head[1] === 0x4b && (/\.docx$/i.test(filename) || mimetype.includes('wordprocessingml'))) return 'docx';
  return null;
}

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rebuild reading-order lines from glyph positions. pdf.js returns text in drawing order, which
 * puts right-aligned dates and sidebars in the wrong place; grouping by baseline fixes that.
 * Large horizontal gaps inside a line (e.g. "Title — Company ........ Jan 2020 – Present")
 * become " | " so the parser sees them as separate fields.
 */
export function linesFromItems(items: Item[]): string[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    const tol = Math.max(2, (it.height || 10) * 0.4);
    if (row && Math.abs(row[0]!.y - it.y) <= tol) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let end = -Infinity;
    for (const it of row) {
      const gap = it.x - end;
      const fontSize = it.height || 10;
      if (line) {
        if (gap > fontSize * 2.5) line += ' | ';
        else if (gap > fontSize * 0.15 && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' ';
      }
      line += it.str;
      end = it.x + it.width;
    }
    return line.trim();
  });
}

async function pdfText(data: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const raw of content.items) {
        if (!('str' in raw)) continue;
        items.push({ str: raw.str, x: raw.transform[4] as number, y: raw.transform[5] as number, width: raw.width, height: raw.height });
      }
      pages.push(linesFromItems(items).join('\n'));
    }
    return pages.join('\n');
  } finally {
    await pdf.cleanup();
  }
}

export async function extractText(kind: ResumeFileKind, data: Buffer): Promise<string> {
  if (kind === 'pdf') return pdfText(data);
  const res = await mammoth.extractRawText({ buffer: data });
  return res.value;
}
