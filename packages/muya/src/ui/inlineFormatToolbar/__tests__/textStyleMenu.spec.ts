// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { InlineFormatToolbar } from '../index';

const bootedHosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
    if (typeof globalThis.ResizeObserver === 'undefined') {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        } as never;
    }
});

afterEach(() => {
    while (bootedHosts.length) bootedHosts.pop()!.remove();
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

describe('inline format toolbar text-style menu', () => {
    it('offers paragraph and H1-H6, then converts the selected block', async () => {
        const muya = bootMuya('hello world\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;
        content.setCursor(0, 5, true);
        const toolbar = new InlineFormatToolbar(muya);
        const internals = toolbar as unknown as {
            _block: typeof content
            _render: () => void
        };
        internals._block = content;
        internals._render();

        toolbar.container!.querySelector<HTMLElement>('li.item.text_style')!.click();
        const options = [...toolbar.container!.querySelectorAll<HTMLElement>('[data-paragraph-type]')]
            .map(element => element.dataset.paragraphType);
        expect(options).toEqual([
            'paragraph',
            'heading 1',
            'heading 2',
            'heading 3',
            'heading 4',
            'heading 5',
            'heading 6',
        ]);

        toolbar.container!
            .querySelector<HTMLElement>('[data-paragraph-type="heading 2"]')!
            .click();

        await vi.waitFor(() => {
            const state = muya.getState()[0] as { name: string; meta?: { level?: number } };
            expect(state.name).toBe('atx-heading');
            expect(state.meta?.level).toBe(2);
        });
    });
});
