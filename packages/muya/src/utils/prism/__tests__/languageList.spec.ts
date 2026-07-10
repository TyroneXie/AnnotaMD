// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
    languageDisplayName,
    listAdditionalLanguages,
    listCommonLanguages,
    listLanguages,
    search,
} from '../index';

describe('code language labels', () => {
    it('uses human-readable Prism titles for aliases', () => {
        expect(languageDisplayName('ts')).toBe('TypeScript');
        expect(languageDisplayName('js')).toBe('JavaScript');
        expect(languageDisplayName('python')).toBe('Python');
    });

    it('returns a unique language list that includes common choices', () => {
        const items = listLanguages();
        const names = items.map(item => item.name);

        expect(names).toContain('typescript');
        expect(names).toContain('python');
        expect(names.slice(0, 5)).toEqual(['javascript', 'typescript', 'python', 'java', 'json']);
        expect(names).not.toContain('meta');
        expect(new Set(names).size).toBe(names.length);
    });

    it('keeps plain text first and limits the default list to common languages', () => {
        const names = listCommonLanguages().map(item => item.name);

        expect(names[0]).toBe('');
        expect(names).toHaveLength(21);
        expect(names.slice(1, 6)).toEqual(['javascript', 'typescript', 'python', 'java', 'json']);
        expect(names).toContain('ruby');
    });

    it('separates uncommon languages without losing Prism grammars', () => {
        const commonNames = new Set(listCommonLanguages().map(item => item.name));
        const additionalNames = listAdditionalLanguages().map(item => item.name);

        expect(additionalNames).toContain('xquery');
        expect(additionalNames).toContain('xml-doc');
        expect(additionalNames.every(name => !commonNames.has(name))).toBe(true);
        expect(new Set(additionalNames).size).toBe(additionalNames.length);
    });

    it('finds plain text through the full-catalogue search', () => {
        expect(search('plain')[0]).toMatchObject({ name: '', title: 'Plain Text' });
    });
});
