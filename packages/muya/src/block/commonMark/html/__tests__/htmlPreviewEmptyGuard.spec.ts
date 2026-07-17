// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { isEmptyHtmlBlock, renderMarkdownInDetails } from '../htmlPreview';

// Regression for marktext #3821. The html-block "empty block" guard replaced
// any single element with an empty body by the "<Empty HTML Block>"
// placeholder. Media elements (`<video>`/`<audio>`) carry their content in
// attributes, so an empty body is not an empty block and they must render.
describe('isEmptyHtmlBlock (#3821)', () => {
    it('treats a single element with an empty body as empty', () => {
        expect(isEmptyHtmlBlock('<div></div>')).toBe(true);
        expect(isEmptyHtmlBlock('<span></span>')).toBe(true);
        // whitespace / newline between tags still counts as empty
        expect(isEmptyHtmlBlock('<p>\n</p>')).toBe(true);
    });

    it('does not treat self-contained media (video/audio) as empty', () => {
        expect(isEmptyHtmlBlock('<video controls src="https://e.com/v.mp4"></video>')).toBe(false);
        expect(isEmptyHtmlBlock('<video src="https://e.com/v.mp4">\n</video>')).toBe(false);
        expect(isEmptyHtmlBlock('<audio src="https://e.com/a.mp3"></audio>')).toBe(false);
    });

    it('returns false for an element that has body content', () => {
        expect(isEmptyHtmlBlock('<div>hello</div>')).toBe(false);
    });
});

describe('GitHub-style details blocks', () => {
    it('renders Markdown in the details body while preserving the summary', () => {
        const doc = new DOMParser().parseFromString(`
            <details>
              <summary><strong>更多能力</strong></summary>

              - **完整 Markdown 支持** — 表格、任务列表
              - 第二项
            </details>
        `, 'text/html');

        renderMarkdownInDetails(doc);

        const details = doc.querySelector('details')!;
        expect(details.querySelector('summary strong')?.textContent).toBe('更多能力');
        expect(details.querySelectorAll('ul > li')).toHaveLength(2);
        expect(details.querySelector('li strong')?.textContent).toBe('完整 Markdown 支持');
    });
});
