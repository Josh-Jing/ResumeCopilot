import MarkdownIt from 'markdown-it';
import type { ResumeContent, ResumeSection } from '../api/client';
import { isSpecialSectionId } from './sectionModel';

const mdIt = new MarkdownIt({ html: false, breaks: true, linkify: true });

export function parseContactInline(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter((l) => l.length > 0);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeImageSource(src: string): boolean {
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(src)
    || /^https?:\/\//i.test(src);
}

function extractMarkdownImageSource(markdown: string): string | null {
  const match = markdown.trim().match(/^!\[[^\]]*\]\(([^)]+)\)$/);
  return match ? match[1].trim() : null;
}

export function renderSpecialSectionContent(sectionType: string, markdown: string): string {
  if (sectionType === 'name') return escapeHtml(markdown || '');
  if (sectionType === 'contact') return escapeHtml(parseContactInline(markdown || '').join(' · '));
  if (sectionType === 'photo') {
    const raw = (markdown || '').trim();
    if (!raw) return '证件照';
    const imageSrc = extractMarkdownImageSource(raw) || raw;
    if (isSafeImageSource(imageSrc)) {
      return `<img src="${escapeHtml(imageSrc)}" alt="证件照" />`;
    }
    return escapeHtml(raw);
  }
  return mdIt.render(markdown || '');
}

function renderSpecialSection(doc: Document, id: string, section: ResumeSection | undefined) {
  const el = doc.querySelector(`[data-section-type="${id}"]`);
  if (!el || !section) return;

  if (id === 'name' || id === 'contact') {
    el.textContent = id === 'contact'
      ? parseContactInline(section.content).join(' · ')
      : section.content;
    return;
  }

  if (id === 'photo') {
    el.innerHTML = renderSpecialSectionContent('photo', section.content);
  }
}

function renderGeneralSection(doc: Document, section: ResumeSection): HTMLElement {
  const el = doc.createElement('section');
  el.className = 'resume-section';
  el.dataset.sectionId = section.id;

  const title = doc.createElement('h2');
  title.className = 'resume-section-title';
  title.textContent = section.title;

  const content = doc.createElement('div');
  content.className = 'resume-section-content markdown-body';
  content.innerHTML = mdIt.render(section.content || '');

  el.append(title, content);
  return el;
}

export function renderResumeHtml(templateHtml: string, content: ResumeContent): string {
  const doc = new DOMParser().parseFromString(templateHtml, 'text/html');

  renderSpecialSection(doc, 'name', content.sections.name);
  renderSpecialSection(doc, 'contact', content.sections.contact);
  renderSpecialSection(doc, 'photo', content.sections.photo);

  const mainSlot = doc.querySelector('[data-sections-slot="main"]');
  if (mainSlot) {
    mainSlot.innerHTML = '';
    for (const id of content.section_order) {
      const section = content.sections[id];
      if (!section || isSpecialSectionId(id)) continue;
      mainSlot.appendChild(renderGeneralSection(doc, section));
    }
  }

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
