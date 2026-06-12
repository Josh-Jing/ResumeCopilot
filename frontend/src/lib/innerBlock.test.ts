import {
  parseInnerBlock,
  parseInnerLine,
  renderInnerBlockHtml,
  resolveInnerColumnWidths,
} from './innerBlock.ts';
import { renderMarkdown } from './resumeRenderer.ts';

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function testParseInnerLine() {
  const left = parseInnerLine('- [50%] [[ ### 东北大学');
  assert(left?.widthPct === 50, 'width is 50');
  assert(left?.align === 'left', 'align left');
  assert(left?.body === '### 东北大学', 'body markdown');

  const center = parseInnerLine('- 本科');
  assert(center?.widthPct === null, 'auto width');
  assert(center?.align === 'center', 'align center');
  assert(center?.body === '本科', 'body text');

  const right = parseInnerLine('- [25%] ]] 2020.09 – 2024.07');
  assert(right?.widthPct === 25, 'right col width');
  assert(right?.align === 'right', 'align right');
  assert(right?.body === '2020.09 – 2024.07', 'right col body');

  assert(parseInnerLine('not a list') === null, 'ignore non-list lines');
}

function testResolveWidthsForEducationExample() {
  const source = `- [50%] [[ ### 东北大学
- 本科
- 计算机科学与技术
- 2020.09 – 2024.07
- 专业排名前25%`;
  const columns = parseInnerBlock(source);
  assert(columns.length === 5, 'five columns');

  const widths = resolveInnerColumnWidths(columns);
  assert(widths[0] === 50, 'first column 50%');
  assert(widths[1] === 12.5, 'second column 12.5%');
  assert(widths[2] === 12.5, 'third column 12.5%');
  assert(widths[3] === 12.5, 'fourth column 12.5%');
  assert(widths[4] === 12.5, 'fifth column 12.5%');
}

function testRenderInnerBlockHtml() {
  const html = renderInnerBlockHtml('- [50%] [[ ### 东北大学\n- 本科', (body) => {
    if (body.startsWith('### ')) return `<h3>${body.slice(4)}</h3>`;
    return `<p>${body}</p>`;
  });

  assert(html.includes('class="inner-row"'), 'inner row wrapper');
  assert(html.includes('inner-col--left'), 'left column class');
  assert(html.includes('flex: 0 0 50%'), 'fixed width style');
  assert(html.includes('<h3>东北大学</h3>'), 'markdown heading rendered');
  assert(html.includes('<p>本科</p>'), 'plain text rendered');
}

function testMarkdownIntegration() {
  const markdown = `\`\`\`inner
- [50%] [[ ### 东北大学
- 本科
- 计算机科学与技术
- 2020.09 – 2024.07
- 专业排名前25%
\`\`\``;

  const html = renderMarkdown(markdown);
  assert(html.includes('class="inner-row"'), 'fence renders inner row');
  assert(html.includes('<h3>东北大学</h3>'), 'h3 inside inner col');
  assert(html.includes('inner-col--left'), 'left align class');
  assert(html.includes('flex: 0 0 12.5%'), 'auto columns split remainder');
  assert(!html.includes('<pre>'), 'not rendered as code block');
}

function testThreeColumnVariant() {
  const markdown = `\`\`\`inner
- [50%] [[ ### 东北大学
- [25%] 本科 · 计算机科学与技术
- [25%] ]] 2020.09 – 2024.07 · 专业排名前25%
\`\`\``;

  const html = renderMarkdown(markdown);
  assert(html.includes('inner-col--right'), 'right align class');
  assert((html.match(/flex: 0 0 25%;/g) || []).length === 2, 'two 25% columns');
}

testParseInnerLine();
testResolveWidthsForEducationExample();
testRenderInnerBlockHtml();
testMarkdownIntegration();
testThreeColumnVariant();
console.log('innerBlock tests passed: 5');
