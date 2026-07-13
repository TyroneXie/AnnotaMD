// @vitest-environment happy-dom

import type Parent from '../../../block/base/parent';
import type { Muya as MuyaType } from '../../../index';
import { afterEach, describe, expect, it } from 'vitest';
import { canTurnInto } from '../../../block/blockTransforms';
import { Muya } from '../../../muya';
import { frontButtonMainAxis, frontButtonTarget, ParagraphFrontButton } from '../index';

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

    it.each(['order-list', 'bullet-list', 'task-list'])(
        'keeps the front button outside the %s item marker gutter',
        (blockName) => {
            expect(frontButtonMainAxis(blockName, 0, false, false, true)).toBe(30);
        },
    );

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
        } as unknown as MuyaType;

        buttons.push(new ParagraphFrontButton(muya));
        buttons.push(new ParagraphFrontButton(muya));

        expect(document.querySelectorAll('.mu-front-button-wrapper')).toHaveLength(1);
    });

    it('targets the hovered list item instead of the whole list container', () => {
        window.MUYA_VERSION = 'test';
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: '- first\n- second\n' });
        muya.init();
        const list = muya.editor.scrollPage!.firstChild as Parent;
        const secondItem = list.find(1) as Parent;
        expect(frontButtonTarget([secondItem.domNode!, list.domNode!])).toBe(secondItem);
    });

    it('targets an inner text block inside a highlight container and forbids nested highlights', () => {
        window.MUYA_VERSION = 'test';
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: '> [!HIGHLIGHT]\n> Inside\n' });
        muya.init();
        const highlight = muya.editor.scrollPage!.firstChild as Parent;
        const paragraph = highlight.firstChild as Parent;

        expect(frontButtonTarget([paragraph.domNode!, highlight.domNode!])).toBe(paragraph);
        expect(canTurnInto(paragraph, 'highlight-block')).toBe(false);
        expect(canTurnInto(paragraph, 'atx-heading 2')).toBe(true);
    });
});
