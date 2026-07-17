// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';

const hosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    hosts.splice(0).forEach(host => host.remove());
    document.getSelection()?.removeAllRanges();
});

describe('initial preview focus', () => {
    it('keeps a leading HTML block rendered until the user explicitly edits it', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        hosts.push(host);
        const muya = new Muya(host, {
            markdown: '<h1 align="center">AnnotaMD</h1>\n\nFollowing text\n',
        } as ConstructorParameters<typeof Muya>[1]);

        muya.init();

        expect(muya.editor.activeContentBlock).toBeNull();
        expect(muya.domNode.querySelector('figure.mu-html-block')?.classList.contains('mu-active')).toBe(false);
        expect(muya.domNode.querySelector('.mu-html-preview')).not.toBeNull();
    });
});
