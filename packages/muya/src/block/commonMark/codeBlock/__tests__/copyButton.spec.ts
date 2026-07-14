// @vitest-environment happy-dom

import type CodeBlock from '../index';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyType } from '../../../../clipboard/types';
import { Muya } from '../../../../muya';
import { CodeBlockLanguageSelector } from '../../../../ui/codeBlockLanguageSelector';

// Characterization coverage for the code-block copy button wiring
// (Code._listen, code.ts:104-134). copyHandler.spec only exercises the
// downstream COPY_CODE_CONTENT setData branch — the button-click →
// editor.clipboard.copy(CopyType.COPY_CODE_CONTENT, text) hookup is otherwise
// untested. The button is the `a.mu-code-copy` first child of the `.mu-code`
// node; clicking it copies the raw code text verbatim, and mousedown
// preventDefaults so the caret/selection does not move.

const bootedHosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length) {
        const host = bootedHosts.pop()!;
        host.remove();
    }
    vi.restoreAllMocks();
});

function bootMuya(markdown: string, options: Record<string, unknown> = {}): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown, ...options } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

const THREE_LINE_FENCE = '```js\nconst a = 1\nconst b = 2\nconst c = 3\n```\n';

describe('code-block copy button', () => {
    it('renders the code-block hint on the left and language/wrap/copy actions on the right', () => {
        const muya = bootMuya('```ts\nconst value = 1\n```\n');
        const actions = muya.domNode.querySelector<HTMLElement>('.mu-code-actions');
        const languageInput = muya.domNode.querySelector<HTMLElement>('.mu-language-input');
        const caption = muya.domNode.querySelector<HTMLElement>('.mu-code-caption');
        const languageButton = actions?.querySelector<HTMLElement>('.mu-code-language-toggle');

        expect(actions).not.toBeNull();
        expect(languageButton?.textContent).toContain('TypeScript');
        expect(actions!.querySelector<HTMLElement>('.mu-code-wrap-toggle')?.textContent).toContain('Auto Wrap');
        expect(actions!.querySelector<HTMLElement>('.mu-code-copy')?.textContent).toContain('Copy');
        expect(languageInput?.getAttribute('hint')).toBe('Code Block');
        expect(languageInput?.getAttribute('contenteditable')).toBe('false');
        expect(caption?.tagName).toBe('INPUT');
        expect(caption?.getAttribute('type')).toBe('text');
        expect(caption?.getAttribute('tabindex')).toBe('0');
        expect(caption?.getAttribute('placeholder')).toBe('Code Block');
    });

    it('invokes editor.clipboard.copy(COPY_CODE_CONTENT, codeText) on click', () => {
        const muya = bootMuya(THREE_LINE_FENCE);
        const copySpy = vi.spyOn(muya.editor.clipboard, 'copy').mockImplementation(() => {});

        const button = muya.domNode.querySelector<HTMLElement>('a.mu-code-copy');
        expect(button).not.toBeNull();

        button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(copySpy).toHaveBeenCalledTimes(1);
        expect(copySpy).toHaveBeenCalledWith(
            CopyType.COPY_CODE_CONTENT,
            'const a = 1\nconst b = 2\nconst c = 3',
        );
    });

    it('copies the raw text verbatim for a single-line block', () => {
        const muya = bootMuya('```js\nsolo line\n```\n');
        const copySpy = vi.spyOn(muya.editor.clipboard, 'copy').mockImplementation(() => {});

        const button = muya.domNode.querySelector<HTMLElement>('a.mu-code-copy')!;
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(copySpy).toHaveBeenCalledTimes(1);
        expect(copySpy).toHaveBeenCalledWith(CopyType.COPY_CODE_CONTENT, 'solo line');
    });

    it('preventDefaults the mousedown so the caret/selection does not move', () => {
        const muya = bootMuya(THREE_LINE_FENCE);

        const button = muya.domNode.querySelector<HTMLElement>('a.mu-code-copy')!;
        const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        button.dispatchEvent(mousedown);

        expect(mousedown.defaultPrevented).toBe(true);
    });
});

