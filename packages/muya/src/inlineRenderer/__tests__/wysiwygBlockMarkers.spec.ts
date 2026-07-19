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

function bootTable(markdown: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown });
    muya.init();
    hosts.push(muya.domNode);
    const cells = muya.domNode.querySelectorAll<HTMLElement>('.mu-table-cell-content');
    return cells[cells.length - 1];
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

    it('renders a numbered heading with a styled marker and fixed gap', () => {
        const { content } = bootHeading('## 1.2. Numbered heading\n');

        const number = content.querySelector('.mu-heading-number');
        expect(number?.textContent).toBe('1.2.');
        expect(number?.hasAttribute('contenteditable')).toBe(false);
        expect(number?.getAttribute('role')).toBe('button');
        expect(number?.getAttribute('tabindex')).toBe('0');
        expect(number?.getAttribute('aria-label')).toBe('Set Number');
        expect(content.querySelector('.mu-heading-number-gap')?.textContent).toBe(' ');
        expect(content.textContent).toBe('## 1.2. Numbered heading');
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

    it('renders Feishu-style strikethrough with spaces inside the markers', () => {
        const { content, block } = bootParagraph('~~ deleted ~~');

        block.setCursor(5, 5, true);

        expect(content.querySelector('del')?.textContent).toBe(' deleted ');
        expect([...content.querySelectorAll<HTMLElement>('.mu-remove')]
            .map(node => node.textContent)).toEqual(['~~', '~~']);
    });

    it.each(['<br>', '<br/>', '<br />'])(
        'hides the %s source tag while keeping its table-cell line break',
        (tag) => {
            const content = bootTable(`| Column |\n| --- |\n| before${tag}after |\n`);
            const lineBreak = content.querySelector<HTMLElement>('.mu-html-tag');
            const marker = lineBreak?.querySelector<HTMLElement>('.mu-hide');

            expect(marker?.textContent).toBe(tag);
            expect(lineBreak?.querySelector('br')).not.toBeNull();
        },
    );
});
