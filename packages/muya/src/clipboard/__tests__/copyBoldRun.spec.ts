// @vitest-environment jsdom

import type { Muya } from '../../muya';
import { describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../muya';

// Regression (#strong-copy): copying a bold run produced `**Hermes 怎么修、
// 怎么验收` — the opening `**` came along but its closing twin did not, so the
// paste landed as literal asterisks plus text.
//
// Two DOM facts caused it: the markers render as zero-size `.mu-hide` spans
// (a drag cannot reach the closing one), and an element-level selection anchor
// at the block start used to be read as a character offset (`0..3`).

vi.mock('../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => null,
    search: () => [],
}));

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, { markdown } as ConstructorParameters<typeof MuyaClass>[1]);
    muya.init();
    return muya;
}

function copyWithRange(muya: Muya, range: Range): string {
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    return muya.editor.clipboard.getClipboardData().text;
}

function contentSpan(muya: Muya): HTMLElement {
    return muya.editor.scrollPage!.firstContentInDescendant()!.domNode as HTMLElement;
}

describe('copying a bold run keeps the markdown balanced', () => {
    it('selects the visible text of a bold-only paragraph', () => {
        const markdown = '**Hermes 怎么修、怎么验收**\n';
        const muya = bootMuya(markdown);
        const span = contentSpan(muya);
        const textNode = span.querySelector('strong .mu-plain-text')!.firstChild as Text;

        const range = document.createRange();
        range.setStart(span, 0);
        range.setEnd(textNode, textNode.length);

        expect(copyWithRange(muya, range)).toBe('**Hermes 怎么修、怎么验收**');
    });

    it('selects the whole paragraph element (element-level endpoints)', () => {
        const muya = bootMuya('**Hermes 怎么修、怎么验收**\n');
        const range = document.createRange();
        range.selectNodeContents(contentSpan(muya));

        expect(copyWithRange(muya, range)).toBe('**Hermes 怎么修、怎么验收**');
    });

    it('selects a bold run inside a sentence', () => {
        const muya = bootMuya('前文 **Hermes 怎么修** 后文\n');
        const textNode = contentSpan(muya)
            .querySelector('strong .mu-plain-text')!
            .firstChild as Text;

        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, textNode.length);

        expect(copyWithRange(muya, range)).toBe('**Hermes 怎么修**');
    });

    it('copies plain text when only part of the run is selected', () => {
        const muya = bootMuya('**Hermes 怎么修、怎么验收**\n');
        const textNode = contentSpan(muya)
            .querySelector('strong .mu-plain-text')!
            .firstChild as Text;

        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 4);

        expect(copyWithRange(muya, range)).toBe('Herm');
    });
});
