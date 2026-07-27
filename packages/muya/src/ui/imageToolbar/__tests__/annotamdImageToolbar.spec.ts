// @vitest-environment happy-dom

import type Format from '../../../block/base/format';
import type { ImageToken } from '../../../inlineRenderer/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { getImageInfo } from '../../../utils/image';
import { ImageToolBar } from '../index';

const muyas: Muya[] = [];
const toolbars: ImageToolBar[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (toolbars.length)
        toolbars.pop()!.destroy();
    while (muyas.length)
        muyas.pop()!.destroy();
    delete (window as Partial<Window>).MUYA_VERSION;
});

function setup(markdown: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    muyas.push(muya);

    const block = muya.editor.scrollPage!.firstContentInDescendant() as Format;
    const wrapper = muya.domNode.querySelector<HTMLElement>('.mu-inline-image')!;
    const imageInfo = getImageInfo(wrapper);
    const toolbar = new ImageToolBar(muya);
    toolbars.push(toolbar);
    Object.assign(toolbar as unknown as {
        _block: Format;
        _imageInfo: { token: ImageToken; imageId: string };
        _reference: HTMLElement;
    }, {
        _block: block,
        _imageInfo: imageInfo,
        _reference: wrapper,
    });
    (toolbar as unknown as { _render: () => void })._render();
    return { block, imageInfo, muya, toolbar };
}

describe('AnnotaMD image toolbar', () => {
    it('exposes accessible image actions and the active alignment', () => {
        const { toolbar } = setup('![alt](https://example.com/image.png)\n');
        const items = toolbar.container!.querySelectorAll<HTMLElement>('li.item');

        expect(items).toHaveLength(6);
        expect(Array.from(items).every(item => item.getAttribute('role') === 'button')).toBe(true);
        expect(Array.from(items).every(item => item.getAttribute('tabindex') === '0')).toBe(true);
        expect(toolbar.container!.querySelector('.center')?.getAttribute('aria-pressed')).toBe('true');
        expect(toolbar.container!.querySelector('.inline')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('toggles an active inline image back to a centered block image from the keyboard', async () => {
        const { muya, toolbar } = setup(
            '<img src="https://example.com/image.png" data-align="inline" />\n',
        );
        toolbar.container!.querySelector<HTMLElement>('.inline')!.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );

        await expect.poll(() => muya.getMarkdown()).toContain('data-align="center"');
        expect(muya.getMarkdown()).not.toContain('data-align="inline"');
    });

    it('hides the text format toolbar before it opens', async () => {
        const { block, imageInfo, muya, toolbar } = setup(
            '![alt](https://example.com/image.png)\n',
        );
        const formatToolbar = {
            name: 'mu-format-picker',
            status: true,
            hide: vi.fn(),
        };
        muya.ui.shownFloat.add(
            formatToolbar as unknown as Parameters<typeof muya.ui.shownFloat.add>[0],
        );

        muya.eventCenter.emit('muya-image-toolbar', {
            block,
            reference: toolbar.container!,
            imageInfo,
        });

        await expect.poll(() => formatToolbar.hide).toHaveBeenCalledTimes(1);
    });
});
