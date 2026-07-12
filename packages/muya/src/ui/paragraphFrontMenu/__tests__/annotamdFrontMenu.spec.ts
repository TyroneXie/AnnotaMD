// @vitest-environment happy-dom

import type Content from '../../../block/base/content';
import type Parent from '../../../block/base/parent';
import type { IMuyaOptions } from '../../../types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { canTurnIntoMenu, FRONT_MENU } from '../config';
import { ParagraphFrontMenu } from '../index';

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    vi.unstubAllGlobals();
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string, options: Partial<IMuyaOptions> = {}): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown, ...options } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function blocks(muya: Muya): Parent[] {
    const result: Parent[] = [];
    muya.editor.scrollPage!.children.forEach(block => result.push(block as Parent));
    return result;
}

function openOn(menu: ParagraphFrontMenu, block: Parent): void {
    (menu as unknown as { _block: Parent })._block = block;
}

function visibleActions(block: Parent): string[] {
    return FRONT_MENU
        .filter(item => !item.visible || item.visible(block))
        .map(item => item.label);
}

describe('AnnotaMD paragraph front menu configuration', () => {
    it('offers the approved scheme A actions in compact groups', () => {
        expect(FRONT_MENU.map(item => item.label)).toEqual([
            'copy-plain-text',
            'copy-markdown',
            'copy-section',
            'duplicate',
            'duplicate-section',
            'cut',
            'cut-section',
            'insert-before',
            'insert-after',
            'promote-section',
            'demote-section',
            'move-up',
            'move-down',
            'move-section-up',
            'move-section-down',
            'comment',
            'delete',
            'delete-section',
        ]);
        expect(FRONT_MENU.map(item => item.group)).toEqual([
            1, 1, 1, 1, 1, 1, 1,
            2, 2, 2, 2,
            3, 3, 3, 3,
            4, 4, 4,
        ]);
    });

    it('uses the same line-icon system for every action instead of mixed bitmap sizes', () => {
        expect(FRONT_MENU.every(item => !('icon' in item) || item.icon == null)).toBe(true);
    });

    it('shares the same semantic comment and delete icons with the text-selection toolbar', () => {
        const frontMenuSource = readFileSync(
            resolve(process.cwd(), 'src/ui/paragraphFrontMenu/index.ts'),
            'utf8',
        );
        const inlineToolbarSource = readFileSync(
            resolve(process.cwd(), 'src/ui/inlineFormatToolbar/index.ts'),
            'utf8',
        );

        expect(frontMenuSource).toContain('renderActionIcon');
        expect(inlineToolbarSource).toContain('renderActionIcon');
        const muya = bootMuya('one\n\ntwo\n');
        const menu = new ParagraphFrontMenu(muya, {});
        openOn(menu, blocks(muya)[1]);
        menu.render();
        for (const semanticIcon of ['comment', 'delete', 'move-up', 'move-down'])
            expect(menu.container!.querySelector(`.mu-action-icon-${semanticIcon}`)).not.toBeNull();

        menu.render();
        for (const semanticIcon of ['comment', 'delete', 'move-up', 'move-down'])
            expect(menu.container!.querySelector(`.mu-action-icon-${semanticIcon}`)).not.toBeNull();

        const sharedIconCss = readFileSync(
            resolve(process.cwd(), 'src/ui/actionIcons.css'),
            'utf8',
        );
        expect(sharedIconCss).toMatch(
            /\.mu-action-icon\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s,
        );
    });

    it('keeps the plain-text T at the same visual scale as the other action icons', () => {
        const stylesheet = readFileSync(
            resolve(process.cwd(), 'src/ui/paragraphFrontMenu/index.css'),
            'utf8',
        );
        expect(stylesheet).toMatch(/\.menu-symbol\.copy-plain-text::before\s*\{[^}]*font-size:\s*14px;/s);
    });

    it('reveals heading disclosure controls only while the heading is hovered', () => {
        const stylesheet = readFileSync(
            resolve(process.cwd(), 'src/assets/styles/blockSyntax.css'),
            'utf8',
        );
        expect(stylesheet).toMatch(
            /\.mu-section-collapse-indicator\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
        );
        expect(stylesheet).toMatch(
            /\.mu-section-has-disclosure:hover\s*>\s*\.mu-section-collapse-indicator[^\{]*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
        );
    });

    it('does not offer actions that would invalidate front matter or do nothing on a divider', () => {
        const frontmatter = blocks(bootMuya('---\ntitle: test\n---\n\nbody\n'))[0];
        expect(visibleActions(frontmatter)).not.toContain('duplicate');
        expect(visibleActions(frontmatter)).not.toContain('insert-before');
        expect(visibleActions(frontmatter)).not.toContain('move-up');
        expect(visibleActions(frontmatter)).not.toContain('move-down');
        expect(visibleActions(frontmatter)).not.toContain('comment');

        const divider = blocks(bootMuya('before\n\n---\n\nafter\n'))[1];
        expect(visibleActions(divider)).not.toContain('copy-plain-text');
        expect(visibleActions(divider)).not.toContain('comment');
    });
});

describe('AnnotaMD paragraph front menu actions', () => {
    it('copies one block as plain text or Markdown without changing the document', () => {
        const writeText = vi.fn();
        const muya = bootMuya('## **Important** note\n', { clipboardWriteText: writeText });
        const menu = new ParagraphFrontMenu(muya, {});
        const block = blocks(muya)[0];

        openOn(menu, block);
        menu.selectItem(new Event('click'), { label: 'copy-plain-text' });
        expect(writeText).toHaveBeenLastCalledWith('Important note');

        openOn(menu, block);
        menu.selectItem(new Event('click'), { label: 'copy-markdown' });
        expect(writeText).toHaveBeenLastCalledWith('## **Important** note');
        expect(muya.getMarkdown()).toBe('## **Important** note\n');
    });

    it('copies a table as tab-separated plain text', () => {
        const writeText = vi.fn();
        const muya = bootMuya('| Name | Value |\n| --- | --- |\n| Alpha | 1 |\n| Beta | 2 |\n', {
            clipboardWriteText: writeText,
        });
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'copy-plain-text' });

        expect(writeText).toHaveBeenCalledWith('Name\tValue\nAlpha\t1\nBeta\t2');
    });

    it('copies source-oriented special blocks without their Markdown fences', () => {
        const cases = [
            ['---\ntitle: test\n---\n\nbody\n', 'title: test'],
            ['$$\na^2 + b^2\n$$\n', 'a^2 + b^2'],
            ['<section>hello</section>\n', '<section>hello</section>'],
        ] as const;

        cases.forEach(([markdown, expected]) => {
            const writeText = vi.fn();
            const muya = bootMuya(markdown, { clipboardWriteText: writeText });
            const menu = new ParagraphFrontMenu(muya, {});
            openOn(menu, blocks(muya)[0]);
            menu.selectItem(new Event('click'), { label: 'copy-plain-text' });
            expect(writeText).toHaveBeenCalledWith(expected);
        });
    });

    it('offers plain paragraph conversion for block quotes and preserves every quoted paragraph', async () => {
        const muya = bootMuya('> first\n>\n> second\n');
        const menu = new ParagraphFrontMenu(muya, {});
        const quote = blocks(muya)[0];

        expect(canTurnIntoMenu(quote).map(item => item.label)).toContain('paragraph');
        openOn(menu, quote);
        menu.selectItem(new Event('click'), { label: 'paragraph' });

        await vi.waitFor(() => {
            expect(muya.getState().map(state => state.name)).toEqual(['paragraph', 'paragraph']);
        });
        expect(muya.getMarkdown()).toContain('first');
        expect(muya.getMarkdown()).toContain('second');
    });

    it('offers a visible quote icon after converting a quote to plain text and can convert it back', async () => {
        const muya = bootMuya('> reversible quote\n');
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'paragraph' });

        await vi.waitFor(() => expect(blocks(muya)[0].blockName).toBe('paragraph'));
        const paragraph = blocks(muya)[0];
        expect(canTurnIntoMenu(paragraph).map(item => item.label)).toContain('block-quote');

        openOn(menu, paragraph);
        menu.render();
        expect(document.querySelector('.turn-into-item.block-quote .mu-quote-turn-into-icon')).not.toBeNull();

        await new Promise(resolve => setTimeout(resolve, 130));
        menu.selectItem(new Event('click'), { label: 'block-quote' });
        await vi.waitFor(() => expect(blocks(muya)[0].blockName).toBe('block-quote'));
        await vi.waitFor(() => expect(muya.getMarkdown()).toBe('> reversible quote\n'));
    });

    it('keeps the type menu open and refreshes it immediately after paragraph/list conversion', async () => {
        const muya = bootMuya('convert me\n');
        const menu = new ParagraphFrontMenu(muya, {});
        const paragraph = blocks(muya)[0];

        openOn(menu, paragraph);
        menu.render();
        menu.selectItem(new Event('click'), { label: 'task-list' });

        const activeBlock = (menu as unknown as { _block: Parent | null })._block;
        expect(activeBlock?.blockName).toBe('task-list');
        expect(document.querySelector('.turn-into-item.task-list.active')).not.toBeNull();
        expect(document.querySelector('.turn-into-item.paragraph')).not.toBeNull();

        await new Promise(resolve => setTimeout(resolve, 130));
        menu.selectItem(new Event('click'), { label: 'paragraph' });
        await vi.waitFor(() => {
            expect(muya.getState().map(state => state.name)).toEqual(['paragraph']);
        });
        expect((menu as unknown as { _block: Parent | null })._block?.blockName).toBe('paragraph');
        expect(document.querySelector('.turn-into-item.paragraph.active')).not.toBeNull();
    });

    it('cuts one block by copying its Markdown and removing only that block', async () => {
        const writeText = vi.fn();
        const muya = bootMuya('first\n\n**second**\n\nthird\n', { clipboardWriteText: writeText });
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[1]);
        menu.selectItem(new Event('click'), { label: 'cut' });

        expect(writeText).toHaveBeenCalledWith('**second**');
        await vi.waitFor(() => expect(muya.getMarkdown()).toBe('first\n\nthird\n'));
    });

    it('copies a heading section through its descendants but stops at the next peer heading', () => {
        const writeText = vi.fn();
        const muya = bootMuya('# First\n\nintro\n\n## Nested\n\ndetail\n\n# Second\n\noutro\n', {
            clipboardWriteText: writeText,
        });
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'copy-section' });

        expect(writeText).toHaveBeenCalledWith('# First\n\nintro\n\n## Nested\n\ndetail');
    });

    it('shows section actions only for headings and hides their single-block equivalents', () => {
        const muya = bootMuya('# Heading\n\nparagraph\n');
        const [heading, paragraph] = blocks(muya);

        expect(visibleActions(heading)).toEqual(expect.arrayContaining([
            'copy-section',
            'duplicate-section',
            'cut-section',
            'promote-section',
            'demote-section',
            'move-section-down',
            'delete-section',
        ]));
        expect(visibleActions(heading)).not.toEqual(expect.arrayContaining([
            'duplicate',
            'cut',
            'move-up',
            'move-down',
            'delete',
        ]));
        expect(visibleActions(paragraph)).not.toContain('duplicate-section');
        expect(visibleActions(paragraph)).not.toContain('delete-section');
    });

    it('duplicates and cuts an entire heading section without touching its next peer', async () => {
        const writeText = vi.fn();
        const source = '# First\n\nintro\n\n## Nested\n\ndetail\n\n# Second\n\noutro\n';
        const muya = bootMuya(source, { clipboardWriteText: writeText });
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'duplicate-section' });
        await vi.waitFor(() => {
            expect(muya.getMarkdown().match(/^# First$/gm)).toHaveLength(2);
        });
        expect(muya.getMarkdown().match(/^# Second$/gm)).toHaveLength(1);

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'cut-section' });
        expect(writeText).toHaveBeenCalledWith('# First\n\nintro\n\n## Nested\n\ndetail');
        await vi.waitFor(() => {
            expect(muya.getMarkdown().match(/^# First$/gm)).toHaveLength(1);
        });
        expect(muya.getMarkdown()).toContain('# Second');
    });

    it('promotes and demotes every heading in a section while preserving its boundary', async () => {
        const muya = bootMuya('## First\n\ntext\n\n### Child\n\ndetail\n\n## Peer\n');
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'promote-section' });
        await vi.waitFor(() => expect(muya.getMarkdown()).toContain('# First'));
        expect(muya.getMarkdown()).toContain('## Child');
        expect(muya.getMarkdown()).toContain('## Peer');

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'demote-section' });
        await vi.waitFor(() => expect(muya.getMarkdown()).toContain('## First'));
        expect(muya.getMarkdown()).toContain('### Child');
        expect(muya.getMarkdown()).toContain('## Peer');
    });

    it('moves a whole heading section between peer sections', async () => {
        const muya = bootMuya('# One\n\none body\n\n## Child\n\nchild body\n\n# Two\n\ntwo body\n');
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'move-section-down' });
        await vi.waitFor(() => {
            expect(muya.getMarkdown().indexOf('# Two')).toBeLessThan(muya.getMarkdown().indexOf('# One'));
        });
        expect(muya.getMarkdown().indexOf('## Child')).toBeGreaterThan(muya.getMarkdown().indexOf('# One'));

        const one = blocks(muya).find((block) => {
            const state = block.getState();
            return state.name === 'atx-heading' && state.text.includes('One');
        })!;
        openOn(menu, one);
        menu.selectItem(new Event('click'), { label: 'move-section-up' });
        await vi.waitFor(() => {
            expect(muya.getMarkdown().indexOf('# One')).toBeLessThan(muya.getMarkdown().indexOf('# Two'));
        });
    });

    it('collapses and expands section descendants without changing Markdown', () => {
        const source = '# First\n\nintro\n\n## Nested\n\ndetail\n\n# Second\n';
        const muya = bootMuya(source);
        new ParagraphFrontMenu(muya, {});
        const heading = blocks(muya)[0];

        expect(visibleActions(heading)).not.toContain('collapse-section');
        const indicator = heading.domNode?.querySelector<HTMLButtonElement>(
            '.mu-section-collapse-indicator',
        );
        expect(indicator).not.toBeNull();
        expect(indicator?.getAttribute('aria-label')).toBe('Collapse Section');
        expect(indicator?.dataset.tooltip).toBe('Collapse Section');
        expect(heading.domNode?.classList.contains('mu-section-has-disclosure')).toBe(true);
        expect(heading.domNode?.classList.contains('mu-section-collapsed')).toBe(false);

        indicator?.click();
        expect(blocks(muya).slice(1, 4).every(block => block.domNode?.hidden)).toBe(true);
        expect(blocks(muya)[4].domNode?.hidden).toBe(false);
        expect(muya.getMarkdown()).toBe(source);
        expect(indicator?.getAttribute('aria-label')).toBe('Expand Section');
        expect(indicator?.dataset.tooltip).toBe('Expand Section');
        expect(heading.domNode?.classList.contains('mu-section-collapsed')).toBe(true);

        indicator?.click();
        expect(blocks(muya).slice(1, 4).every(block => !block.domNode?.hidden)).toBe(true);
        expect(heading.domNode?.querySelector('.mu-section-collapse-indicator')).toBe(indicator);
        expect(heading.domNode?.classList.contains('mu-section-collapsed')).toBe(false);
        expect(indicator?.getAttribute('aria-label')).toBe('Collapse Section');
        expect(indicator?.dataset.tooltip).toBe('Collapse Section');
        expect(muya.getMarkdown()).toBe(source);
    });

    it('requires a second menu click before deleting an entire heading section', async () => {
        const muya = bootMuya('# First\n\nbody\n\n# Second\n\nkeep\n');
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'delete-section' });
        expect(muya.getMarkdown()).toContain('# First');

        menu.selectItem(new Event('click'), { label: 'delete-section' });
        await vi.waitFor(() => expect(muya.getMarkdown()).not.toContain('# First'));
        expect(muya.getMarkdown()).toContain('# Second');
    });

    it('inserts empty paragraphs above and below the selected block', async () => {
        const muya = bootMuya('first\n\nsecond\n');
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[1]);
        menu.selectItem(new Event('click'), { label: 'insert-before' });
        await vi.waitFor(() => expect(muya.getState()).toHaveLength(3));
        expect(muya.getState().map(state => state.name)).toEqual([
            'paragraph',
            'paragraph',
            'paragraph',
        ]);

        openOn(menu, blocks(muya)[2]);
        menu.selectItem(new Event('click'), { label: 'insert-after' });
        await vi.waitFor(() => expect(muya.getState()).toHaveLength(4));
    });

    it('moves the selected block up and down without changing its content', async () => {
        const muya = bootMuya('one\n\ntwo\n\nthree\n');
        const menu = new ParagraphFrontMenu(muya, {});

        openOn(menu, blocks(muya)[1]);
        menu.selectItem(new Event('click'), { label: 'move-up' });
        await vi.waitFor(() => expect(muya.getMarkdown().indexOf('two')).toBeLessThan(muya.getMarkdown().indexOf('one')));

        openOn(menu, blocks(muya)[0]);
        menu.selectItem(new Event('click'), { label: 'move-down' });
        await vi.waitFor(() => expect(muya.getMarkdown().indexOf('one')).toBeLessThan(muya.getMarkdown().indexOf('two')));
        expect(muya.getMarkdown()).toContain('three');
    });

    it('emits a full-block selection when Comment is chosen', () => {
        const muya = bootMuya('comment this block\n');
        const menu = new ParagraphFrontMenu(muya, {});
        const handler = vi.fn();
        muya.on('annotamd-comment-selection', handler);

        const block = (muya.editor.scrollPage!.firstContentInDescendant() as Content).outMostBlock as Parent;
        openOn(menu, block);
        menu.selectItem(new Event('click'), { label: 'comment' });

        expect(handler).toHaveBeenCalledOnce();
        expect(handler.mock.calls[0][0]).toMatchObject({
            quote: 'comment this block',
            isCrossBlock: false,
        });
    });
});
