const TYPOGRAPHY_STYLE_ID = 'resume-copilot-typography-css';

/** Body copy justification for section content; inner columns are excluded via direct-child selectors. */
export const TYPOGRAPHY_CSS = `<style id="${TYPOGRAPHY_STYLE_ID}">
.resume-section-content > p,
.resume-section-content > ul > li,
.resume-section-content > ol > li {
  text-align: justify;
  text-justify: inter-ideograph;
}
</style>`;

export function injectTypographyStyle(html: string): string {
  if (html.includes(TYPOGRAPHY_STYLE_ID)) return html;
  if (html.includes('</head>')) return html.replace('</head>', `${TYPOGRAPHY_CSS}</head>`);
  return `${TYPOGRAPHY_CSS}${html}`;
}
