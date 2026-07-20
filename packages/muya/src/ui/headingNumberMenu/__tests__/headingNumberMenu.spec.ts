// @vitest-environment happy-dom

import type AtxHeadingContent from '../../../block/content/atxHeadingContent';
import type Parent from '../../../block/base/parent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { HeadingNumberMenu } from '../index';

interface IFixture {
    content: AtxHeadingContent;
    menu: HeadingNumberMenu;
    muya: Muya;
}

const fixtures: IFixture[] = [];

function boot(markdown: string): IFixture {
    window.MUYA_VERSION = 'test';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown });
    muya.init();
    const heading = muya.editor.scrollPage!.lastChild as Parent;
    const content = heading.firstContentInDescendant() as AtxHeadingContent;
    const menu = new HeadingNumberMenu(muya);
    const fixture = { content, menu, muya };
    fixtures.push(fixture);
    return fixture;
}

function open(content: AtxHeadingContent) {
    content.domNode!.querySelector<HTMLElement>('.mu-heading-number')!.click();
}

afterEach(() => {
    while (fixtures.length) {
        const { menu, muya } = fixtures.pop()!;
        menu.destroy();
        muya.destroy();
    }
    document.body.innerHTML = '';
});

describe('heading number menu', () => {
    it('disables continue and restart for an initial 1 heading', () => {
        const { content, menu } = boot('# 1. First\n');
        open(content);

        expect(menu.container!.querySelector<HTMLButtonElement>('.continue')!.disabled).toBe(true);
        expect(menu.container!.querySelector<HTMLButtonElement>('.restart')!.disabled).toBe(true);
        expect(menu.container!.querySelector<HTMLButtonElement>('.set-value')!.disabled).toBe(false);
    });

    it('does not continue the first child but allows it to restart from 1', () => {
        const { content, menu } = boot('# 3. Parent\n\n## 3.4. Child\n');
        open(content);

        expect(menu.container!.querySelector<HTMLButtonElement>('.continue')!.disabled).toBe(true);
        expect(menu.container!.querySelector<HTMLButtonElement>('.restart')!.disabled).toBe(false);
        expect(content.getHeadingNumberMenuState()?.restart).toBe('3.1.');
    });

    it('continues a broken sequence and can then restart it', async () => {
        const { content, menu, muya } = boot('# 1. First\n\n# 4. Broken\n');
        open(content);

        expect(menu.status).toBe(true);
        expect(content.getHeadingNumberMenuState()?.continuation).toBe('2.');
        const continueButton = menu.container!.querySelector<HTMLButtonElement>('button.continue')!;
        expect(continueButton.disabled).toBe(false);
        continueButton.click();
        expect(menu.status).toBe(false);
        expect(content.text).toContain('# 2. Broken');
        await vi.waitFor(() => expect(muya.getMarkdown()).toContain('# 2. Broken'));

        open(content);
        menu.container!.querySelector<HTMLButtonElement>('button.restart')!.click();
        await vi.waitFor(() => expect(muya.getMarkdown()).toContain('# 1. Broken'));
    });

    it('sets the last number value without changing its parent prefix', async () => {
        const { content, menu, muya } = boot('# 3. Parent\n\n## 3.2. Child\n');
        open(content);
        menu.container!.querySelector<HTMLButtonElement>('button.set-value')!.click();

        const input = menu.container!.querySelector<HTMLInputElement>('.mu-heading-number-value-input')!;
        input.value = '7';
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        menu.container!.querySelector<HTMLButtonElement>('.confirm')!.click();

        await vi.waitFor(() => expect(muya.getMarkdown()).toContain('## 3.7. Child'));
    });
});
