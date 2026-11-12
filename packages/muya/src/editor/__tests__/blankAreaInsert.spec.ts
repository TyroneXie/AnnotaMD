// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';

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

function boot(markdown = 'First paragraph\n\nSecond paragraph\n') {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    editors.push(muya);
    const page = muya.editor.scrollPage!;
    vi.spyOn(page.domNode!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 600, 500));
    page.forEach((block, i) => {
        vi.spyOn(block.domNode!, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 50 + i * 100, 560, 50));
    });
    return { muya, page };
}

function doubleClick(target: HTMLElement, clientY: number) {
    target.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY,
    }));
}

describe('double clicking document whitespace', () => {
    it('inserts a plain editable paragraph between blocks and focuses it', async () => {
        const { muya, page } = boot();
        doubleClick(page.domNode!, 125);
        await new Promise(resolve => requestAnimationFrame(resolve));
        expect(muya.getState().map(block => block.name)).toEqual(['paragraph', 'paragraph', 'paragraph']);
        expect(muya.getState().map(block => 'text' in block ? block.text : '')).toEqual(['First paragraph', '', 'Second paragraph']);
        expect(muya.editor.activeContentBlock?.text).toBe('');
        expect(muya.editor.activeContentBlock?.getCursor()?.start.offset).toBe(0);
    });

    it('supports space before the first block and undo restores the original document', async () => {
        const { muya, page } = boot('# Heading\n\nFollowing text\n');
        const before = muya.getMarkdown();
        doubleClick(page.domNode!, 25);
        await new Promise(resolve => requestAnimationFrame(resolve));
        expect(muya.getState()[0]).toEqual({ name: 'paragraph', text: '' });
        muya.undo();
        expect(muya.getMarkdown()).toBe(before);
    });

    it('reuses a neighboring empty paragraph rather than adding another one', async () => {
        const { muya, page } = boot();
        doubleClick(page.domNode!, 125);
        doubleClick(page.domNode!, 125);
        await new Promise(resolve => requestAnimationFrame(resolve));
        expect(muya.getState()).toHaveLength(3);
    });

    it('does not insert when double clicking a text span or comment controls', () => {
        const { muya, page } = boot();
        const before = muya.getMarkdown();
        doubleClick(page.domNode!.querySelector<HTMLElement>('.mu-plain-text')!, 125);
        const footer = document.createElement('div');
        footer.contentEditable = 'false';
        footer.textContent = 'Comment';
        page.domNode!.append(footer);
        doubleClick(footer, 125);
        expect(muya.getMarkdown()).toBe(before);
    });
});
