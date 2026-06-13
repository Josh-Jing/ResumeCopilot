import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import App from '../App';

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

let lastWebSocket: { onmessage: ((event: MessageEvent) => void) | null; close: () => void } | null = null;

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1:5174/',
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  globalThis.MessageEvent = dom.window.MessageEvent;
  globalThis.Event = dom.window.Event;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.WebSocket = class {
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() { lastWebSocket = this; }
    close() {}
  } as unknown as typeof WebSocket;
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

function createFetchMock() {
  const longProject = Array.from({ length: 80 }, (_, i) => `- 项目经历长内容 ${i + 1}`).join('\n');
  const resume = {
    name: '阿博茨',
    template_html: '<!doctype html><html><body><h1 data-section-type="name"></h1><div data-section-type="contact"></div><main data-sections-slot="main"></main></body></html>',
    content: {
      version: 2,
      sections: {
        name: { id: 'name', title: '姓名', content: '阿博茨' },
        contact: { id: 'contact', title: '联系方式', content: '- 📱 138' },
        sec_intro: { id: 'sec_intro', title: '个人简介', content: Array.from({ length: 25 }, (_, i) => `- 简介 ${i + 1}`).join('\n') },
        sec_project: { id: 'sec_project', title: '项目经历', content: longProject },
        sec_more: { id: 'sec_more', title: '其他经历', content: Array.from({ length: 20 }, (_, i) => `- 其他 ${i + 1}`).join('\n') },
      },
      section_order: ['sec_intro', 'sec_project', 'sec_more'],
    },
    fields_in_template: [],
    meta: { name: '阿博茨', created_at: '', updated_at: '' },
  };
  let detailFetchCount = 0;
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlString = String(url);
    if (urlString === '/api/resumes') {
      return { ok: true, status: 200, json: async () => [{ name: '阿博茨', created_at: '', updated_at: '' }] } as Response;
    }
    if (urlString === '/api/resumes/%E9%98%BF%E5%8D%9A%E8%8C%A8') {
      detailFetchCount += 1;
      const editorPanel = document.querySelector('.editor-panel') as HTMLDivElement | null;
      if (editorPanel && detailFetchCount > 1) editorPanel.scrollTop = 0;
      return { ok: true, status: 200, json: async () => resume } as Response;
    }
    if (urlString === '/api/resumes/%E9%98%BF%E5%8D%9A%E8%8C%A8/content') {
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) } as Response;
    }
    throw new Error(`unexpected fetch: ${urlString}`);
  }) as typeof fetch;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('textarea value setter unavailable');
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function testEditorPanelKeepsScrollTopWhenEditingLongProjectSection() {
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

  const editorPanel = document.querySelector('.editor-panel') as HTMLDivElement | null;
  assert(!!editorPanel, 'editor panel rendered');
  editorPanel!.scrollTop = 640;

  const editors = Array.from(document.querySelectorAll('.section-editor')) as HTMLElement[];
  const projectEditor = editors.find((editor) => editor.textContent?.includes('项目经历'));
  assert(!!projectEditor, 'project section editor rendered');
  const textarea = projectEditor!.querySelector('textarea') as HTMLTextAreaElement | null;
  assert(!!textarea, 'project textarea rendered');

  let styleHeight = textarea!.style.height;
  Object.defineProperty(textarea!.style, 'height', {
    configurable: true,
    get: () => styleHeight,
    set: (value: string) => {
      styleHeight = value;
      editorPanel!.scrollTop = 0;
    },
  });

  await act(async () => {
    setTextareaValue(textarea!, `${textarea!.value}\n- 继续补充项目经历`);
  });
  await flush();

  await act(async () => {
    lastWebSocket?.onmessage?.({
      data: JSON.stringify({ type: 'file_changed', resume_name: '阿博茨', filename: 'content.json' }),
    } as MessageEvent);
  });
  await flush();

  assert(editorPanel!.scrollTop === 640, `editor scrollTop should stay at 640, got ${editorPanel!.scrollTop}`);
}

await testEditorPanelKeepsScrollTopWhenEditingLongProjectSection();
console.log('SectionEditor scroll tests passed');
