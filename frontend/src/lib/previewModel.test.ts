import { buildPreviewSrcDoc } from './previewModel.ts';

function assertTrue(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function testBuildPreviewSrcDocInjectsTypographyStyle() {
  const html = '<!doctype html><html><head></head><body><main></main></body></html>';
  const srcDoc = buildPreviewSrcDoc(html);
  assertTrue(srcDoc.includes('resume-copilot-typography-css'), 'typography style is injected');
  assertTrue(srcDoc.includes('text-justify: inter-ideograph'), 'CJK justify hint is present');
}

function testBuildPreviewSrcDocAddsHeightReporter() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const srcDoc = buildPreviewSrcDoc(html);
  assertTrue(srcDoc.includes('resume-height'), 'height reporter posts resume-height messages');
  assertTrue(
    srcDoc.includes('document.body.getBoundingClientRect().height'),
    'height reporter measures actual body height',
  );
}

const tests = [
  testBuildPreviewSrcDocInjectsTypographyStyle,
  testBuildPreviewSrcDocAddsHeightReporter,
];

for (const t of tests) t();
console.log(`previewModel tests passed: ${tests.length}`);
