import { buildPreviewSrcDoc, contentOverflowPolicy } from './previewModel.ts';

function assertTrue(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function testBuildPreviewSrcDocInjectsFitModeStyle() {
  const html = '<!doctype html><html><head></head><body><main></main></body></html>';
  const srcDoc = buildPreviewSrcDoc(html, 'compact');
  assertTrue(srcDoc.includes('data-fit-mode="compact"'), 'compact style is injected');
  assertTrue(srcDoc.includes('--fit-rhythm-scale'), 'compact rhythm scale variable is present');
  assertTrue(srcDoc.includes('--fit-line-scale'), 'compact line scale variable is present');
}

function testBuildPreviewSrcDocAddsHeightReporter() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const srcDoc = buildPreviewSrcDoc(html, 'natural');
  assertTrue(srcDoc.includes('resume-height'), 'height reporter posts resume-height messages');
  assertTrue(srcDoc.includes('document.body.getBoundingClientRect().height'), 'height reporter measures actual body height, not viewport-clamped scrollHeight');
}

function testOverflowPolicyClipsAutoFittedModes() {
  assertEqual(contentOverflowPolicy('natural'), 'hidden', 'natural clips to one A4 page');
  assertEqual(contentOverflowPolicy('expand'), 'hidden', 'expand clips to one A4 page');
  assertEqual(contentOverflowPolicy('compact'), 'hidden', 'compact clips to one A4 page');
}

function testOverflowPolicyLetsHugeContentOverflow() {
  assertEqual(contentOverflowPolicy('overflow'), 'visible', 'overflow mode does not crop content');
}

const tests = [
  testBuildPreviewSrcDocInjectsFitModeStyle,
  testBuildPreviewSrcDocAddsHeightReporter,
  testOverflowPolicyClipsAutoFittedModes,
  testOverflowPolicyLetsHugeContentOverflow,
];

for (const t of tests) t();
console.log(`previewModel tests passed: ${tests.length}`);
