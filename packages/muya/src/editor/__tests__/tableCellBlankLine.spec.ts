// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';
import { getBlock } from '../../utils/dom';

const editors: Muya[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    editors.splice(0).forEach((muya) => {
        muya.destroy();
        muya.domNode.remove();
    });
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
});

function boot(text = '![first](first.png)') {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, {
        markdown: `| Image | Notes |\n| --- | --- |\n| ${text} | keep |\n`,
    } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    editors.push(muya);
    const cell = muya.domNode.querySelectorAll<HTMLElement>('td')[2];
    const content = cell.querySelector<HTMLElement>('.mu-table-cell-content')!;
    const block = getBlock(content)!;
    if (!block.isContent())
        throw new Error('Missing cell content');
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 200));
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([
        new DOMRect(13, 6, 274, 120),
    ] as unknown as DOMRectList);
    return { muya, cell, content, block };
}

function doubleClick(target: HTMLElement, clientY = 160) {
    return target.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 50,
        clientY,
    }));
}

describe('table cell blank-line double click', () => {
    it('appends one in-cell break and focuses its end regardless of the previous selection', () => {
        const { muya, cell, content, block } = boot();
        expect(doubleClick(cell)).toBe(false);
        expect(block.text).toBe('![first](first.png)<br/>');
        expect(muya.editor.activeContentBlock).toBe(block);
        expect(block.getCursor()?.start.offset).toBe(block.text.length);
        const lineEnd = content.querySelector('.mu-table-cell-line-end');
        expect(lineEnd).not.toBeNull();
        expect(document.getSelection()?.anchorNode).toBe(lineEnd!.firstChild);
        expect(muya.domNode.querySelectorAll('tr')).toHaveLength(2);
        expect(muya.domNode.querySelectorAll('td')).toHaveLength(4);
    });

    it('does not add a rendered line for an escaped literal break tag', () => {
        const { content } = boot('text \\<br/>');
        expect(content.querySelector('.mu-table-cell-line-end')).toBeNull();
    });

    it.each(['text<br/>', 'text<br>', 'text<br />', ''])('reuses an existing empty line in %j', (text) => {
        const { cell, block } = boot(text);
        doubleClick(cell);
        doubleClick(cell);
        expect(block.text).toBe(text);
        expect(block.getCursor()?.start.offset).toBe(text.length);
    });

    it('only appends once on repeated double clicks in content whitespace', () => {
        const { content, block } = boot();
        doubleClick(content);
        doubleClick(content);
        expect(block.text).toBe('![first](first.png)<br/>');
    });

    it('leaves clicks on text, beside content and outside cells unchanged', () => {
        const { muya, cell, content, block } = boot('Some words');
        const before = block.text;
        doubleClick(content, 50);
        doubleClick(content.querySelector<HTMLElement>('span')!);
        doubleClick(muya.domNode);
        cell.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 160 }));
        expect(block.text).toBe(before);
    });

    it('leaves image double clicks unchanged', () => {
        const { content, block } = boot();
        const before = block.text;
        doubleClick(content.querySelector<HTMLElement>('.mu-inline-image')!);
        expect(block.text).toBe(before);
    });

    it('undo restores the cell without removing its image', async () => {
        const { muya, cell, block } = boot();
        const before = block.text;
        doubleClick(cell);
        await new Promise(resolve => requestAnimationFrame(resolve));
        muya.undo();
        expect(block.text).toBe(before);
    });
});
