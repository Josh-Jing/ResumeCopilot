import { exportPdf } from './client.ts';

function stableStringify(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, entryValue]);
    return JSON.stringify(Object.fromEntries(entries));
  }
  return JSON.stringify(value);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = stableStringify(actual);
  const e = stableStringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

async function testExportPdfSendsPreviewHtmlAndFitMode() {
  let capturedUrl = '';
  let capturedBody: unknown = null;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body ?? '{}'));
    return { ok: true, status: 200, blob: async () => new Blob(['pdf']) } as Response;
  }) as typeof fetch;

  await exportPdf('测试简历', {
    fitMode: 'compact',
    previewHtml: '<!doctype html><html><body><main>frontend-rendered</main></body></html>',
  });

  assertEqual(capturedUrl, '/api/resumes/%E6%B5%8B%E8%AF%95%E7%AE%80%E5%8E%86/export-pdf', 'resume name is URL encoded');
  assertEqual(capturedBody, {
    smart_one_page: true,
    fit_mode: 'compact',
    preview_html: '<!doctype html><html><body><main>frontend-rendered</main></body></html>',
  }, 'export body includes the exact preview HTML and fit mode');
}

async function testExportPdfOmitsFitModeWhenUndefinedButStillSendsPreviewHtml() {
  let capturedBody: unknown = null;
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}'));
    return { ok: true, status: 200, blob: async () => new Blob(['pdf']) } as Response;
  }) as typeof fetch;

  await exportPdf('测试简历', {
    previewHtml: '<!doctype html><html><body><main>natural preview</main></body></html>',
  });

  assertEqual(capturedBody, {
    preview_html: '<!doctype html><html><body><main>natural preview</main></body></html>',
  }, 'export body can inherit preview HTML without forcing smart-one-page');
}

await testExportPdfSendsPreviewHtmlAndFitMode();
await testExportPdfOmitsFitModeWhenUndefinedButStillSendsPreviewHtml();
console.log('api client exportPdf tests passed: 2');
