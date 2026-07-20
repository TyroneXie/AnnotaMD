// @vitest-environment happy-dom
import type Format from '../../../block/base/format';
import type { Muya } from '../../../muya';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventCenter from '../../../event';
import LinkTools from '../index';

// P3 defensive lock for marktext `1ef0d016` (link tools).
// The new linkTools subscriber + `selectItem` dispatcher is fully staged
// in muya but there's no emitter for `muya-link-tools` yet, so neither
// the unlink path is exercised end-to-end. Without a test pinning the
// dispatch, a future refactor could silently
// regress the structure when the wiring is finally completed.
//
// These tests stub the floating-tool DOM surface and the eventCenter,
// then poke `selectItem` directly to verify each branch dispatches to
// the right collaborator.

// White-box view onto LinkTools' private render state, which these tests
// inject directly to exercise `selectItem`'s dispatch branches.
interface ILinkToolsView {
    _linkBlock: Format | null;
    _linkInfo: {
        href?: string | null;
        text?: string;
        raw?: string;
        range?: { start: number; end: number } | null;
    } | null;
    _draftText: string;
    _draftHref: string;
    selectItem: (event: Event, item: { type: string; icon: string; tooltip?: string }) => void;
    render: () => void;
    container: HTMLElement | null;
    floatBox: HTMLElement | null;
    status: boolean;
    destroy: () => void;
}

interface ITestSession {
    muya: Muya;
    tools: ILinkToolsView;
    domNode: HTMLElement;
}

const sessions: ITestSession[] = [];

function makeFakeMuya(): { muya: Muya; domNode: HTMLElement } {
    const eventCenter = new EventCenter();
    const domNode = document.createElement('div');
    document.body.appendChild(domNode);
    // BaseFloat.listen() attaches a scroll handler to `domNode.parentElement`,
    // so `domNode` needs a parent — `document.body` here.
    const muya = {
        eventCenter,
        domNode,
        i18n: { t: (key: string) => key },
        options: {},
    } as unknown as Muya;
    return { muya, domNode };
}

interface ILinkToolsTestOptions {
    jumpClick?: (linkInfo: unknown) => void;
}

function bootLinkTools(options: ILinkToolsTestOptions = {}): ITestSession {
    const { muya, domNode } = makeFakeMuya();
    const tools = new LinkTools(muya, options) as unknown as ILinkToolsView;
    const session = { muya, tools, domNode };
    sessions.push(session);
    return session;
}

function makeFakeEvent() {
    return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as Event;
}

