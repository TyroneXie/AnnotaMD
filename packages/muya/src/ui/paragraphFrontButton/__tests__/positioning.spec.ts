// @vitest-environment happy-dom

import type { Muya } from '../../../index';
import { afterEach, describe, expect, it } from 'vitest';
import { ParagraphFrontButton, frontButtonMainAxis } from '../index';

const buttons: ParagraphFrontButton[] = [];

afterEach(() => {
    while (buttons.length)
        buttons.pop()!.destroy();
    document.body.innerHTML = '';
});

describe('paragraph front button positioning', () => {
    it('keeps the code-block menu next to the block despite its tall header padding', () => {
        expect(frontButtonMainAxis('code-block', 40, false)).toBe(8);
    });

    it('preserves the existing padding-aware offset for other blocks', () => {
        expect(frontButtonMainAxis('paragraph', 0, false)).toBe(8);
        expect(frontButtonMainAxis('order-list', 12, true)).toBe(32);
    });

    it('reserves room for the disclosure triangle beside a heading', () => {
        expect(frontButtonMainAxis('atx-heading', 0, false, true)).toBe(26);
    });

    it('replaces a stale front button owned by the same editor root', () => {
        const root = document.createElement('div');
        document.body.appendChild(root);
        const muya = {
            domNode: root,
            eventCenter: {
                attachDOMEvent: () => '',
                detachDOMEvent: () => {},
                emit: () => {},
            },
        } as unknown as Muya;

        buttons.push(new ParagraphFrontButton(muya));
        buttons.push(new ParagraphFrontButton(muya));

        expect(document.querySelectorAll('.mu-front-button-wrapper')).toHaveLength(1);
    });
});
