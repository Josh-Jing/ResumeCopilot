export type InnerAlign = 'left' | 'center' | 'right';

export interface InnerColumn {
  widthPct: number | null;
  align: InnerAlign;
  body: string;
}

const WIDTH_RE = /^\[(\d+(?:\.\d+)?)%\]\s*/;

export function parseInnerLine(line: string): InnerColumn | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('-')) return null;

  let rest = trimmed.slice(1).trim();
  if (!rest) return { widthPct: null, align: 'center', body: '' };

  let widthPct: number | null = null;
  const widthMatch = rest.match(WIDTH_RE);
  if (widthMatch) {
    widthPct = parseFloat(widthMatch[1]);
    rest = rest.slice(widthMatch[0].length);
  }

  let align: InnerAlign = 'center';
  if (rest.startsWith('[[')) {
    align = 'left';
    rest = rest.slice(2).trimStart();
  } else if (rest.startsWith(']]')) {
    align = 'right';
    rest = rest.slice(2).trimStart();
  }

  return { widthPct, align, body: rest };
}

export function parseInnerBlock(source: string): InnerColumn[] {
  const columns: InnerColumn[] = [];
  for (const line of source.split('\n')) {
    const col = parseInnerLine(line);
    if (col) columns.push(col);
  }
  return columns;
}

export function resolveInnerColumnWidths(columns: InnerColumn[]): number[] {
  const fixed = columns.reduce((sum, col) => sum + (col.widthPct ?? 0), 0);
  const autoCount = columns.filter((col) => col.widthPct === null).length;
  const remainder = Math.max(0, 100 - fixed);
  const autoShare = autoCount > 0 ? remainder / autoCount : 0;
  return columns.map((col) => col.widthPct ?? autoShare);
}

const ALIGN_CLASS: Record<InnerAlign, string> = {
  left: 'inner-col--left',
  center: 'inner-col--center',
  right: 'inner-col--right',
};

export function renderInnerBlockHtml(
  source: string,
  renderMarkdown: (body: string) => string,
): string {
  const columns = parseInnerBlock(source);
  if (columns.length === 0) return '';

  const widths = resolveInnerColumnWidths(columns);
  const gridTemplate = widths.map((width) => `${width}fr`).join(' ');
  const colsHtml = columns.map((col) => {
    const alignClass = ALIGN_CLASS[col.align];
    const innerHtml = renderMarkdown(col.body);
    return `<div class="inner-col ${alignClass}">${innerHtml}</div>`;
  }).join('');

  return `<div class="inner-row" style="grid-template-columns: ${gridTemplate};">${colsHtml}</div>\n`;
}
