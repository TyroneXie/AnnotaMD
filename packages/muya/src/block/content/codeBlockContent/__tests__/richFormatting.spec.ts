// @vitest-environment happy-dom

import type Format from '../../../base/format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../../muya';

const hosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (hosts.length) hosts.pop()!.remove();
    document.getSelection()?.removeAllRanges();
});

function bootCode(text: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown: `\`\`\`\n${text}\n\`\`\`\n` });
    muya.init();
    hosts.push(muya.domNode);
    const content = muya.editor.scrollPage!.lastContentInDescendant() as Format;
    return { muya, content };
}

function select(content: Format, start: number, end: number) {
    content.setCursor(start, start, true);
    vi.spyOn(content, 'getCursor').mockReturnValue({
        start: { offset: start },
        end: { offset: end },
        anchor: { offset: start },
        focus: { offset: end },
        isCollapsed: false,
        isSelectionInSameBlock: true,
        direction: 'forward',
        type: 'Range',
    } as ReturnType<Format['getCursor']>);
}

describe('code block rich formatting', () => {
    it('uses the shared selection toolbar event path', async () => {
        const { muya, content } = bootCode('plain text');
        select(content, 0, 5);
        const emit = vi.spyOn(muya.eventCenter, 'emit');

        const event = new MouseEvent('click');
        Object.defineProperty(event, 'target', { value: content.domNode });
        Object.assign(event, { x: 0, y: 0 });
        content.clickHandler(event);

        await vi.waitFor(() => {
            expect(emit).toHaveBeenCalledWith('muya-format-picker', expect.objectContaining({ block: content }));
        });
    });

    it.each([
        ['strong', '**plain** text'],
        ['em', '*plain* text'],
        ['del', '~~plain~~ text'],
        ['u', '<u>plain</u> text'],
        ['text_color', '<span style="color: #3370ff">plain</span> text'],
        ['background_color', '<span style="background-color: #fff2b8">plain</span> text'],
    ])('applies %s to the selected code text and keeps it in fenced source', async (type, expected) => {
        const { muya, content } = bootCode('plain text');
        select(content, 0, 5);

        content.format(type, type === 'text_color'
            ? '#3370ff'
            : type === 'background_color'
                ? '#fff2b8'
                : undefined);

        expect(content.text).toBe(expected);
        await vi.waitFor(() => expect(muya.getMarkdown()).toContain(expected));
    });

    it('renders spaced strikethrough markers as rich text in a code block', () => {
        const { content } = bootCode('~~ deleted ~~');

        expect(content.domNode!.querySelector('del')?.textContent).toBe(' deleted ');
        expect([...content.domNode!.querySelectorAll<HTMLElement>('.mu-remove')]
            .map(node => node.textContent)).toEqual(['~~', '~~']);
    });
});
