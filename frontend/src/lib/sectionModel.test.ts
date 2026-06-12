import {
  SPECIAL_SECTION_IDS,
  createGeneralSection,
  getGeneralSectionIds,
  insertSection,
  isSpecialSectionId,
  moveSection,
  normalizeResumeContent,
  removeSection,
} from './sectionModel.ts';

function assertDeepEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function testSpecialSectionIdsAreApplicationConvention() {
  assert(SPECIAL_SECTION_IDS.has('name'), 'name is special');
  assert(SPECIAL_SECTION_IDS.has('contact'), 'contact is special');
  assert(isSpecialSectionId('name'), 'name kind');
  assert(!isSpecialSectionId('sec_abc123'), 'general section kind');
}

function testNormalizeKeepsOnlyGeneralSectionsInOrder() {
  const content = normalizeResumeContent({
    version: 2,
    sections: {
      name: { id: 'name', title: '姓名', content: '候选人姓名' },
      contact: { id: 'contact', title: '联系方式', content: '- 📱 1' },
      sec_a: { id: 'sec_a', title: '教育经历', content: 'A' },
      sec_b: { id: 'sec_b', title: '项目经历', content: 'B' },
    },
    section_order: ['name', 'sec_b', 'missing', 'sec_a', 'contact', 'sec_b'],
  });

  assertDeepEqual(content.section_order, ['sec_b', 'sec_a'], 'section_order contains only existing general sections');
}

function testNormalizeSuppliesRequiredSpecialSections() {
  const content = normalizeResumeContent({ version: 2, sections: {}, section_order: [] });
  assertDeepEqual(content.sections.name, { id: 'name', title: '姓名', content: '姓名' }, 'default name');
  assertDeepEqual(content.sections.contact, { id: 'contact', title: '联系方式', content: '- 📱 \n- 📧 \n- 📍 ' }, 'default contact');
}

function testCreateGeneralSectionUsesStableRandomIdShape() {
  const section = createGeneralSection({}, '新建 Section');
  assert(/^sec_[A-Za-z0-9]{8}$/.test(section.id), `section id shape: ${section.id}`);
  assertDeepEqual(Object.keys(section).sort(), ['content', 'id', 'title'], 'ordinary section has no type field');
}

function testGetGeneralSectionIdsFollowsSectionOrder() {
  const content = normalizeResumeContent({
    version: 2,
    sections: {
      name: { id: 'name', title: '姓名', content: '候选人姓名' },
      contact: { id: 'contact', title: '联系方式', content: '' },
      sec_a: { id: 'sec_a', title: 'A', content: '' },
      sec_b: { id: 'sec_b', title: 'B', content: '' },
    },
    section_order: ['sec_b', 'sec_a'],
  });
  assertDeepEqual(getGeneralSectionIds(content), ['sec_b', 'sec_a'], 'general ids ordered');
}

function testInsertRemoveMoveSectionOperateOnIds() {
  const base = ['sec_a', 'sec_b', 'sec_c'];
  assertDeepEqual(insertSection(base, 'sec_b', 'sec_x', 'above'), ['sec_a', 'sec_x', 'sec_b', 'sec_c'], 'insert above');
  assertDeepEqual(insertSection(base, 'sec_b', 'sec_x', 'below'), ['sec_a', 'sec_b', 'sec_x', 'sec_c'], 'insert below');
  assertDeepEqual(removeSection(base, 'sec_b'), ['sec_a', 'sec_c'], 'remove');
  assertDeepEqual(moveSection(base, 'sec_c', 'sec_a', 'below'), ['sec_a', 'sec_c', 'sec_b'], 'move below');
}

const tests = [
  testSpecialSectionIdsAreApplicationConvention,
  testNormalizeKeepsOnlyGeneralSectionsInOrder,
  testNormalizeSuppliesRequiredSpecialSections,
  testCreateGeneralSectionUsesStableRandomIdShape,
  testGetGeneralSectionIdsFollowsSectionOrder,
  testInsertRemoveMoveSectionOperateOnIds,
];

for (const t of tests) t();
console.log(`sectionModel tests passed: ${tests.length}`);
