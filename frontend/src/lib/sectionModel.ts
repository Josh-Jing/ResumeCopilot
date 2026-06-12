export type SpecialSectionId = 'name' | 'contact' | 'photo';
export type InsertPosition = 'above' | 'below';

export interface ResumeSection {
  id: string;
  title: string;
  content: string;
}

export interface ResumeContentV2 {
  version: 2;
  sections: Record<string, ResumeSection>;
  section_order: string[];
}

export const SPECIAL_SECTION_IDS = new Set<string>(['name', 'contact', 'photo']);

export function isSpecialSectionId(id: string): id is SpecialSectionId {
  return SPECIAL_SECTION_IDS.has(id);
}

export function defaultSpecialSection(id: 'name' | 'contact'): ResumeSection {
  if (id === 'name') return { id: 'name', title: '姓名', content: '姓名' };
  return { id: 'contact', title: '联系方式', content: '- 📱 \n- 📧 \n- 📍 ' };
}

function normalizeSection(id: string, value: unknown): ResumeSection {
  const raw = value && typeof value === 'object' ? (value as Partial<ResumeSection>) : {};
  return {
    id,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : id,
    content: typeof raw.content === 'string' ? raw.content : '',
  };
}

export function normalizeResumeContent(raw: unknown): ResumeContentV2 {
  const input = raw && typeof raw === 'object' ? (raw as Partial<ResumeContentV2>) : {};
  const rawSections = input.sections && typeof input.sections === 'object' ? input.sections : {};
  const sections: Record<string, ResumeSection> = {};

  for (const [id, value] of Object.entries(rawSections)) {
    sections[id] = normalizeSection(id, value);
  }

  sections.name = sections.name ?? defaultSpecialSection('name');
  sections.contact = sections.contact ?? defaultSpecialSection('contact');

  const seen = new Set<string>();
  const section_order: string[] = [];
  const rawOrder = Array.isArray(input.section_order) ? input.section_order : [];
  for (const id of rawOrder) {
    if (typeof id !== 'string') continue;
    if (seen.has(id) || isSpecialSectionId(id) || !sections[id]) continue;
    section_order.push(id);
    seen.add(id);
  }

  for (const id of Object.keys(sections)) {
    if (!isSpecialSectionId(id) && !seen.has(id)) {
      section_order.push(id);
      seen.add(id);
    }
  }

  return { version: 2, sections, section_order };
}

function randomShortId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function getGeneralSectionIds(content: ResumeContentV2): string[] {
  return content.section_order.filter((id) => !isSpecialSectionId(id) && content.sections[id]);
}

export function createGeneralSection(
  existingSections: Record<string, ResumeSection>,
  title = '新建 Section',
  content = '',
): ResumeSection {
  let id = `sec_${randomShortId()}`;
  while (existingSections[id]) id = `sec_${randomShortId()}`;
  return { id, title, content };
}

export function insertSection(
  order: string[],
  anchorName: string,
  newName: string,
  position: InsertPosition,
): string[] {
  const cleaned = order.filter((name) => name !== newName);
  const anchorIndex = cleaned.indexOf(anchorName);
  const insertIndex = anchorIndex === -1
    ? cleaned.length
    : anchorIndex + (position === 'below' ? 1 : 0);
  return [...cleaned.slice(0, insertIndex), newName, ...cleaned.slice(insertIndex)];
}

export function removeSection(order: string[], sectionId: string): string[] {
  return order.filter((id) => id !== sectionId);
}

export function sectionDeleteNeedsConfirmation(content: string): boolean {
  return content.trim().length > 0;
}

export function moveSection(
  order: string[],
  draggedName: string,
  targetName: string,
  position: InsertPosition = 'above',
): string[] {
  if (draggedName === targetName) return order;
  const withoutDragged = order.filter((name) => name !== draggedName);
  const targetIndex = withoutDragged.indexOf(targetName);
  if (targetIndex === -1) return order;
  const insertIndex = targetIndex + (position === 'below' ? 1 : 0);
  return [
    ...withoutDragged.slice(0, insertIndex),
    draggedName,
    ...withoutDragged.slice(insertIndex),
  ];
}

export function displaySpecialTitle(sectionId: 'name' | 'contact'): string {
  return sectionId === 'name' ? '姓名' : '联系方式';
}

export function cloneContent(content: ResumeContentV2): ResumeContentV2 {
  return {
    version: 2,
    sections: Object.fromEntries(
      Object.entries(content.sections).map(([id, section]) => [id, { ...section }]),
    ),
    section_order: [...content.section_order],
  };
}
