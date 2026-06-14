import {
  A4_HEIGHT,
  FILL_THRESHOLD,
  MAX_AUTO_FIT_RATIO,
  computeFitMode,
  injectFitModeStyle,
} from './fitPolicy.ts';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function assertTrue(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function testSparseContentStaysNatural() {
  const result = computeFitMode(A4_HEIGHT * 0.5);
  assertEqual(result.mode, 'natural', '50% fill keeps natural layout');
  assertEqual(result.overflow, false, 'sparse content is not overflow');
}

function testThresholdToOnePageExpands() {
  assertEqual(computeFitMode(A4_HEIGHT * (FILL_THRESHOLD - 0.01)).mode, 'natural', 'below fill threshold stays natural');
  assertEqual(computeFitMode(A4_HEIGHT * FILL_THRESHOLD).mode, 'expand', 'at fill threshold expands');
  assertEqual(computeFitMode(A4_HEIGHT * 0.99).mode, 'expand', 'near full page expands');
}

function testExactPageStaysNatural() {
  assertEqual(computeFitMode(A4_HEIGHT).mode, 'natural', 'exact page stays natural');
}

function testSlightlyLongContentCompacts() {
  const result = computeFitMode(A4_HEIGHT * 1.1);
  assertEqual(result.mode, 'compact', '110% content compacts');
  assertEqual(result.overflow, false, 'compact content is clipped to one page');
}

function testTooLongContentOverflows() {
  assertEqual(computeFitMode(A4_HEIGHT * MAX_AUTO_FIT_RATIO).mode, 'compact', 'max auto fit boundary still compacts');
  const result = computeFitMode(A4_HEIGHT * (MAX_AUTO_FIT_RATIO + 0.01));
  assertEqual(result.mode, 'overflow', 'beyond max auto fit overflows');
  assertEqual(result.overflow, true, 'overflow flag is set');
}

function testFitModeStyleInjection() {
  const html = '<!doctype html><html><head></head><body></body></html>';
  const compact = injectFitModeStyle(html, 'compact');
  assertTrue(compact.includes('data-fit-mode="compact"'), 'compact marker injected');
  assertTrue(compact.includes('--fit-rhythm-scale'), 'compact rhythm scale injected');
  assertTrue(compact.includes('--fit-line-scale'), 'compact line scale injected');
  assertTrue(compact.includes('--fit-font-scale'), 'compact font scale injected');
  assertEqual(injectFitModeStyle(html, 'natural'), html, 'natural mode does not inject CSS');
}

const tests = [
  testSparseContentStaysNatural,
  testThresholdToOnePageExpands,
  testExactPageStaysNatural,
  testSlightlyLongContentCompacts,
  testTooLongContentOverflows,
  testFitModeStyleInjection,
];

for (const t of tests) t();
console.log(`fitPolicy tests passed: ${tests.length}`);
