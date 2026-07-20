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
    it('deletes only the selected text from the inline toolbar', async () => {
        const muya = bootMuya('keep remove keep\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;
        content.setCursor(5, 11, true);
        const toolbar = new InlineFormatToolbar(muya);
        const internals = toolbar as unknown as {
            _block: typeof content;
            _render: () => void;
        };
        internals._block = content;
        internals._render();
        expect(muya.editor.selection.anchor?.offset).toBe(5);
        expect(muya.editor.selection.focus?.offset).toBe(11);
        const cutHandler = vi.spyOn(muya.editor.clipboard, 'cutHandler');

        toolbar.container!
            .querySelector<HTMLElement>('li.item.annotamd_delete_selection')!
            .click();

        expect(cutHandler).toHaveBeenCalledOnce();
        expect(cutHandler.mock.calls[0][0]?.anchor.offset).toBe(5);
        expect(cutHandler.mock.calls[0][0]?.focus.offset).toBe(11);
        expect(cutHandler.mock.calls[0][0]?.isSelectionInSameBlock).toBe(true);
        expect(content.text).toBe('keep  keep');
        await vi.waitFor(() => expect(muya.getMarkdown()).toBe('keep  keep\n'));
    });

    it('deletes a backward selection spanning two paragraphs', async () => {
        const muya = bootMuya('first tail\n\nsecond end\n');
        const first = muya.editor.scrollPage!.firstContentInDescendant()!;
        const second = muya.editor.scrollPage!.lastContentInDescendant()!;
        muya.editor.selection.setSelection(
            { offset: 6, block: second, path: second.path },
            { offset: 5, block: first, path: first.path },
        );
        const toolbar = new InlineFormatToolbar(muya);
        const internals = toolbar as unknown as {
            _block: typeof first;
            _render: () => void;
        };
        internals._block = first;
        internals._render();

        toolbar.container!
            .querySelector<HTMLElement>('li.item.annotamd_delete_selection')!
            .click();

        await vi.waitFor(() => expect(muya.getMarkdown()).toBe('first end\n'));
    });

    it('offers paragraph, H1-H6 and code block, then converts the selected block', async () => {
        const muya = bootMuya('hello world\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;
        content.setCursor(0, 5, true);
        const toolbar = new InlineFormatToolbar(muya);
        const internals = toolbar as unknown as {
            _block: typeof content;
            _render: () => void;
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
            'pre',
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

    it('converts a selected paragraph to a code block without losing text', async () => {
        const muya = bootMuya('hello world\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;
        content.setCursor(0, 5, true);
        const toolbar = new InlineFormatToolbar(muya);
        const internals = toolbar as unknown as {
            _block: typeof content;
            _render: () => void;
        };
        internals._block = content;
        internals._render();

        toolbar.container!.querySelector<HTMLElement>('li.item.text_style')!.click();
        toolbar.container!
            .querySelector<HTMLElement>('[data-paragraph-type="pre"]')!
            .click();

        await vi.waitFor(() => {
            const state = muya.getState()[0] as { name: string; text?: string };
            expect(state.name).toBe('code-block');
            expect(state.text).toBe('hello world');
        });
    });

    it('opens one palette containing both text and background colors', () => {
        const muya = bootMuya('hello world\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;
        content.setCursor(0, 5, true);
        const toolbar = new InlineFormatToolbar(muya);
        const internals = toolbar as unknown as {
            _block: typeof content;
            _render: () => void;
        };
        internals._block = content;
        internals._render();

        for (const icon of [
            'strong',
            'strikethrough',
            'italic',
            'underline',
            'link',
            'inline-code',
            'color',
            'comment',
            'delete',
        ]) {
            expect(toolbar.container!.querySelector(`.mu-action-icon-${icon}`), icon).not.toBeNull();
        }

        toolbar.container!.querySelector<HTMLElement>('li.item.color_palette')!.click();

        expect(toolbar.container!.querySelectorAll('.mu-color-palette')).toHaveLength(1);
        expect(toolbar.container!.querySelectorAll('.mu-color-palette-section')).toHaveLength(2);
        expect(toolbar.container!.textContent).toContain('Font Color');
        expect(toolbar.container!.textContent).toContain('Background Color');
    });

    it('opens a link input before creating a link from selected text', async () => {
        const muya = bootMuya('hello world\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;
        content.setCursor(0, 5, true);
        const toolbar = new InlineFormatToolbar(muya);
        const internals = toolbar as unknown as {
            _block: typeof content;
            _render: () => void;
        };
        internals._block = content;
        internals._render();

        toolbar.container!.querySelector<HTMLElement>('li.item.link')!.click();

        expect(muya.getMarkdown()).toBe('hello world\n');
        muya.eventCenter.emit('muya-format-picker', { reference: null, block: null });
        const input = toolbar.container!.querySelector<HTMLInputElement>('.mu-link-create-input')!;
        const confirm = toolbar.container!.querySelector<HTMLButtonElement>('.mu-link-create-confirm')!;
        expect(input.placeholder).toBe('Paste or enter link');
        expect(confirm.disabled).toBe(true);

        input.value = 'https://example.com';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(confirm.disabled).toBe(false);
        confirm.click();

        await vi.waitFor(() => expect(muya.getMarkdown()).toBe('[hello](https://example.com) world\n'));
        expect(toolbar.status).toBe(false);
    });
});
