import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import App from '../App';

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1:5174/',
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLIFrameElement = dom.window.HTMLIFrameElement;
  globalThis.MessageEvent = dom.window.MessageEvent;
  globalThis.Event = dom.window.Event;
  globalThis.Blob = dom.window.Blob as unknown as typeof Blob;
  globalThis.URL.createObjectURL = () => 'blob:resume-pdf';
  globalThis.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  globalThis.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.WebSocket = class { close() {} } as unknown as typeof WebSocket;
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

function createFetchMock() {
  const exportBodies: unknown[] = [];
  const resume = {
    name: '测试简历',
    template_html: '<!doctype html><html><head></head><body><h1 data-section-type="name"></h1><div data-section-type="contact"></div><main data-sections-slot="main"></main></body></html>',
    content: {
      version: 2,
      sections: {
        name: { id: 'name', title: '姓名', content: '测试' },
        contact: { id: 'contact', title: '联系方式', content: '- test@example.com' },
        sec_project: { id: 'sec_project', title: '项目经历', content: '- 项目内容' },
      },
      section_order: ['sec_project'],
    },
    fields_in_template: [],
    meta: { name: '测试简历', created_at: '', updated_at: '' },
  };

  const fetchMock = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlString = String(url);
    if (urlString === '/api/resumes') {
      return { ok: true, status: 200, json: async () => [{ name: '测试简历', created_at: '', updated_at: '' }] } as Response;
    }
    if (urlString === '/api/resumes/%E6%B5%8B%E8%AF%95%E7%AE%80%E5%8E%86') {
      return { ok: true, status: 200, json: async () => resume } as Response;
    }
    if (urlString === '/api/resumes/%E6%B5%8B%E8%AF%95%E7%AE%80%E5%8E%86/export-pdf') {
      exportBodies.push(JSON.parse(String(init?.body ?? '{}')));
      return { ok: true, status: 200, blob: async () => new Blob(['pdf']) } as Response;
    }
    throw new Error(`unexpected fetch: ${urlString}`);
  }) as typeof fetch;
  return Object.assign(fetchMock, { exportBodies });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function testSmartOnePageToggleSitsBeforeCopyResumeAndTogglesPressedState() {
  setupDom();
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;

  const rootEl = document.getElementById('root');
  assert(!!rootEl, 'root element exists');
  const root = createRoot(rootEl!);

  await act(async () => { root.render(<App />); });
  await flush();

  const sidebarItem = document.querySelector('.sidebar-item') as HTMLElement | null;
  await act(async () => { sidebarItem!.click(); });
  await flush();

  const headerButtons = Array.from(document.querySelectorAll('.main-header button')) as HTMLButtonElement[];
  const labels = headerButtons.map((button) => button.textContent?.trim());
  const smartIndex = labels.indexOf('智能一页纸');
  const copyIndex = labels.indexOf('复制简历');
  assert(smartIndex >= 0, 'smart one-page button is rendered');
  assert(copyIndex >= 0, 'copy resume button is rendered');
  assert(smartIndex < copyIndex, 'smart one-page button is left of copy resume');

  const smartButton = headerButtons[smartIndex];
  assert(smartButton.getAttribute('aria-pressed') === 'false', 'smart one-page starts disabled');
  await act(async () => { smartButton.click(); });
  assert(smartButton.getAttribute('aria-pressed') === 'true', 'smart one-page toggles on');

  const exportButton = Array.from(document.querySelectorAll('.main-header button'))
    .find((button) => button.textContent?.trim() === '导出 PDF') as HTMLButtonElement | undefined;
  assert(!!exportButton, 'export pdf button is rendered');
  await flush();
  await act(async () => { exportButton!.click(); });
  await flush();
  assert(fetchMock.exportBodies.length === 1, 'export endpoint is called once');
  const body = fetchMock.exportBodies[0] as { preview_html?: string; fit_mode?: string };
  const previewHtml = body.preview_html ?? '';
  assert(previewHtml.length > 0, 'export body includes preview HTML string');
  assert(previewHtml.includes('data-sections-slot="main"'), 'export body includes preview-rendered HTML');
  assert(previewHtml.includes('resume-height') === false, 'export HTML excludes preview-only height reporter');
  assert(body.fit_mode === 'natural', 'export body includes current fit mode');
}

await testSmartOnePageToggleSitsBeforeCopyResumeAndTogglesPressedState();
console.log('App smart one-page tests passed');
