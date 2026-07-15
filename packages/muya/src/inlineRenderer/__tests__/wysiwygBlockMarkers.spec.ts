// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';

const hosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (hosts.length) hosts.pop()!.remove();
});

function bootHeading(markdown: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown });
    muya.init();
    hosts.push(muya.domNode);
    const heading = muya.domNode.querySelector<HTMLElement>('.mu-atx-heading')!;
    const content = heading.querySelector<HTMLElement>('.mu-atxheading-content')!;
    const block = (content as HTMLElement & {
        __MUYA_BLOCK__: { text: string; setCursor: (start: number, end: number, render: boolean) => void };
    }).__MUYA_BLOCK__;
    return { heading, content, block };
}

function bootParagraph(markdown: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown });
    muya.init();
    hosts.push(muya.domNode);
    const content = muya.domNode.querySelector<HTMLElement>('.mu-paragraph-content')!;
    const block = (content as HTMLElement & {
        __MUYA_BLOCK__: { text: string; setCursor: (start: number, end: number, render: boolean) => void };
    }).__MUYA_BLOCK__;
    return { content, block };
}

describe('Feishu-style block editing markers', () => {
    it('keeps the leading heading hashes hidden when the caret is inside them', () => {
        const { content, block } = bootHeading('### Heading\n');

        block.setCursor(0, 0, true);

        const leadingMarker = [...content.querySelectorAll<HTMLElement>('.mu-remove')]
            .find(node => node.textContent === '###')!;
        expect(leadingMarker.classList.contains('mu-hide')).toBe(true);
        expect(leadingMarker.classList.contains('mu-gray')).toBe(false);
    });

    it('keeps optional trailing heading hashes hidden when the caret reaches them', () => {
        const { content, block } = bootHeading('### Heading ###\n');

        block.setCursor(block.text.length, block.text.length, true);

        const trailingMarker = [...content.querySelectorAll<HTMLElement>('.mu-remove')]
            .filter(node => node.textContent?.includes('#'))
            .at(-1)!;
        expect(trailingMarker.classList.contains('mu-hide')).toBe(true);
        expect(trailingMarker.classList.contains('mu-gray')).toBe(false);
    });

    it.each([
        ['link', '[label](https://example.com)', 3],
        ['inline code', '`code`', 3],
        ['strong', '**bold**', 4],
        ['emphasis', '*italic*', 4],
        ['strikethrough', '~~deleted~~', 5],
    ])('keeps %s source markers hidden while its rendered content is active', (_name, markdown, offset) => {
        const { content, block } = bootParagraph(markdown);

        block.setCursor(offset, offset, true);

        const markers = [...content.querySelectorAll<HTMLElement>('.mu-remove')];
        expect(markers.length).toBeGreaterThan(0);
        for (const marker of markers) {
            expect(marker.classList.contains('mu-hide'), marker.textContent ?? '').toBe(true);
            expect(marker.classList.contains('mu-gray'), marker.textContent ?? '').toBe(false);
        }
    });

    it('keeps empty-label link brackets hidden while rendering its destination', () => {
        const { content, block } = bootParagraph('[](https://example.com)');

        block.setCursor(4, 4, true);

        const markers = [...content.querySelectorAll<HTMLElement>('.mu-remove')];
        expect(markers.length).toBeGreaterThan(0);
        for (const marker of markers)
            expect(marker.classList.contains('mu-hide'), marker.textContent ?? '').toBe(true);
    });

});
