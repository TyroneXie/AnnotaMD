// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import type { Muya } from '../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../muya';
import { SelectionCaretType, SelectionDirection } from '../../selection/types';

// muyajs `pasteCtrl` MERGE semantics ported into @muyajs/core: pasting a
// paragraph into a non-empty text block merges its first paragraph inline
// (head + pasted + tail) instead of inserting it as a separate block below;
// the trailing text of the anchor is sewn onto the last pasted block; a
// multi-line paragraph pasted into a heading keeps only its first line in the
// heading; a same-type list pasted into a list item merges into that list.

vi.mock('../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => null,
    search: () => [],
}));

// normalizePastedHTML uses DOMPurify which needs a richer DOM than happy-dom
// gives; we only paste plain-text markdown here, so pass the html through.
vi.mock('../../utils/paste', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/paste')>();
    return { ...actual, normalizePastedHTML: async (html: string) => html };
});

const bootedHosts: HTMLElement[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string, options: Record<string, unknown> = {}): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, { markdown, ...options } as ConstructorParameters<typeof MuyaClass>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function contentBlocks(muya: Muya): Content[] {
    const out: Content[] = [];
    let c: Content | null = muya.editor.scrollPage!.firstContentInDescendant();
    while (c) {
        out.push(c);
        c = c.nextContentInContext() ?? null;
    }
    return out;
}

function stubSelection(muya: Muya, block: Content, start: number, end: number) {
    const path = block.path;
    muya.editor.selection.getSelection = () => ({
        anchor: { offset: start, block, path },
        focus: { offset: end, block, path },
        isCollapsed: start === end,
        isSelectionInSameBlock: true,
        direction: SelectionDirection.FORWARD,
        type: SelectionCaretType.RANGE,
    });
}

function pasteEvent(text: string, html = '') {
    return {
        preventDefault() {},
        stopPropagation() {},
        clipboardData: {
            getData: (t: string) => (t === 'text/plain' ? text : t === 'text/html' ? html : ''),
            files: [],
            items: [],
        },
    } as unknown as ClipboardEvent;
}

async function paste(
    muya: Muya,
    block: Content,
    start: number,
    end: number,
    text: string,
    html = '',
): Promise<string> {
    stubSelection(muya, block, start, end);
    await muya.editor.clipboard.pasteHandler(pasteEvent(text, html), text, html);
    await new Promise(r => setTimeout(r, 40));
    return muya.getMarkdown();
}

describe('paste — paragraph merges inline into a non-empty text block (A3)', () => {
    it('pasting a paragraph at the cursor merges it into the paragraph', async () => {
        const muya = bootMuya('foobar\n');
        const block = contentBlocks(muya)[0];
        expect(await paste(muya, block, 3, 3, 'hello')).toBe('foohellobar\n');
    });

    it('pasting over a selection replaces it inline (A4)', async () => {
        const muya = bootMuya('foobar\n');
        const block = contentBlocks(muya)[0];
        expect(await paste(muya, block, 3, 5, 'X')).toBe('fooXr\n');
    });

    it('pasting multiple paragraphs merges the first and sews the tail onto the last', async () => {
        const muya = bootMuya('foobar\n');
        const block = contentBlocks(muya)[0];
        expect(await paste(muya, block, 3, 3, 'one\n\ntwo')).toBe('fooone\n\ntwobar\n');
    });
});

describe('paste — multi-line paragraph into a heading keeps only the first line (A6)', () => {
    it('only the first soft-line lands in the heading, the rest become a paragraph', async () => {
        const muya = bootMuya('# Title\n');
        const block = contentBlocks(muya)[0]; // atx-heading content, text '# Title'
        expect(await paste(muya, block, block.text.length, block.text.length, 'a\nb\nc')).toBe(
            '# Titlea\n\nb\nc\n',
        );
    });

    it('pasting multiple paragraphs mid-heading sews the heading tail after the paste', async () => {
        const muya = bootMuya('# hello world\n');
        const block = contentBlocks(muya)[0]; // '# hello world'
        // cursor between 'hello ' and 'world' (offset 8); 'world' must trail the
        // whole paste, not stay in the heading.
        expect(await paste(muya, block, 8, 8, 'A\n\nB')).toBe('# hello A\n\nBworld\n');
    });

    it('pasting a single paragraph mid-heading keeps it on the heading line', async () => {
        const muya = bootMuya('# hello world\n');
        const block = contentBlocks(muya)[0];
        expect(await paste(muya, block, 8, 8, 'A')).toBe('# hello Aworld\n');
    });

    it('a multi-line paragraph pasted into a SETEXT heading stays one block (only atx splits)', async () => {
        const muya = bootMuya('Title\n===\n');
        const block = contentBlocks(muya)[0]; // setext-heading content 'Title'
        const md = await paste(muya, block, block.text.length, block.text.length, 'aaa\nbbb');
        // muyajs keeps the whole paragraph inside the setext heading — one block.
        expect(muya.editor.scrollPage!.length()).toBe(1);
        expect(md).toContain('Titleaaa');
        expect(md).toContain('bbb');
    });
});

describe('paste — NEWLINE into an emptied non-paragraph wrapper (muyajs removeBlock parity)', () => {
    it('removes the emptied heading wrapper instead of leaving a stray empty block', async () => {
        const muya = bootMuya('# heading\n');
        const block = contentBlocks(muya)[0];
        // cursor before the heading text (offset 0); paste a non-mergeable block.
        await paste(muya, block, 0, 0, '---');
        // muyajs's NEWLINE branch removes the now-empty wrapper unconditionally;
        // the heading must not linger as a stray empty block.
        expect(muya.editor.scrollPage!.length()).toBe(1);
    });
});

