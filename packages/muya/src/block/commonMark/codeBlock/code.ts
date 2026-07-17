import type I18n from '../../../i18n';
import type { Muya } from '../../../muya';
import type { CodeContentState, TState } from '../../../state/types';
import type { Nullable } from '../../../types';
import type CodeBlock from './index';
import { fromEvent } from 'rxjs';
import { CopyType } from '../../../clipboard/types';
import { LINE_NUMBERS_ROWS_CLASS, lineNumbersWrapperHTML } from '../../../utils/codeBlockLineNumbers';
import logger from '../../../utils/logger';
import { languageDisplayName } from '../../../utils/prism';
import { h, toHTML } from '../../../utils/snabbdom';
import { renderActionIcon } from '../../../ui/actionIcons';
import Parent from '../../base/parent';
import { ScrollPage } from '../../scrollPage';
import '../../../ui/actionIcons.css';

const debug = logger('code:');

function renderCopyButton(i18n: I18n) {
    const selector = 'a.mu-code-copy';
    const iconVnode = h('i.icon', renderActionIcon('copy'));

    return h(
        selector,
        {
            attrs: {
                title: i18n.t('Copy content'),
                contenteditable: 'false',
            },
        },
        [iconVnode, h('span.mu-code-action-label', i18n.t('Copy'))],
    );
}

function renderLanguageButton(i18n: I18n, language: string) {
    return h(
        'button.mu-code-language-toggle',
        {
            attrs: {
                type: 'button',
                title: i18n.t('Change Language'),
                contenteditable: 'false',
            },
        },
        [
            h('span.mu-code-language-label', languageDisplayName(language)),
            h('span.mu-code-language-chevron', '⌄'),
        ],
    );
}

function renderWrapButton(i18n: I18n, wrapped: boolean) {
    const label = wrapped ? i18n.t('Cancel Wrap') : i18n.t('Auto Wrap');

    return h(
        'button.mu-code-wrap-toggle',
        {
            attrs: {
                type: 'button',
                title: label,
                contenteditable: 'false',
            },
        },
        [
            h('span.mu-code-action-icon', renderActionIcon('wrap')),
            h('span.mu-code-action-label', label),
        ],
    );
}

function renderActions(i18n: I18n, withWrap: boolean, language: string, wrapped: boolean) {
    const children = withWrap
        ? [
                renderLanguageButton(i18n, language),
                renderWrapButton(i18n, wrapped),
                renderCopyButton(i18n),
            ]
        : [renderCopyButton(i18n)];

    return h('div.mu-code-actions', { attrs: { contenteditable: 'false' } }, children);
}

class Code extends Parent {
    public override parent: Nullable<CodeBlock> = null;
    // Line numbers only apply to real code blocks (`code-block`). Frontmatter,
    // math, diagram, and html containers all reuse `Code` but must not show
    // a gutter — so we gate creation on the state name, not just the option.
    private readonly _withLineNumbers: boolean;
    // Cached reference to the gutter wrapper so CodeBlockContent.update() does
    // not pay a querySelector on every keystroke.
    public lineNumbersWrapper: HTMLElement | null = null;
    private readonly _initialLanguage: string;

    static override blockName = 'code';

    static create(muya: Muya, state: CodeContentState) {
        const code = new Code(
            muya,
            state.name === 'code-block',
            state.name === 'code-block' ? state.meta.lang : '',
        );

        code.append(ScrollPage.loadBlock('codeblock.content').create(muya, state));

        return code;
    }

    override get path() {
        const { path: pPath } = this.parent!;

        return [...pPath];
    }

    constructor(muya: Muya, withLineNumbers: boolean = false, initialLanguage: string = '') {
        super(muya);
        this.tagName = 'code';
        this.classList = ['mu-code'];
        this.attributes = { spellcheck: 'false' };
        this._withLineNumbers = withLineNumbers;
        this._initialLanguage = initialLanguage;
        this.createDomNode();
        this._createCopyNode();
        this._listen();
    }

    override getState(): TState {
        debug.warn('You can never call `getState` in code');
        return {} as TState;
    }

    // Create the code actions at the top-right; when codeBlockLineNumbers is on
    // AND this Code is hosted inside a real code-block (not frontmatter / math /
    // diagram / html), also create an empty line-numbers wrapper and cache
    // its element so CodeBlockContent.update() can sync rows without a
    // querySelector per keystroke.
    private _createCopyNode() {
        const { i18n, options } = this.muya;
        const withLineNumbers = options.codeBlockLineNumbers && this._withLineNumbers;
        let html = toHTML(renderActions(
            i18n,
            this._withLineNumbers,
            this._initialLanguage,
            options.wrapCodeBlocks ?? false,
        ));
        if (withLineNumbers)
            html += lineNumbersWrapperHTML();
        this.domNode!.innerHTML = html;
        this.lineNumbersWrapper = withLineNumbers
            ? this.domNode!.querySelector<HTMLElement>(`.${LINE_NUMBERS_ROWS_CLASS}`)
            : null;
    }

    private _listen() {
        const { editor } = this.muya;

        if (this.domNode == null)
            return;

        const copyButton = this.domNode.querySelector<HTMLElement>('a.mu-code-copy');
        const wrapButton = this.domNode.querySelector<HTMLElement>('button.mu-code-wrap-toggle');
        const languageButton = this.domNode.querySelector<HTMLElement>('button.mu-code-language-toggle');

        // Copy code content to clipboard.
        const copyHandler = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();

            const codeContent = this.firstContentInDescendant();

            if (codeContent == null) {
                debug.error('Has no code content');
                return;
            }

            editor.clipboard.copy(CopyType.COPY_CODE_CONTENT, codeContent.text);
        };

        const mousedownHandler = (event: Event) => {
            event.preventDefault();
        };

        if (copyButton) {
            fromEvent(copyButton, 'click').subscribe(copyHandler);
            fromEvent(copyButton, 'mousedown').subscribe(mousedownHandler);
        }

        if (languageButton) {
            fromEvent(languageButton, 'click').subscribe((event) => {
                event.preventDefault();
                event.stopPropagation();
                const languageInput = this.parent?.firstContentInDescendant();
                if (!languageInput)
                    return;
                this.muya.eventCenter.emit('code-language-picker', {
                    reference: languageButton,
                    block: languageInput,
                    language: this.parent?.lang ?? '',
                });
            });
            fromEvent(languageButton, 'mousedown').subscribe(mousedownHandler);
        }

        if (wrapButton) {
            fromEvent(wrapButton, 'click').subscribe((event) => {
                event.preventDefault();
                event.stopPropagation();
                this.muya.eventCenter.emit('code-wrap-toggle', {
                    enabled: !this.muya.options.wrapCodeBlocks,
                });
            });
            fromEvent(wrapButton, 'mousedown').subscribe(mousedownHandler);
        }
    }
}

export default Code;
