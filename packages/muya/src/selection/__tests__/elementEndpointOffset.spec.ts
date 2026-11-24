// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getOffsetOfParagraph } from '../dom';

// A DOM selection endpoint is either `(text node, character offset)` or
// `(element, child index)`. Reading the child index as a character count made
// a whole-block selection collapse to its first child — copying a bold
// paragraph produced `**H`.

function paragraph(html: string): HTMLElement {
    const span = document.createElement('span');
    span.className = 'mu-content';
    span.innerHTML = html;
    document.body.appendChild(span);

    return span;
}

describe('getOffsetOfParagraph — element endpoints', () => {
    it('reads the child index as a position between children', () => {
        const p = paragraph(
            '<span class="mu-hide mu-remove">**</span>'
            + '<strong><span class="mu-plain-text">Hermes</span></strong>'
            + '<span class="mu-hide mu-remove">**</span>',
        );

        expect(getOffsetOfParagraph(p, p, 0)).toBe(0);
        expect(getOffsetOfParagraph(p, p, 1)).toBe(2);
        expect(getOffsetOfParagraph(p, p, 2)).toBe(8);
        expect(getOffsetOfParagraph(p, p, 3)).toBe(10);
    });

    it('still counts a text-node offset in characters', () => {
        const p = paragraph('abcdef');

        expect(getOffsetOfParagraph(p.firstChild!, p, 2)).toBe(2);
    });

    it('adds the text of preceding siblings for a nested element endpoint', () => {
        const p = paragraph(
            '<span class="mu-plain-text">ab</span><strong>cd</strong>',
        );

        expect(getOffsetOfParagraph(p.lastChild!, p, 0)).toBe(2);
    });
});
