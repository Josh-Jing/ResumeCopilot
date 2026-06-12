import {
  computeFitMode,
  injectFitModeStyle,
  A4_HEIGHT,
  FILL_THRESHOLD,
  MAX_AUTO_FIT_RATIO,
} from './fitPolicy.ts';
import type { FitMode } from './fitPolicy.ts';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function assertTrue(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

// ── computeFitMode ──────────────────────────────────────

function testSparseContentIsNatural() {
  const r = computeFitMode(A4_HEIGHT * 0.5);
  assertEqual(r.mode, 'natural', '50% fill → natural');
  assertEqual(r.overflow, false, 'no overflow');
}

function testBelowFillThresholdIsNatural() {
  const r = computeFitMode(A4_HEIGHT * (FILL_THRESHOLD - 0.01));
  assertEqual(r.mode, 'natural', 'just below threshold → natural');
}

function testAtFillThresholdIsExpand() {
  const r = computeFitMode(A4_HEIGHT * FILL_THRESHOLD);
  assertEqual(r.mode, 'expand', 'at threshold → expand');
}

function testNearFullPageIsExpand() {
  const r = computeFitMode(A4_HEIGHT * 0.99);
  assertEqual(r.mode, 'expand', '99% fill → expand');
}

function testExactFullPageIsNatural() {
  const r = computeFitMode(A4_HEIGHT * 1.0);
  assertEqual(r.mode, 'natural', '100% fill → natural');
}

function testSlightlyOverIsCompact() {
  const r = computeFitMode(A4_HEIGHT * 1.1);
  assertEqual(r.mode, 'compact', '110% → compact');
}

function testAtMaxAutoFitIsCompact() {
  const r = computeFitMode(A4_HEIGHT * MAX_AUTO_FIT_RATIO);
  assertEqual(r.mode, 'compact', '130% → compact');
  assertEqual(r.overflow, false, 'no overflow at boundary');
}

function testOverMaxAutoFitIsOverflow() {
  const r = computeFitMode(A4_HEIGHT * (MAX_AUTO_FIT_RATIO + 0.01));
  assertEqual(r.mode, 'overflow', '131% → overflow');
  assertEqual(r.overflow, true, 'overflow flag set');
}

function testVeryLongContentIsOverflow() {
  const r = computeFitMode(A4_HEIGHT * 2.0);
  assertEqual(r.mode, 'overflow', '200% → overflow');
  assertTrue(r.ratio > MAX_AUTO_FIT_RATIO, 'ratio exceeds max');
}

function testRatioIsAccurate() {
  const h = 1500;
  const r = computeFitMode(h);
  const expected = h / A4_HEIGHT;
  assertTrue(Math.abs(r.ratio - expected) < 0.001, 'ratio accuracy');
}

// ── injectFitModeStyle ──────────────────────────────────

function testInjectExpandAddsStyleTag() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const result = injectFitModeStyle(html, 'expand');
  assertTrue(result.includes('data-fit-mode="expand"'), 'expand style injected');
  assertTrue(result.includes('--fit-rhythm-scale'), 'expand sets rhythm scale');
  assertTrue(result.includes('--fit-line-scale'), 'expand sets line scale');
}

function testInjectCompactAddsFontScale() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const result = injectFitModeStyle(html, 'compact');
  assertTrue(result.includes('--fit-font-scale'), 'compact sets font-scale');
  assertTrue(result.includes('--fit-rhythm-scale'), 'compact sets rhythm scale');
  assertTrue(result.includes('--fit-line-scale'), 'compact sets line scale');
}

function testInjectNaturalDoesNothing() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const result = injectFitModeStyle(html, 'natural');
  assertEqual(result, html, 'natural: no injection');
}

function testInjectOverflowAddsEmptyMarker() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const result = injectFitModeStyle(html, 'overflow');
  assertTrue(result.includes('data-fit-mode="overflow"'), 'overflow marker injected');
  assertTrue(!result.includes('--fit-'), 'overflow: no fit variables');
}

function testInjectIntoHeadlessHtml() {
  const html = '<!doctype html><html><body></body></html>';
  const result = injectFitModeStyle(html, 'expand');
  assertTrue(result.includes('data-fit-mode="expand"'), 'headless: style still injected');
}

// ── run ─────────────────────────────────────────────────

const tests = [
  testSparseContentIsNatural,
  testBelowFillThresholdIsNatural,
  testAtFillThresholdIsExpand,
  testNearFullPageIsExpand,
  testExactFullPageIsNatural,
  testSlightlyOverIsCompact,
  testAtMaxAutoFitIsCompact,
  testOverMaxAutoFitIsOverflow,
  testVeryLongContentIsOverflow,
  testRatioIsAccurate,
  testInjectExpandAddsStyleTag,
  testInjectCompactAddsFontScale,
  testInjectNaturalDoesNothing,
  testInjectOverflowAddsEmptyMarker,
  testInjectIntoHeadlessHtml,
];

for (const t of tests) t();
console.log(`fitPolicy tests passed: ${tests.length}`);
