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
});
