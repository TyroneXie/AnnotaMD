// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { CodeBlockLanguageSelector } from '../index';
import { buildLanguagePickerItems } from '../languageItems';
import type { LanguagePickerItem } from '../languageItems';

function renderItems(items: LanguagePickerItem[]) {
    const container = document.createElement('div');
    const scrollElement = document.createElement('div');
    container.appendChild(scrollElement);
    const picker = {
        renderArray: items,
        scrollElement,
        activeItem: items[0],
        muya: { i18n: { t: (text: string) => text } },
        selectItem: vi.fn(),
    };
    CodeBlockLanguageSelector.prototype.render.call(picker as unknown as CodeBlockLanguageSelector);
    return container;
}

describe('code language picker icons', () => {
    it('renders recognizable, distinct language SVGs instead of shared text placeholders', () => {
        const container = renderItems(buildLanguagePickerItems(false));
        const rows = container.querySelectorAll('li.item');
        expect(rows).toHaveLength(21);
        rows.forEach(row => expect(row.querySelector('.icon-wrapper svg path')).not.toBeNull());
        const paths = ['javascript', 'typescript', 'python', 'java'].map(language =>
            container.querySelector(`[data-label="${language}"] .icon-wrapper svg`)!.innerHTML);
        expect(new Set(paths).size).toBe(paths.length);
        expect(container.querySelector('[data-label="__more-languages__"] svg')).not.toBeNull();
    });

    it.each([
        ['js', 'javascript'],
        ['ts', 'typescript'],
        ['py', 'python'],
        ['sh', 'bash'],
        ['c++', 'cpp'],
        ['md', 'markdown'],
        ['html', 'markup'],
        ['yml', 'yaml'],
        ['PY', 'python'],
    ])('uses the same language icon for %s and %s', (alias, language) => {
        const container = renderItems([alias, language].map(name => ({ name, kind: 'language' })));
        const icons = container.querySelectorAll('.mu-language-icon');
        expect(icons).toHaveLength(2);
        expect(icons[0].getAttribute('data-language')).toBe(language);
        expect(icons[0].querySelector('svg')!.innerHTML).toBe(icons[1].querySelector('svg')!.innerHTML);
    });

    it('keeps an SVG for every expanded language and uses semantic fallbacks without inventing logos', () => {
        const container = renderItems(buildLanguagePickerItems(true));
        const rows = container.querySelectorAll('li.item');
        rows.forEach(row => expect(row.querySelector('.icon-wrapper svg path')).not.toBeNull());
        expect(container.querySelector('[data-label="haskell"] [data-language="haskell"] svg')).not.toBeNull();
        expect(container.querySelector('[data-label="wren"] .mu-action-icon-code svg')).not.toBeNull();
        expect(container.querySelector('[data-label="xquery"] .mu-action-icon-table svg')).not.toBeNull();
    });
});
