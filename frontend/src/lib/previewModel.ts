import type { FitMode } from './fitPolicy';
import { A4_HEIGHT, A4_WIDTH, injectFitModeStyle } from './fitPolicy';
import { injectTypographyStyle } from './typographyPolicy';

export { A4_HEIGHT, A4_WIDTH };

const HEIGHT_REPORTER_SCRIPT = `<script>
  function reportHeight() {
    var h = document.body.getBoundingClientRect().height;
    window.parent.postMessage({ type: 'resume-height', height: h }, '*');
  }
  requestAnimationFrame(function() { requestAnimationFrame(reportHeight); });
  window.addEventListener('resize', reportHeight);
  if (document.fonts) document.fonts.ready.then(reportHeight);
</script>`;

export function buildPreviewSrcDoc(renderedHtml: string, fitMode: FitMode, smartOnePage = true): string {
  let html = buildPdfSrcDoc(renderedHtml, fitMode, smartOnePage);
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${HEIGHT_REPORTER_SCRIPT}</body>`);
  } else {
    html += HEIGHT_REPORTER_SCRIPT;
  }
  return html;
}

export function buildPdfSrcDoc(renderedHtml: string, fitMode: FitMode, smartOnePage = true): string {
  const htmlWithFit = smartOnePage ? injectFitModeStyle(renderedHtml, fitMode) : renderedHtml;
  return injectTypographyStyle(htmlWithFit);
}

export function contentOverflowPolicy(fitMode: FitMode): 'hidden' | 'visible' {
  return fitMode === 'overflow' ? 'visible' : 'hidden';
}
