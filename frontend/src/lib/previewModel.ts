import type { FitMode } from './fitPolicy';
import { injectFitModeStyle } from './fitPolicy';

const HEIGHT_REPORTER_SCRIPT = `<script>
  function reportHeight() {
    var h = document.body.getBoundingClientRect().height;
    window.parent.postMessage({ type: 'resume-height', height: h }, '*');
  }
  requestAnimationFrame(function() { requestAnimationFrame(reportHeight); });
  window.addEventListener('resize', reportHeight);
  if (document.fonts) document.fonts.ready.then(reportHeight);
</script>`;

export function buildPreviewSrcDoc(renderedHtml: string, fitMode: FitMode): string {
  let html = injectFitModeStyle(renderedHtml, fitMode);
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${HEIGHT_REPORTER_SCRIPT}</body>`);
  } else {
    html += HEIGHT_REPORTER_SCRIPT;
  }
  return html;
}

export function contentOverflowPolicy(fitMode: FitMode): 'hidden' | 'visible' {
  return fitMode === 'overflow' ? 'visible' : 'hidden';
}
