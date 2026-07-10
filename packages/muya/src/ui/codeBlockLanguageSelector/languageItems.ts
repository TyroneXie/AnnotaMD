import { listAdditionalLanguages, listCommonLanguages } from '../../utils/prism';

export const MORE_LANGUAGES_ITEM_NAME = '__more-languages__';

export type LanguageCategory = 'plain' | 'markup' | 'query' | 'config' | 'code';

export interface LanguagePickerItem {
    name: string;
    title?: string;
    kind: 'language' | 'more';
    expanded?: boolean;
    [key: string]: unknown;
}

const MARKUP_LANGUAGES = new Set([
    'asciidoc',
    'bbcode',
    'haml',
    'html',
    'latex',
    'markdown',
    'markup',
    'pug',
    'svg',
    'tex',
    'textile',
    'xml',
    'xml-doc',
]);

const QUERY_LANGUAGES = new Set([
    'cypher',
    'graphql',
    'kusto',
    'promql',
    'q',
    'sparql',
    'sql',
    'xquery',
]);

const CONFIG_LANGUAGES = new Set([
    'docker',
    'dockerfile',
    'editorconfig',
    'git',
    'hcl',
    'ini',
    'json',
    'json5',
    'jsonp',
    'nginx',
    'properties',
    'rego',
    'toml',
    'yang',
    'yaml',
]);

export function languageCategory(name: string): LanguageCategory {
    const normalized = name.toLowerCase();
    if (!normalized || normalized === 'plain' || normalized === 'text' || normalized === 'txt')
        return 'plain';
    if (MARKUP_LANGUAGES.has(normalized))
        return 'markup';
    if (QUERY_LANGUAGES.has(normalized))
        return 'query';
    if (CONFIG_LANGUAGES.has(normalized))
        return 'config';
    return 'code';
}

export function buildLanguagePickerItems(expanded: boolean): LanguagePickerItem[] {
    const common = listCommonLanguages().map(item => ({ ...item, kind: 'language' as const }));
    const additional = expanded
        ? listAdditionalLanguages().map(item => ({ ...item, kind: 'language' as const }))
        : [];

    return [
        ...common,
        ...additional,
        {
            name: MORE_LANGUAGES_ITEM_NAME,
            kind: 'more',
            expanded,
        },
    ];
}
