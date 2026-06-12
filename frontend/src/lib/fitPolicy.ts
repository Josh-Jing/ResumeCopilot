export type FitMode = 'natural' | 'expand' | 'compact' | 'overflow';

export interface FitResult {
  mode: FitMode;
  ratio: number;
  overflow: boolean;
}

export const A4_HEIGHT = 1123;
export const A4_WIDTH = 794;
export const FILL_THRESHOLD = 0.75;
export const MAX_AUTO_FIT_RATIO = 1.3;

export function computeFitMode(naturalHeight: number): FitResult {
  const ratio = naturalHeight / A4_HEIGHT;

  if (ratio < FILL_THRESHOLD) return { mode: 'natural', ratio, overflow: false };
  if (ratio < 1.0) return { mode: 'expand', ratio, overflow: false };
  if (ratio === 1.0) return { mode: 'natural', ratio, overflow: false };
  if (ratio <= MAX_AUTO_FIT_RATIO) return { mode: 'compact', ratio, overflow: false };
  return { mode: 'overflow', ratio, overflow: true };
}

export function fitModeStyle(mode: FitMode): string {
  if (mode === 'expand') {
    return `<style data-fit-mode="expand">
html { --fit-rhythm-scale: 1.06; --fit-line-scale: 1.03; }
</style>`;
  }

  if (mode === 'compact') {
    return `<style data-fit-mode="compact">
html { --fit-rhythm-scale: 0.65; --fit-line-scale: 0.88; --fit-font-scale: 0.94; }
</style>`;
  }

  if (mode === 'overflow') {
    return `<style data-fit-mode="overflow">
html { /* no adjustments */ }
</style>`;
  }

  return '';
}

export function injectFitModeStyle(html: string, mode: FitMode): string {
  const style = fitModeStyle(mode);
  if (!style) return html;
  if (html.includes('</head>')) return html.replace('</head>', `${style}</head>`);
  return `${style}${html}`;
}
