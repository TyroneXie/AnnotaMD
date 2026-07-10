import Fuse from 'fuse.js';
import Prism from 'prismjs';
import { languages } from 'prismjs/components.js';
import initLoadLanguage, { loadedLanguages, transformAliasToOrigin } from './loadLanguage';

const prism = Prism;
window.Prism = Prism;
import('prismjs/plugins/keep-markup/prism-keep-markup');

const COMMON_LANGUAGE_NAMES = [
    'javascript',
    'typescript',
    'python',
    'java',
    'json',
    'bash',
    'sql',
    'markup',
    'css',
    'yaml',
    'markdown',
    'go',
    'rust',
    'c',
    'cpp',
    'csharp',
    'kotlin',
    'swift',
    'php',
    'ruby',
];

const PLAIN_TEXT_LANGUAGE = {
    name: '',
    title: 'Plain Text',
    alias: 'plain text txt',
};

// prismjs ships C++ without a `c++`/`h++` alias, so fenced blocks tagged
// ```c++ never resolve to the cpp grammar and stay unhighlighted (#2910).
// Add each alias only once — `components.languages` is a shared singleton and
// this module may be evaluated more than once (tests, HMR); pushing duplicates
// makes prism's dependency loader throw "c++ cannot be alias for both cpp and
// cpp".
if (languages.cpp) {
    const existing = languages.cpp.alias;
    const alias = Array.isArray(existing) ? [...existing] : existing ? [existing] : [];
    for (const name of ['c++', 'h++']) {
        if (!alias.includes(name))
            alias.push(name);
    }
    languages.cpp.alias = alias;
}

const langs: {
    name: string;
    [key: string]: string;
}[] = [];

const canonicalLangs: {
    name: string;
    [key: string]: string;
}[] = [];

langs.push(PLAIN_TEXT_LANGUAGE);

for (const name of Object.keys(languages)) {
    if (name === 'meta')
        continue;
    const lang = languages[name];
    const canonical = {
        name,
        ...lang,
    };
    langs.push(canonical);
    canonicalLangs.push(canonical);
    if (lang.alias) {
        if (typeof lang.alias === 'string') {
            langs.push({
                name: lang.alias,
                ...lang,
            });
        }
        else if (Array.isArray(lang.alias)) {
            langs.push(
                ...lang.alias.map((a: string) => ({
                    name: a,
                    ...lang,
                })),
            );
        }
    }
}

function listLanguages() {
    const priority = new Map(COMMON_LANGUAGE_NAMES.map((name, index) => [name, index]));

    return [...canonicalLangs].sort((a, b) => {
        const aPriority = priority.get(a.name) ?? Number.MAX_SAFE_INTEGER;
        const bPriority = priority.get(b.name) ?? Number.MAX_SAFE_INTEGER;
        if (aPriority !== bPriority)
            return aPriority - bPriority;

        const aLabel = a.title || a.name;
        const bLabel = b.title || b.name;
        return aLabel.localeCompare(bLabel);
    });
}

function listCommonLanguages() {
    const byName = new Map(canonicalLangs.map(item => [item.name, item]));
    return [
        PLAIN_TEXT_LANGUAGE,
        ...COMMON_LANGUAGE_NAMES
            .map(name => byName.get(name))
            .filter((item): item is (typeof canonicalLangs)[number] => Boolean(item)),
    ];
}

function listAdditionalLanguages() {
    const common = new Set(COMMON_LANGUAGE_NAMES);
    return canonicalLangs
        .filter(item => !common.has(item.name))
        .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));
}

function languageDisplayName(info: string) {
    const name = info.trim().split(/\s+/)[0]?.toLowerCase() || '';
    if (!name)
        return 'Plain Text';

    const item = langs.find(lang => lang.name.toLowerCase() === name);
    if (item?.title)
        return item.title;

    return name
        .split(/[-_]/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

const loadLanguage = initLoadLanguage(Prism);

function search(text: string) {
    if (!text || typeof text !== 'string')
        return [];

    const fuse = new Fuse(langs, {
        includeScore: true,
        keys: ['name', 'title', 'alias'],
    });

    return fuse.search(text).map(i => i.item).slice(0, 5);
}

// In LaTeX `\%` is an escaped literal percent, not a line comment, but
// prismjs's default latex `comment` token (`/%.*/`) swallows everything after
// it. Require the `%` to not follow a backslash so `\%` highlights as a normal
// control sequence (#3037). tex/context alias the same grammar object, so this
// one override covers all three.
export function patchLatexEscapedPercent(prismInstance: typeof Prism) {
    const latex = prismInstance.languages.latex as { comment?: unknown } | undefined;
    if (latex?.comment)
        latex.comment = { pattern: /(^|[^\\])%.*/, lookbehind: true };
}

// pre load latex and yaml and html for `math block` \ `front matter` and `html block`
loadLanguage('latex').then(() => patchLatexEscapedPercent(prism));
loadLanguage('yaml');

export { walkTokens } from './walkToken';
export {
    languageDisplayName,
    listAdditionalLanguages,
    listCommonLanguages,
    listLanguages,
    loadedLanguages,
    loadLanguage,
    search,
    transformAliasToOrigin,
};
export default prism;