describe('code-block session collapse', () => {
    it('collapses only the rendered body and restores it without changing Markdown', () => {
        const markdown = '```ts title="Example"\nconst value = 1\n```\n';
        const muya = bootMuya(markdown, { codeBlockLineNumbers: true });
        const codeBlock = muya.domNode.querySelector<HTMLElement>('pre.mu-code-block')!;
        const disclosure = codeBlock.querySelector<HTMLButtonElement>('.mu-code-collapse-indicator');

        expect(disclosure).not.toBeNull();
        expect(disclosure!.getAttribute('aria-expanded')).toBe('true');
        expect(codeBlock.classList.contains('mu-code-collapsed')).toBe(false);

        const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        disclosure!.dispatchEvent(mousedown);
        expect(mousedown.defaultPrevented).toBe(true);

        disclosure!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(codeBlock.classList.contains('mu-code-collapsed')).toBe(true);
        expect(codeBlock.getAttribute('contenteditable')).toBe('false');
        expect(disclosure!.getAttribute('aria-expanded')).toBe('false');
        expect(disclosure!.dataset.tooltip).toBe('Expand Section');
        expect(muya.getMarkdown()).toBe(markdown);

        const collapsedShellMouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
        });
        codeBlock.dispatchEvent(collapsedShellMouseDown);
        expect(collapsedShellMouseDown.defaultPrevented).toBe(true);

        disclosure!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(codeBlock.classList.contains('mu-code-collapsed')).toBe(false);
        expect(codeBlock.hasAttribute('contenteditable')).toBe(false);
        expect(disclosure!.getAttribute('aria-expanded')).toBe('true');
        expect(disclosure!.dataset.tooltip).toBe('Collapse Section');
        expect(muya.getMarkdown()).toBe(markdown);
    });

    it('shows the disclosure only on hover and hides code content plus its gutter when collapsed', () => {
        const stylesheet = readFileSync(
            resolve(process.cwd(), 'src/assets/styles/blockSyntax.css'),
            'utf8',
        );

        expect(stylesheet).toContain('opacity: 0;\n    pointer-events: none;');
        expect(stylesheet).toContain('.mu-code-block:hover > .mu-code-collapse-indicator');
        expect(stylesheet).toContain('.mu-code-block.mu-code-collapsed > .mu-code-collapse-indicator');
        expect(stylesheet).toContain('.mu-code-block.mu-code-collapsed > .mu-code {\n    overflow: hidden;');
        expect(stylesheet).toContain('.mu-code-block.mu-code-collapsed .mu-codeblock-content {\n    display: none;');
        expect(stylesheet).toContain('.mu-code-block.mu-code-collapsed > .mu-line-numbers-rows {\n    display: none;');
        expect(stylesheet).toContain('.mu-code-block.mu-code-collapsed .mu-code-actions {\n    opacity: 1;');
    });
});