afterEach(() => {
    // Tear each session down: detach DOM listeners attached via EventCenter,
    // destroy the floating-tool DOM (resize observers + floatBox), and
    // unmount the host node from document.body. This prevents listener /
    // node leakage across tests in the same worker.
    while (sessions.length) {
        const { muya, tools, domNode } = sessions.pop()!;
        tools.destroy();
        muya.eventCenter.detachAllDomEvents();
        domNode.remove();
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('linkTools hover lifecycle', () => {
    it('cancels a pending hide when the pointer enters a link again', async () => {
        vi.useFakeTimers();
        const { muya, tools } = bootLinkTools();
        const first = document.createElement('span');
        const second = document.createElement('span');

        muya.eventCenter.emit('muya-link-tools', {
            reference: first,
            linkInfo: { href: 'https://first.example', text: 'first' },
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(tools.status).toBe(true);

        muya.eventCenter.emit('muya-link-tools', { reference: null });
        await vi.advanceTimersByTimeAsync(300);
        muya.eventCenter.emit('muya-link-tools', {
            reference: second,
            linkInfo: { href: 'https://second.example', text: 'second' },
        });
        await vi.advanceTimersByTimeAsync(600);

        expect(tools.status).toBe(true);
        expect(tools.container!.querySelector('.link-address-text')?.textContent)
            .toBe('https://second.example');
    });

    it('keeps the toolbar open while crossing from the link into the toolbar', async () => {
        vi.useFakeTimers();
        const { muya, tools } = bootLinkTools();
        const link = document.createElement('span');

        muya.eventCenter.emit('muya-link-tools', {
            reference: link,
            linkInfo: { href: 'https://example.com', text: 'example' },
        });
        await vi.advanceTimersByTimeAsync(0);
        muya.eventCenter.emit('muya-link-tools', { reference: null });
        await vi.advanceTimersByTimeAsync(300);
        tools.container!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await vi.advanceTimersByTimeAsync(600);

        expect(tools.status).toBe(true);
    });

    it('does not hide immediately when crossing from the toolbar back to the link', async () => {
        vi.useFakeTimers();
        const { muya, tools } = bootLinkTools();
        const link = document.createElement('span');

        muya.eventCenter.emit('muya-link-tools', {
            reference: link,
            linkInfo: { href: 'https://example.com', text: 'example' },
        });
        await vi.advanceTimersByTimeAsync(0);
        tools.container!.dispatchEvent(new MouseEvent('mouseleave'));
        await vi.advanceTimersByTimeAsync(300);
        muya.eventCenter.emit('muya-link-tools', {
            reference: link,
            linkInfo: { href: 'https://example.com', text: 'example' },
        });
        await vi.advanceTimersByTimeAsync(600);

        expect(tools.status).toBe(true);
    });

    it('ignores a delayed hide while the browser still reports the link as hovered', async () => {
        vi.useFakeTimers();
        const { muya, tools } = bootLinkTools();
        const link = document.createElement('span');
        vi.spyOn(link, 'matches').mockImplementation(selector => selector === ':hover');

        muya.eventCenter.emit('muya-link-tools', {
            reference: link,
            linkInfo: { href: 'https://example.com', text: 'example' },
        });
        await vi.advanceTimersByTimeAsync(0);
        muya.eventCenter.emit('muya-link-tools', { reference: null });
        await vi.advanceTimersByTimeAsync(600);

        expect(tools.status).toBe(true);
    });
});

describe('linkTools.selectItem — edit and unlink', () => {
    it('unlink: routes to block.unlink with { range, text } from linkInfo', () => {
        const { tools } = bootLinkTools();
        const blockUnlink = vi.fn();
        // linkBlock is typed as Format | null; the fake only implements
        // `unlink` (the only method selectItem calls).
        tools._linkBlock = { unlink: blockUnlink } as unknown as Format;
        tools._linkInfo = {
            href: 'https://example.com',
            text: 'hi',
            raw: '[hi](https://example.com)',
            range: { start: 5, end: 30 },
        };

        tools.selectItem(makeFakeEvent(), { type: 'unlink', icon: '' });

        expect(blockUnlink).toHaveBeenCalledTimes(1);
        expect(blockUnlink).toHaveBeenCalledWith({
            range: { start: 5, end: 30 },
            text: 'hi',
        });
    });

    it('unlink: no-ops when block is missing (defensive)', () => {
        const { tools } = bootLinkTools();
        tools._linkBlock = null;
        tools._linkInfo = { href: 'x', text: 'y', range: { start: 0, end: 1 } };

        // Should not throw.
        tools.selectItem(makeFakeEvent(), { type: 'unlink', icon: '' });
    });

    it('unlink: no-ops when linkInfo.range is missing', () => {
        const { tools } = bootLinkTools();
        const blockUnlink = vi.fn();
        // linkBlock is typed as Format | null; the fake only implements
        // `unlink` (the only method selectItem calls).
        tools._linkBlock = { unlink: blockUnlink } as unknown as Format;
        tools._linkInfo = { href: 'x', text: 'y', range: null };

        tools.selectItem(makeFakeEvent(), { type: 'unlink', icon: '' });

        expect(blockUnlink).not.toHaveBeenCalled();
    });

    it('edit: replaces the toolbar with editable text and link fields', () => {
        const { tools } = bootLinkTools();
        tools._linkInfo = { text: 'Example', href: 'https://example.com' };
        tools._draftText = 'Example';
        tools._draftHref = 'https://example.com';

        tools.selectItem(makeFakeEvent(), { type: 'edit', icon: '' });

        expect(tools.container!.querySelector<HTMLInputElement>('.link-text-input')?.value)
            .toBe('Example');
        expect(tools.container!.querySelector<HTMLInputElement>('.link-href-input')?.value)
            .toBe('https://example.com');
        expect(tools.container!.querySelector('.link-toolbar')).toBeNull();
    });

    it('edit: writes both changed text and URL into a markdown link', () => {
        const { tools } = bootLinkTools();
        const setCursor = vi.fn();
        const block = {
            text: '[Example]()',
            setCursor,
            isSmartLink: () => false,
            isLinkView: () => false,
        };
        tools._linkBlock = block as unknown as Format;
        tools._linkInfo = {
            href: '',
            text: 'Example',
            raw: '[Example]()',
            range: { start: 0, end: 11 },
        };
        tools._draftText = 'Example';
        tools._draftHref = '';
        tools.selectItem(makeFakeEvent(), { type: 'edit', icon: '' });
        const textInput = tools.container!.querySelector<HTMLInputElement>('.link-text-input')!;
        const hrefInput = tools.container!.querySelector<HTMLInputElement>('.link-href-input')!;
        textInput.value = 'Renamed';
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        hrefInput.value = 'https://example.com';
        hrefInput.dispatchEvent(new Event('input', { bubbles: true }));
        hrefInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(block.text).toBe('[Renamed](https://example.com)');
        expect(setCursor).toHaveBeenCalledWith(30, 30, true);
    });
});

describe('linkTools.render — Feishu-style toolbar structure', () => {
    // Regression guard for issue #4356: a link whose href was sanitized away
    // (unsupported custom protocol) reaches the popover with `href: null`.
    // The address falls back to visible text while the toolbar stays usable.
    it('falls back to link text when href is null', () => {
        const { tools } = bootLinkTools();
        tools._linkInfo = {
            href: null,
            text: 'sambesi://localhost/node/11164',
            raw: '[sambesi://localhost/node/11164](sambesi://localhost/node/11164)',
            range: { start: 0, end: 64 },
        };

        tools.render();

        expect(tools.container!.querySelector('.link-address-text')?.textContent)
            .toBe('sambesi://localhost/node/11164');
        expect(tools.container!.querySelectorAll('li.item.edit').length).toBe(1);
        expect(tools.container!.querySelectorAll('li.item.unlink').length).toBe(1);
        expect(tools.container!.querySelectorAll('li.item.view-selector').length).toBe(0);
        expect(tools.container!.querySelectorAll('li.item.more').length).toBe(1);
    });

    it('does not offer view switching for a link created from selected text', () => {
        const { tools } = bootLinkTools();
        tools._linkBlock = {
            isSmartLink: () => false,
            isLinkView: () => false,
        } as unknown as Format;
        tools._linkInfo = {
            href: 'https://example.com',
            text: 'hi',
            raw: '[hi](https://example.com)',
            range: { start: 0, end: 25 },
        };

        tools.render();

        expect(tools.container!.querySelector('.link-address-text')?.textContent)
            .toBe('https://example.com');
        expect(tools.container!.querySelectorAll('li.item.edit').length).toBe(1);
        expect(tools.container!.querySelectorAll('li.item.unlink').length).toBe(1);
        expect(tools.container!.querySelector('.mu-action-icon-edit')).not.toBeNull();
        expect(tools.container!.querySelector('.view-selector')).toBeNull();
        expect(tools.container!.querySelector('.more-grid .mu-action-icon-more')).not.toBeNull();
    });

    it('opens only the Markdown-backed view options and the two-option copy menu', () => {
        const { muya, tools } = bootLinkTools();
        const writeText = vi.fn();
        (muya.options as { clipboardWriteText?: (text: string) => void }).clipboardWriteText = writeText;
        tools._linkBlock = {
            isSmartLink: () => false,
            isLinkView: () => false,
        } as unknown as Format;
        tools._linkInfo = {
            href: 'https://example.com',
            text: 'https://example.com',
            raw: '[https://example.com](https://example.com)',
            range: { start: 0, end: 42 },
        };
        tools.render();

        expect(tools.container!.querySelector('.view-mode-label')?.textContent).toBe('Link View');
        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        expect([...tools.container!.querySelectorAll('.link-view-menu .link-menu-label')]
            .map(item => item.textContent))
            .toEqual(['Link View', 'Title View']);
        expect(tools.container!.querySelector('.link-view-menu .selected .link-menu-check')?.textContent)
            .toBe('✓');
        expect(tools.container!.querySelectorAll('.link-view-menu .disabled')).toHaveLength(0);

        tools.container!.querySelector<HTMLElement>('.more-button')!.click();
        expect([...tools.container!.querySelectorAll('.link-more-menu .link-menu-label')]
            .map(item => item.textContent))
            .toEqual(['Copy Link', 'Copy Original Web Link']);
        expect(tools.container!.querySelector('.link-more-menu .mu-action-icon-copy-link')).not.toBeNull();
        expect(tools.container!.querySelector('.link-more-menu .mu-action-icon-web-link')).not.toBeNull();
        tools.container!.querySelector<HTMLElement>('.link-more-menu .copy-link')!.click();
        expect(writeText).toHaveBeenCalledWith('[https://example.com](https://example.com)');
    });

    it('switches between Title View and Link View without losing the title text', () => {
        const { tools } = bootLinkTools();
        const setCursor = vi.fn();
        let linkView = false;
        const setLinkView = vi.fn((_range, _href: string, enabled: boolean) => {
            linkView = enabled;
        });
        const block = {
            text: '[Example](https://example.com)',
            setCursor,
            setLinkView,
            isSmartLink: () => true,
            isLinkView: () => linkView,
        };
        tools._linkBlock = block as unknown as Format;
        tools._linkInfo = {
            href: 'https://example.com',
            text: 'Example',
            raw: '[Example](https://example.com)',
            range: { start: 0, end: 30 },
        };
        tools.render();

        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        tools.container!.querySelector<HTMLElement>('.link-view-menu .link')!.click();

        expect(setLinkView).toHaveBeenCalledWith({ start: 0, end: 30 }, 'https://example.com', true);
        expect(block.text).toBe('[Example](https://example.com)');

        tools._linkInfo = {
            href: 'https://example.com',
            text: 'Example',
            raw: '[Example](https://example.com)',
            range: { start: 0, end: 30 },
        };
        tools.render();
        expect(tools.container!.querySelector('.view-mode-label')?.textContent).toBe('Link View');
        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        expect(tools.container!.querySelector('.link-view-menu .link.selected')).not.toBeNull();
        tools.container!.querySelector<HTMLElement>('.link-view-menu .title')!.click();

        expect(setLinkView).toHaveBeenLastCalledWith({ start: 0, end: 30 }, 'https://example.com', false);
        expect(block.text).toBe('[Example](https://example.com)');
        expect(setCursor).not.toHaveBeenCalled();
    });

    it('fetches a title for a pasted bare URL and reuses it after a view round trip', async () => {
        const { tools } = bootLinkTools();
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        const fetchMock = vi.fn(async () => ({
            status: 200,
            headers: { get: () => 'text/html; charset=utf-8' },
            text: async () => '<html><head><title>Example Title</title></head></html>',
        }));
        vi.stubGlobal('fetch', fetchMock);

        const href = 'https://example.com';
        const originalRaw = `[${href}](${href})`;
        let linkView = false;
        let smart = false;
        const block = {
            text: originalRaw,
            setCursor: vi.fn(),
            setLinkView: vi.fn((_range, _href: string, enabled: boolean) => {
                smart = true;
                linkView = enabled;
            }),
            isSmartLink: () => smart,
            isLinkView: () => linkView,
        };
        tools._linkBlock = block as unknown as Format;
        tools._linkInfo = {
            href,
            text: href,
            raw: originalRaw,
            range: { start: 0, end: originalRaw.length },
        };
        tools.render();

        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        tools.container!.querySelector<HTMLElement>('.link-view-menu .title')!.click();

        const titleRaw = `[Example Title](${href})`;
        await vi.waitFor(() => expect(block.text).toBe(titleRaw));
        expect(fetchMock).toHaveBeenCalledTimes(1);

        tools._linkInfo = {
            href,
            text: 'Example Title',
            raw: titleRaw,
            range: { start: 0, end: titleRaw.length },
        };
        tools.render();
        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        tools.container!.querySelector<HTMLElement>('.link-view-menu .link')!.click();
        tools.render();
        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        tools.container!.querySelector<HTMLElement>('.link-view-menu .title')!.click();

        expect(block.text).toBe(titleRaw);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('uses the host title resolver when converting a real bare URL', async () => {
        const { muya, tools } = bootLinkTools();
        const href = 'http://10.0.0.1/app/workflow';
        const resolveLinkMetadata = vi.fn(async () => ({
            title: 'Dify',
            icon: 'http://10.0.0.1/favicon.ico',
        }));
        muya.options.resolveLinkMetadata = resolveLinkMetadata;
        const block = {
            text: href,
            setCursor: vi.fn(),
            setLinkView: vi.fn(),
            isSmartLink: () => false,
            isLinkView: () => false,
        };
        tools._linkBlock = block as unknown as Format;
        tools._linkInfo = {
            href,
            text: href,
            raw: href,
            range: { start: 0, end: href.length },
        };
        tools.render();

        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        tools.container!.querySelector<HTMLElement>('.link-view-menu .title')!.click();

        await vi.waitFor(() => expect(block.text).toBe(`[Dify](${href})`));
        expect(resolveLinkMetadata).toHaveBeenCalledWith(href);
        expect(block.setLinkView).toHaveBeenCalledWith(
            { start: 0, end: `[Dify](${href})`.length },
            href,
            false,
            'http://10.0.0.1/favicon.ico',
        );
    });

    it('resolves a real title when the stored label is only a shortened URL', async () => {
        const { muya, tools } = bootLinkTools();
        const href = 'https://www.msn.cn/zh-cn/news/example/ar-AA123';
        const shortLabel = 'msn.cn/zh-cn/news/example/ar-AA123';
        const originalRaw = `[${shortLabel}](${href})`;
        muya.options.resolveLinkMetadata = vi.fn(async () => ({
            title: 'Example Article Title',
            icon: 'https://www.msn.cn/favicon.ico',
        }));
        const block = {
            text: originalRaw,
            setCursor: vi.fn(),
            setLinkView: vi.fn(),
            isSmartLink: () => false,
            isLinkView: () => false,
        };
        tools._linkBlock = block as unknown as Format;
        tools._linkInfo = {
            href,
            text: shortLabel,
            raw: originalRaw,
            range: { start: 0, end: originalRaw.length },
        };
        tools.render();
        expect(tools.container!.querySelector('.view-mode-label')?.textContent).toBe('Link View');

        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        tools.container!.querySelector<HTMLElement>('.link-view-menu .title')!.click();

        await vi.waitFor(() => expect(block.text).toBe(`[Example Article Title](${href})`));
        expect(muya.options.resolveLinkMetadata).toHaveBeenCalledWith(href);
    });

    it('re-resolves the live block after asynchronous title lookup', async () => {
        const { muya, tools } = bootLinkTools();
        const href = 'https://example.com/article';
        muya.options.resolveLinkMetadata = vi.fn(async () => ({
            title: 'Current title',
            icon: 'https://example.com/favicon.ico',
        }));
        const staleBlock = {
            path: [0, 'text'],
            text: href,
            setCursor: vi.fn(),
            setLinkView: vi.fn(),
            isSmartLink: () => false,
            isLinkView: () => false,
        };
        const liveBlock = {
            text: href,
            isContent: () => true,
            setCursor: vi.fn(),
            setLinkView: vi.fn(),
        };
        Object.assign(muya, {
            editor: {
                scrollPage: {
                    queryBlock: vi.fn(() => liveBlock),
                },
            },
        });
        tools._linkBlock = staleBlock as unknown as Format;
        tools._linkInfo = {
            href,
            text: href,
            raw: href,
            range: { start: 0, end: href.length },
        };
        tools.render();

        tools.container!.querySelector<HTMLElement>('.view-selector-button')!.click();
        tools.container!.querySelector<HTMLElement>('.link-view-menu .title')!.click();

        await vi.waitFor(() => expect(liveBlock.text).toBe(`[Current title](${href})`));
        expect(staleBlock.text).toBe(href);
    });
});
