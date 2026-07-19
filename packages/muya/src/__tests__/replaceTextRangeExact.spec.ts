// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../muya';

describe('Muya.replaceTextRangeExact', () => {
    let muya: Muya;
    let host: HTMLElement;

    beforeEach(() => {
        window.MUYA_VERSION = 'test';
        host = document.createElement('div');
        document.body.appendChild(host);
        muya = new Muya(host, { markdown: 'same\n\nsame\n' });
        muya.init();
    });

    afterEach(() => {
        muya.destroy();
        host.remove();
    });

    it('replaces only the exact anchored repeated text', () => {
        const second = muya.editor.scrollPage!.find(1)!.firstContentInDescendant()!;

        expect(muya.replaceTextRangeExact({
            anchor: { offset: 0 },
            focus: { offset: 4 },
            anchorPath: second.path,
            focusPath: second.path,
        }, 'same', 'changed')).toBe(true);
        return vi.waitFor(() => expect(muya.getMarkdown()).toBe('same\n\nchanged\n'));
    });

    it('refuses to edit when the commented text no longer matches', () => {
        const second = muya.editor.scrollPage!.find(1)!.firstContentInDescendant()!;

        expect(muya.replaceTextRangeExact({
            anchor: { offset: 0 },
            focus: { offset: 4 },
            anchorPath: second.path,
            focusPath: second.path,
        }, 'other', 'changed')).toBe(false);
        expect(muya.getMarkdown()).toBe('same\n\nsame\n');
    });
});
