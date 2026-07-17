// @vitest-environment happy-dom

import type Format from '../format';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../../muya';

const hosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    hosts.splice(0).forEach(host => host.remove());
    document.getSelection()?.removeAllRanges();
});

function firstContent(markdown: string): Format {
    const host = document.createElement('div');
    document.body.appendChild(host);
    hosts.push(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    return muya.editor.scrollPage!.firstContentInDescendant() as unknown as Format;
}

describe('direct emoji insertion', () => {
    it('replaces the starter colon with the selected Markdown emoji alias', () => {
        const content = firstContent(':\n');
        content.setCursor(1, 1, true);

        content.setEmoji('sparkles');

        expect(content.text).toBe(':sparkles:');
        expect(content.getCursor()?.start.offset).toBe(10);
    });
});
