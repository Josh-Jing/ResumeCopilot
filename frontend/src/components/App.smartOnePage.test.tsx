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
  globalThis.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.WebSocket = class { close() {} } as unknown as typeof WebSocket;
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

function createFetchMock() {
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

  return (async (url: RequestInfo | URL) => {
    const urlString = String(url);
    if (urlString === '/api/resumes') {
      return { ok: true, status: 200, json: async () => [{ name: '测试简历', created_at: '', updated_at: '' }] } as Response;
    }
    if (urlString === '/api/resumes/%E6%B5%8B%E8%AF%95%E7%AE%80%E5%8E%86') {
      return { ok: true, status: 200, json: async () => resume } as Response;
    }
    throw new Error(`unexpected fetch: ${urlString}`);
  }) as typeof fetch;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function testSmartOnePageToggleSitsBeforeCopyResumeAndTogglesPressedState() {
  setupDom();
  globalThis.fetch = createFetchMock();

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
}

await testSmartOnePageToggleSitsBeforeCopyResumeAndTogglesPressedState();
console.log('App smart one-page tests passed');