// marktext #3848: pasting a URL (which the clipboard delivers as a smart-link
// `[Title](url)`) inside an existing link's parentheses `[text](|)` produced a
// nested `[text]([Title](url))`. When the caret is in a link destination, a
// pasted whole markdown link should contribute only its URL.
describe('paste — markdown link into a link destination uses only the URL (#3848)', () => {
    it('pasting `[title](url)` inside `[text](|)` yields `[text](url)`, not a nested link', async () => {
        const muya = bootMuya('[my text]()\n');
        const block = contentBlocks(muya)[0];
        // caret between the parentheses of `[my text]()` (offset 10)
        const md = await paste(muya, block, 10, 10, '[Some Page Title](https://example.com/page)');
        expect(md).toBe('[my text](https://example.com/page)\n');
    });
});

describe('paste — a standalone bare URL resolves to title view with a link fallback', () => {
    it('keeps the URL label when no title is available', async () => {
        const onlineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
        const muya = bootMuya('\n');
        const block = contentBlocks(muya)[0];
        const url = 'https://example.com/page';

        expect(await paste(muya, block, 0, 0, url)).toBe(`[${url}](${url})\n`);
        onlineSpy.mockRestore();
    });

    it('shows a loading link immediately and replaces it when metadata resolves', async () => {
        const url = 'https://example.com/page';
        let finish!: (value: { title: string; icon: string }) => void;
        const resolveLinkMetadata = vi.fn(() => new Promise<{ title: string; icon: string }>((resolve) => {
            finish = resolve;
        }));
        const muya = bootMuya('\n', { resolveLinkMetadata });
        const block = contentBlocks(muya)[0];

        expect(await paste(muya, block, 0, 0, url)).toBe(`[${url}](${url})\n`);
        expect(resolveLinkMetadata).toHaveBeenCalledWith(url);
        expect(muya.domNode.querySelector('.mu-link-title-loading')).not.toBeNull();

        finish({ title: 'Example Page', icon: 'https://example.com/favicon.ico' });
        await vi.waitFor(() => {
            expect(muya.getMarkdown()).toBe(`[Example Page](${url})\n`);
        });
        expect(muya.domNode.querySelector('.mu-link-title-loading')).toBeNull();
    });

    it('automatically resolves a shortened rich-link label pasted on its own line', async () => {
        const url = 'https://www.msn.cn/zh-cn/news/example/article-id';
        const shortLabel = 'msn.cn/zh-cn/news/example/article-id';
        const resolveLinkMetadata = vi.fn(async () => ({ title: 'Example Article Title' }));
        const muya = bootMuya('\n', { resolveLinkMetadata });
        const block = contentBlocks(muya)[0];

        expect(await paste(
            muya,
            block,
            0,
            0,
            shortLabel,
            `<a href="${url}">${shortLabel}</a>`,
        )).toBe(`[Example Article Title](${url})\n`);
        expect(resolveLinkMetadata).toHaveBeenCalledWith(url);
    });

    it('recognizes and resolves a root URL with a trailing slash', async () => {
        const url = 'https://www.piaohua.com/';
        const resolveLinkMetadata = vi.fn(async () => ({ title: 'Piaohua' }));
        const muya = bootMuya('\n', { resolveLinkMetadata });
        const block = contentBlocks(muya)[0];

        expect(await paste(muya, block, 0, 0, url)).toBe(`[Piaohua](${url})\n`);
        expect(resolveLinkMetadata).toHaveBeenCalledWith(url);
    });

    it('does not replace selected text with a fetched page title', async () => {
        const url = 'https://example.com/page';
        const resolveLinkMetadata = vi.fn(async () => ({ title: 'Example Page' }));
        const muya = bootMuya('selected\n', { resolveLinkMetadata });
        const block = contentBlocks(muya)[0];

        expect(await paste(muya, block, 0, 8, url)).toBe(`[${url}](${url})\n`);
        expect(resolveLinkMetadata).not.toHaveBeenCalled();
    });

    it('does not auto-title a URL pasted beside existing text', async () => {
        const url = 'https://example.com/page';
        const resolveLinkMetadata = vi.fn(async () => ({ title: 'Example Page' }));
        const muya = bootMuya('prefix \n', { resolveLinkMetadata });
        const block = contentBlocks(muya)[0];

        expect(await paste(muya, block, 7, 7, url)).toBe(`prefix [${url}](${url})\n`);
        expect(resolveLinkMetadata).not.toHaveBeenCalled();
    });

    it('stops loading after eight seconds and keeps the link when metadata times out', async () => {
        const url = 'https://example.com/slow';
        const resolveLinkMetadata = vi.fn(() => new Promise<never>(() => {}));
        const muya = bootMuya('\n', { resolveLinkMetadata });
        const block = contentBlocks(muya)[0];
        vi.useFakeTimers();
        try {
            stubSelection(muya, block, 0, 0);
            await muya.editor.clipboard.pasteHandler(pasteEvent(url), url, '');
            await vi.advanceTimersByTimeAsync(50);
            expect(muya.getMarkdown()).toBe(`[${url}](${url})\n`);
            expect(muya.domNode.querySelector('.mu-link-title-loading')).not.toBeNull();

            await vi.advanceTimersByTimeAsync(7950);
            expect(muya.getMarkdown()).toBe(`[${url}](${url})\n`);
            expect(muya.domNode.querySelector('.mu-link-title-loading')).toBeNull();
        }
        finally {
            vi.useRealTimers();
        }
    });
});
