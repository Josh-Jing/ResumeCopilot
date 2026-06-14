import { injectTypographyStyle, TYPOGRAPHY_CSS } from './typographyPolicy.ts';

function assertTrue(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function testInjectTypographyStyle() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const out = injectTypographyStyle(html);
  assertTrue(out.includes('resume-copilot-typography-css'), 'typography style id is present');
  assertTrue(out.includes('text-align: justify'), 'justify rule is injected');
  assertTrue(out.includes('text-justify: inter-ideograph'), 'CJK justify hint is injected');
  assertTrue(out.includes('.resume-section-content > p'), 'direct-child p selector excludes inner cols');
}

function testInjectTypographyStyleIsIdempotent() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const once = injectTypographyStyle(html);
  const twice = injectTypographyStyle(once);
  assertTrue(
    twice.split(TYPOGRAPHY_CSS).length - 1 === 1,
    'typography CSS is injected only once',
  );
}

const tests = [testInjectTypographyStyle, testInjectTypographyStyleIsIdempotent];

for (const t of tests) t();
console.log(`typographyPolicy tests passed: ${tests.length}`);
