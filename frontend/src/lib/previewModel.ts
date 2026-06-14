import { injectTypographyStyle } from './typographyPolicy';

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

const HEIGHT_REPORTER_SCRIPT = `<script>
  function reportHeight() {
    var h = document.body.getBoundingClientRect().height;
    window.parent.postMessage({ type: 'resume-height', height: h }, '*');
  }
  requestAnimationFrame(function() { requestAnimationFrame(reportHeight); });
  window.addEventListener('resize', reportHeight);
  if (document.fonts) document.fonts.ready.then(reportHeight);
</script>`;

export function buildPreviewSrcDoc(renderedHtml: string): string {
  let html = injectTypographyStyle(renderedHtml);
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${HEIGHT_REPORTER_SCRIPT}</body>`);
  } else {
    html += HEIGHT_REPORTER_SCRIPT;
  }
  return html;
}
