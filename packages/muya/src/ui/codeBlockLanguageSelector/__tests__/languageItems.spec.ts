// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
    buildLanguagePickerItems,
    languageCategory,
    MORE_LANGUAGES_ITEM_NAME,
} from '../languageItems';

describe('code language picker items', () => {
    it('shows plain text, common languages, and one expansion row by default', () => {
        const items = buildLanguagePickerItems(false);

        expect(items[0]).toMatchObject({ name: '', title: 'Plain Text', kind: 'language' });
        expect(items).toHaveLength(22);
        expect(items[items.length - 1]).toMatchObject({
            name: MORE_LANGUAGES_ITEM_NAME,
            kind: 'more',
            expanded: false,
        });
    });

    it('keeps common languages first and appends all additional languages when expanded', () => {
        const items = buildLanguagePickerItems(true);
        const names = items.map(item => item.name);

        expect(names.slice(0, 6)).toEqual(['', 'javascript', 'typescript', 'python', 'java', 'json']);
        expect(names).toContain('xquery');
        expect(items[items.length - 1]).toMatchObject({
            name: MORE_LANGUAGES_ITEM_NAME,
            kind: 'more',
            expanded: true,
        });
    });

    it('keeps one uncommon current language visible without expanding the catalogue', () => {
        const items = buildLanguagePickerItems(false, 'abap');
        const names = items.map(item => item.name);

        expect(names).toContain('abap');
        expect(names).not.toContain('6502');
        expect(names).not.toContain('xquery');
        expect(items).toHaveLength(23);
        expect(items[items.length - 1]).toMatchObject({
            name: MORE_LANGUAGES_ITEM_NAME,
            kind: 'more',
            expanded: false,
        });
    });

    it('does not duplicate a common language selected through an alias', () => {
        const items = buildLanguagePickerItems(false, 'js');

        expect(items.filter(item => item.title === 'JavaScript')).toHaveLength(1);
        expect(items).toHaveLength(22);
    });

    it.each([
        ['', 'plain'],
        ['markdown', 'markup'],
        ['xml-doc', 'markup'],
        ['sql', 'query'],
        ['xquery', 'query'],
        ['json', 'config'],
        ['yaml', 'config'],
        ['typescript', 'code'],
        ['wren', 'code'],
    ] as const)('classifies %s as %s for a non-empty fallback icon', (name, category) => {
        expect(languageCategory(name)).toBe(category);
    });
});
