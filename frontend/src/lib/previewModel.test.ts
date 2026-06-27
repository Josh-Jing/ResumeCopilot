import { buildPdfSrcDoc, buildPreviewSrcDoc, contentOverflowPolicy } from './previewModel.ts';

function assertTrue(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function testBuildPreviewSrcDocInjectsTypographyStyle() {
  const html = '<!doctype html><html><head></head><body><main></main></body></html>';
  const srcDoc = buildPreviewSrcDoc(html, 'natural');
  assertTrue(srcDoc.includes('resume-copilot-typography-css'), 'typography style is injected');
  assertTrue(srcDoc.includes('text-justify: inter-ideograph'), 'CJK justify hint is present');
}

function testBuildPreviewSrcDocInjectsFitModeStyle() {
  const html = '<!doctype html><html><head></head><body><main></main></body></html>';
  const srcDoc = buildPreviewSrcDoc(html, 'compact');
  assertTrue(srcDoc.includes('data-fit-mode="compact"'), 'compact fit style is injected');
  assertTrue(srcDoc.includes('--fit-rhythm-scale'), 'compact rhythm scale variable is present');
}

function testBuildPreviewSrcDocAddsHeightReporter() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const srcDoc = buildPreviewSrcDoc(html, 'natural');
  assertTrue(srcDoc.includes('resume-height'), 'height reporter posts resume-height messages');
  assertTrue(
    srcDoc.includes('document.body.getBoundingClientRect().height'),
    'height reporter measures actual body height',
  );
}

function testBuildPreviewSrcDocMarksSmartOnePageDisabled() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const srcDoc = buildPreviewSrcDoc(html, 'natural', false);
  assertTrue(!srcDoc.includes('data-fit-mode='), 'disabled smart one-page does not inject fit CSS');
}

function testBuildPdfSrcDocInheritsPreviewRenderingWithoutHeightReporter() {
  const html = '<!doctype html><html><head></head><body><main>preview rendered</main></body></html>';
  const pdfDoc = buildPdfSrcDoc(html, 'compact', true);
  assertTrue(pdfDoc.includes('<main>preview rendered</main>'), 'pdf doc keeps preview-rendered HTML');
  assertTrue(pdfDoc.includes('data-fit-mode="compact"'), 'pdf doc injects the same fit mode as preview');
  assertTrue(!pdfDoc.includes('resume-height'), 'pdf doc excludes preview-only height reporter script');
}

function testBuildPdfSrcDocWithoutSmartOnePageKeepsNaturalPreviewHtml() {
  const html = '<!doctype html><html><head></head><body><main>natural preview</main></body></html>';
  const pdfDoc = buildPdfSrcDoc(html, 'compact', false);
  assertTrue(pdfDoc.includes('<main>natural preview</main>'), 'pdf doc keeps natural preview HTML');
  assertTrue(!pdfDoc.includes('data-fit-mode='), 'pdf doc does not inject fit CSS when smart-one-page is off');
}

function testOverflowPolicy() {
  assertTrue(contentOverflowPolicy('natural') === 'hidden', 'natural mode clips to A4');
  assertTrue(contentOverflowPolicy('compact') === 'hidden', 'compact mode clips to A4');
  assertTrue(contentOverflowPolicy('overflow') === 'visible', 'overflow mode stays visible');
}

const tests = [
  testBuildPreviewSrcDocInjectsTypographyStyle,
  testBuildPreviewSrcDocInjectsFitModeStyle,
  testBuildPreviewSrcDocAddsHeightReporter,
  testBuildPreviewSrcDocMarksSmartOnePageDisabled,
  testBuildPdfSrcDocInheritsPreviewRenderingWithoutHeightReporter,
  testBuildPdfSrcDocWithoutSmartOnePageKeepsNaturalPreviewHtml,
  testOverflowPolicy,
];

for (const t of tests) t();
console.log(`previewModel tests passed: ${tests.length}`);