describe('code-block language input', () => {
    it('opens the complete language picker from the right-side language button', () => {
        const muya = bootMuya('```ts\nconst value = 1\n```\n');
        const codeBlock = muya.editor.scrollPage!.firstChild! as CodeBlock;
        const languageInput = codeBlock.firstContentInDescendant()!;
        const languageButton = muya.domNode.querySelector<HTMLElement>('.mu-code-language-toggle')!;
        const payloads: Array<{ reference: HTMLElement; block: unknown; language: string }> = [];
        muya.on('code-language-picker', payload => payloads.push(payload));

        languageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(payloads).toEqual([{
            reference: languageButton,
            block: languageInput,
            language: 'ts',
        }]);
    });

    it('keeps the language picker open after clicking the right-side language button', () => {
        const muya = bootMuya('```ts\nconst value = 1\n```\n');
        const languageButton = muya.domNode.querySelector<HTMLElement>('.mu-code-language-toggle')!;
        const picker = new CodeBlockLanguageSelector(muya);

        try {
            languageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(picker.status).toBe(true);
            const moreLanguages = picker.container?.querySelector(
                '[data-label="__more-languages__"]',
            );
            expect(moreLanguages?.classList.contains('mu-language-more-footer')).toBe(true);
            expect(moreLanguages?.closest('ul')).toBeNull();
        }
        finally {
            picker.destroy();
        }
    });

    it('keeps the left code-block caption editable instead of moving the caret to code', () => {
        const muya = bootMuya('```ts\nconst value = 1\n```\n');
        const codeBlock = muya.editor.scrollPage!.firstChild! as CodeBlock;
        const caption = muya.domNode.querySelector<HTMLElement>('.mu-code-caption')!;
        const payloads: unknown[] = [];
        muya.on('code-language-picker', payload => payloads.push(payload));

        caption.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(payloads).toEqual([]);
        expect(muya.editor.activeContentBlock).not.toBe(codeBlock.lastContentInDescendant());
    });

    it('persists a typed caption in the fenced info string', () => {
        const muya = bootMuya('```ts\nconst value = 1\n```\n');
        const caption = muya.domNode.querySelector<HTMLElement>('.mu-code-caption')!;

        (caption as HTMLInputElement).value = '领域模型';
        caption.dispatchEvent(new InputEvent('input', { bubbles: true }));
        muya.flush();

        expect(muya.getMarkdown()).toContain('```ts title="领域模型"');
        expect(muya.getMarkdown()).toContain('const value = 1');
    });

    it('restores the caption and preserves it when changing language', () => {
        const muya = bootMuya('```ts title="领域模型"\nconst value = 1\n```\n');
        const codeBlock = muya.editor.scrollPage!.firstChild! as CodeBlock;
        const languageInput = codeBlock.firstContentInDescendant()! as unknown as {
            updateLanguage: (language: string) => void;
        };
        const caption = muya.domNode.querySelector<HTMLElement>('.mu-code-caption')!;
        const languageButton = muya.domNode.querySelector<HTMLElement>('.mu-code-language-toggle')!;

        expect((caption as HTMLInputElement).value).toBe('领域模型');
        expect(languageButton.textContent).toContain('TypeScript');
        expect(languageButton.textContent).not.toContain('title=');

        languageInput.updateLanguage('javascript');
        muya.flush();

        expect(muya.getMarkdown()).toContain('```javascript title="领域模型"');
    });
});

describe('code-block wrap button', () => {
    it('updates every wrap button label when the global option changes', () => {
        const muya = bootMuya(`${THREE_LINE_FENCE}\n${THREE_LINE_FENCE}`, { wrapCodeBlocks: false });

        muya.setOptions({ wrapCodeBlocks: true });

        const buttons = [...muya.domNode.querySelectorAll<HTMLElement>('.mu-code-wrap-toggle')];
        expect(buttons).toHaveLength(2);
        expect(buttons.every(button => button.textContent?.includes('Cancel Wrap'))).toBe(true);

        muya.setOptions({ wrapCodeBlocks: false });
        expect(buttons.every(button => button.textContent?.includes('Auto Wrap'))).toBe(true);
    });

    it('emits the enabled state opposite to the current global option', () => {
        const muya = bootMuya(THREE_LINE_FENCE, { wrapCodeBlocks: false });
        const payloads: Array<{ enabled: boolean }> = [];
        muya.on('code-wrap-toggle', payload => payloads.push(payload));

        const button = muya.domNode.querySelector<HTMLElement>('button.mu-code-wrap-toggle');
        expect(button).not.toBeNull();
        expect(button!.textContent).toContain('Auto Wrap');
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(payloads).toEqual([{ enabled: true }]);
    });

    it('emits false when global wrapping is already enabled', () => {
        const muya = bootMuya(THREE_LINE_FENCE, { wrapCodeBlocks: true });
        const payloads: Array<{ enabled: boolean }> = [];
        muya.on('code-wrap-toggle', payload => payloads.push(payload));

        const button = muya.domNode.querySelector<HTMLElement>('button.mu-code-wrap-toggle')!;
        expect(button.textContent).toContain('Cancel Wrap');
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(payloads).toEqual([{ enabled: false }]);
    });

    it('prevents mousedown from moving the caret', () => {
        const muya = bootMuya(THREE_LINE_FENCE);
        const button = muya.domNode.querySelector<HTMLElement>('button.mu-code-wrap-toggle')!;
        const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

        button.dispatchEvent(mousedown);

        expect(mousedown.defaultPrevented).toBe(true);
    });
});
