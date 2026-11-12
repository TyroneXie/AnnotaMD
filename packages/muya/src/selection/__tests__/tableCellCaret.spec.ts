// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { getNodeAndOffset, getOffsetOfParagraph, getTextContent } from '../dom';

function cellWithCaret(text = '\u200B') {
    const cell = document.createElement('span');
    cell.className = 'mu-table-cell-content';
    const source = document.createElement('span');
    source.textContent = 'text<br/>';
    const placeholder = document.createElement('span');
    placeholder.className = 'mu-table-cell-line-end mu-output-remove';
    placeholder.textContent = text;
    cell.append(source, placeholder);
    return { cell, anchor: placeholder.firstChild!, offset: source.textContent.length };
}

describe('empty table line caret source mapping', () => {
    it('anchors the end of a cell to drawable text instead of an empty element', () => {
        const { cell, anchor, offset } = cellWithCaret();
        expect(getNodeAndOffset(cell, offset)).toEqual({ node: anchor, offset: 0 });
        expect(anchor.nodeType).toBe(Node.TEXT_NODE);
    });

    it('keeps the same source offset on either side of the invisible placeholder', () => {
        const { cell, anchor, offset } = cellWithCaret();
        expect(getOffsetOfParagraph(anchor, cell, 0)).toBe(offset);
        expect(getOffsetOfParagraph(anchor, cell, 1)).toBe(offset);
    });

    it('preserves newly typed text while excluding only the caret placeholder', () => {
        const { cell, anchor, offset } = cellWithCaret('next\u200B');
        expect(getTextContent(cell)).toBe('text<br/>next');
        expect(getTextContent(cell, ['mu-math-render'])).toBe('text<br/>next');
        expect(getOffsetOfParagraph(anchor, cell, 4)).toBe(offset + 4);
        expect(getOffsetOfParagraph(anchor, cell, 5)).toBe(offset + 4);
    });
});
