import type { VNode } from 'snabbdom';
import type LangInputContent from '../../block/content/langInputContent';
import type ParagraphContent from '../../block/content/paragraphContent';
import type { Muya } from '../../index';
import { ScrollPage } from '../../block/scrollPage';
import { firstWordOfInfo } from '../../utils';
import { languageDisplayName, search } from '../../utils/prism';

import { h, patch } from '../../utils/snabbdom';
import BaseScrollFloat from '../baseScrollFloat';
import {
    buildLanguagePickerItems,
    languageCategory,
    MORE_LANGUAGES_ITEM_NAME,
} from './languageItems';
import type { LanguagePickerItem } from './languageItems';

import './index.css';

const defaultOptions = {
    placement: 'bottom-start' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

const DIAGRAM_LANGS = new Set(['mermaid', 'vega-lite', 'plantuml', 'flowchart', 'sequence']);

type LanguageItem = LanguagePickerItem;

function uniqueLanguageItems(items: LanguageItem[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
        const label = item.title || item.name;
        if (seen.has(label))
            return false;
        seen.add(label);
        return true;
    });
}

// The language the user actually typed after the ``` fence. The selector's
// fuzzy search may resolve a non-code language (e.g. `vega-lite`) to an
// unrelated Prism language, so the diagram check keys off this raw text.
function typedFenceLang(text: string): string {
    return text.match(/`{3,}\s*([\w-]+)/)?.[1] ?? '';
}

// Build the state for the block a ```lang fence becomes. Diagram languages
// (from the typed text) become a diagram block, mirroring markdownToState's
// file-load path; GitLab math becomes a math-block; everything else a fenced
// code block highlighted with the selector's matched language.
function newBlockStateForLang(typedLang: string, matchedLang: string, isGitlabMath: boolean) {
    if (isGitlabMath)
        return { name: 'math-block', meta: { mathStyle: 'gitlab' }, text: '' };

    if (DIAGRAM_LANGS.has(typedLang)) {
        return {
            name: 'diagram',
            meta: { type: typedLang, lang: typedLang === 'vega-lite' ? 'json' : 'yaml' },
            text: '',
        };
    }

    return { name: 'code-block', meta: { lang: matchedLang, type: 'fenced' }, text: '' };
}

export class CodeBlockLanguageSelector extends BaseScrollFloat {
    static pluginName = 'codePicker';
    public override capturesContentKeydown = true;
    private _oldVNode: VNode | null = null;
    private _block: ParagraphContent | LangInputContent | null = null;
    private _searchInput: HTMLInputElement = document.createElement('input');
    private _showAllLanguages = false;

    constructor(muya: Muya, options = {}) {
        const name = 'mu-list-picker';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        this._searchInput.className = 'mu-language-search';
        this._searchInput.placeholder = muya.i18n.t('Search Languages...');
        this._searchInput.setAttribute('aria-label', muya.i18n.t('Search Languages...'));
        this.container!.insertBefore(this._searchInput, this.scrollElement);
        this.listen();
    }

    override listen() {
        super.listen();
        const { eventCenter } = this.muya;

        this._searchInput.addEventListener('input', () => {
            const query = this._searchInput.value.trim();
            this.renderArray = query
                ? uniqueLanguageItems(
                    search(query).map(item => ({ ...item, kind: 'language' as const })),
                )
                : buildLanguagePickerItems(this._showAllLanguages);
            this.activeItem = this.renderArray[0] ?? null;
            this.render();
        });

        eventCenter.on('code-language-picker', ({ reference, block, language }) => {
            if (block?.blockName !== 'language-input')
                return;

            this._block = block;
            this._searchInput.value = '';
            const currentLanguage = firstWordOfInfo(language || block.text);
            const currentLabel = languageDisplayName(currentLanguage);
            this._showAllLanguages = false;
            this.renderArray = buildLanguagePickerItems(false, currentLanguage);
            this.activeItem = this.renderArray.find(
                item => (item as LanguageItem).name === currentLanguage
                    || (item as LanguageItem).title === currentLabel,
            ) ?? null;
            this.activeItem ??= this.renderArray[0] ?? null;
            this.show(reference);
            this.render();
            requestAnimationFrame(() => this._searchInput.focus());
        });

        eventCenter.on('content-change', ({ block, source }) => {
            if (block.blockName !== 'paragraph.content' && block.blockName !== 'language-input')
                return;

            // The visible code caption persists through the hidden language-input
            // block. It is not a language search, and that hidden node cannot be
            // used as a Floating UI reference without jumping to the viewport origin.
            if (source === 'code-caption') {
                this.hide();
                return;
            }

            const { text, domNode } = block;
            let lang = '';
            if (block.blockName === 'paragraph.content') {
                const token = text.match(/(^ {0,3}`{3,})([^` ]+)/);
                if (token && token[2])
                    lang = token[2];
            }
            else if (block.blockName === 'language-input') {
                lang = text;
            }

            const modes = search(lang);
            if (modes.length) {
                this._block = block;
                this.show(domNode);
                this.renderArray = modes.map(item => ({ ...item, kind: 'language' as const }));
                this.activeItem = this.renderArray[0];
                this.render();
            }
            else {
                this.hide();
            }
        });

        // Self-hide when the caret leaves the picker's target block (#4654).
        eventCenter.on('selection-change', ({ anchorBlock }) => {
            if (this.status && anchorBlock !== this._block)
                this.hide();
        });
    }

    render() {
        const { renderArray, _oldVNode: oldVNode, scrollElement, activeItem } = this;
        const renderedItems = (renderArray as LanguageItem[]).map((item) => {
            const isMoreItem = item.name === MORE_LANGUAGES_ITEM_NAME;
            const label = isMoreItem
                ? this.muya.i18n.t(item.expanded ? 'Fewer Languages' : 'More Languages')
                : item.name
                    ? item.title || item.name
                    : this.muya.i18n.t('Plain Text');
            const text = h('div.language', label);
            const selector = isMoreItem
                ? activeItem === item
                    ? 'div.item.mu-language-more-footer.active'
                    : 'div.item.mu-language-more-footer'
                : activeItem === item
                    ? 'li.item.active'
                    : 'li.item';
            const itemContent = [text];

            if (isMoreItem) {
                itemContent.push(h('span.mu-language-more-chevron', item.expanded ? '⌃' : '⌄'));
            }
            else {
                const category = languageCategory(item.name);
                const glyph = {
                    plain: 'T',
                    markup: '<>',
                    query: 'Q',
                    config: '{}',
                    code: '</>',
                }[category];
                itemContent.push(
                    h(
                        'div.icon-wrapper',
                        h(`span.mu-language-generic-icon.${category}`, glyph),
                    ),
                );
            }

            return {
                item,
                vnode: h(
                    selector,
                    {
                        dataset: {
                            label: item.name,
                        },
                        on: {
                            click: () => {
                                this.selectItem(item);
                            },
                        },
                    },
                    itemContent,
                ),
            };
        });

        const languageRows = renderedItems
            .filter(({ item }) => item.name !== MORE_LANGUAGES_ITEM_NAME)
            .map(({ vnode }) => vnode);
        const moreLanguagesRow = renderedItems.find(
            ({ item }) => item.name === MORE_LANGUAGES_ITEM_NAME,
        )?.vnode;
        const list = languageRows.length
            ? h('ul', languageRows)
            : h('div.no-result', this.muya.i18n.t('No result'));
        const vnode = h(
            'div.mu-language-list-shell',
            moreLanguagesRow ? [list, moreLanguagesRow] : [list],
        );

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(scrollElement!, vnode);

        this._oldVNode = vnode;
    }

    getItemElement(item: { name: string }): HTMLElement {
        const { name } = item;

        // Item element will always existed, so use !.
        return this.floatBox!.querySelector(`[data-label="${name}"]`)!;
    }

    override selectItem(item: { name: string }) {
        if (item.name === MORE_LANGUAGES_ITEM_NAME) {
            this._showAllLanguages = !this._showAllLanguages;
            this.renderArray = buildLanguagePickerItems(this._showAllLanguages);
            this.activeItem = this.renderArray[this.renderArray.length - 1] ?? null;
            this.render();
            return;
        }

        const { _block: block, muya } = this;
        const { name } = item;

        if (!block)
            return;

        // Bail if the block was detached from the document while the picker
        // stayed open — mutating an orphaned block crashes on a null parent (#4654).
        if (!block.outMostBlock)
            return;

        function isParagraphContent(
            b: ParagraphContent | LangInputContent,
        ): b is ParagraphContent {
            return b.blockName === 'paragraph.content';
        }

        if (isParagraphContent(block)) {
            const isGitlabMath
                = muya.options.isGitlabCompatibilityEnabled && name === 'math';
            const state = newBlockStateForLang(typedFenceLang(block.text), name, isGitlabMath);

            const newBlock = ScrollPage.loadBlock(state.name).create(
                this.muya,
                state,
            );
            block.parent?.replaceWith(newBlock);
            const codeContent = newBlock.lastContentInDescendant();
            codeContent?.setCursor(0, 0);
        }
        else {
            const codeBlock = block.parent!;
            block.text = name;
            block.update();
            codeBlock.lang = name;
            codeBlock.lastContentInDescendant()?.setCursor(0, 0);
        }

        super.selectItem(item);
    }

    override hide() {
        this._searchInput.value = '';
        this._showAllLanguages = false;
        super.hide();
    }
}
