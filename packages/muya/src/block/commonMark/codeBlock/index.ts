import type { Muya } from '../../../muya';
import type { ICodeBlockState } from '../../../state/types';
import type LangInputContent from '../../content/langInputContent';
import type { TBlockPath } from '../../types';
import diff from 'fast-diff';
import { diffToTextOp, firstWordOfInfo } from '../../../utils';
import { codeInfoTitle, withCodeInfoTitle } from '../../../utils/codeInfoString';
import { operateClassName } from '../../../utils/dom';
import logger from '../../../utils/logger';
import { languageDisplayName, loadLanguage } from '../../../utils/prism';
import Parent from '../../base/parent';
import { ScrollPage } from '../../scrollPage';

const debug = logger('codeblock:');

class CodeBlock extends Parent {
    public meta: ICodeBlockState['meta'];
    static override blockName = 'code-block';

    static create(muya: Muya, state: ICodeBlockState) {
        const codeBlock = new CodeBlock(muya, state);
        const { lang } = state.meta;

        const langInput = ScrollPage.loadBlock('language-input').create(
            muya,
            state,
        );
        const code = ScrollPage.loadBlock('code').create(muya, state);

        codeBlock.append(langInput);
        codeBlock.append(code);
        // CodeBlockContent is first created before its parent chain exists.
        // Render once more after attachment so code-only rich markers can be
        // recognized on the initial WYSIWYG pass, including language-less
        // fenced blocks that never trigger the async language loader.
        code.lastContentInDescendant()?.update();
        codeBlock._createCollapseIndicator();
        codeBlock._createCaption();

        // Move the line-numbers gutter from .mu-code into the pre so that
        // .mu-code's overflow (hidden/auto) does not clip the left-side gutter.
        // The pre already has position:relative and padding-left:2.5em for this.
        const lnWrapper = (code as { lineNumbersWrapper?: HTMLElement | null }).lineNumbersWrapper;
        if (lnWrapper) {
            codeBlock.domNode!.appendChild(lnWrapper);
            // The gutter fills from CodeBlockContent.update(), a no-op until the
            // tree is wired. The language-load callback below re-runs it, but
            // language-less / unknown-language / indented blocks never load one —
            // seed them here so first render fills the gutter regardless of language.
            requestAnimationFrame(() => {
                codeBlock.lastContentInDescendant()?.update();
            });
        }

        if (lang) {
            requestAnimationFrame(() => {
                codeBlock.lang = lang;
            });
        }

        return codeBlock;
    }

    get lang() {
        return this.meta.lang;
    }

    set lang(value) {
        this.meta.lang = value;
        const languageLabel = this.domNode?.querySelector<HTMLElement>('.mu-code-language-label');
        if (languageLabel)
            languageLabel.textContent = languageDisplayName(value);

        if (this.meta.type !== 'fenced') {
            this.meta.type = 'fenced';
            // dispatch change to modify json state
            const diffs = diff('indented', 'fenced');
            const { path } = this;
            path.push('meta', 'type');

            this.jsonState.editOperation(path, diffToTextOp(diffs));

            operateClassName(this.domNode!, 'remove', 'mu-indented-code');
            operateClassName(this.domNode!, 'add', 'mu-fenced-code');
        }

        // `value` is the full info string; load Prism for its first word only.
        const language = firstWordOfInfo(value);
        !!language
        && loadLanguage(language)
            .then((infoList) => {
                if (!Array.isArray(infoList))
                    return;
                // There are three status `loaded`, `noexist` and `cached`.
                // if the status is `loaded`, indicated that it's a new loaded language
                const needRender = infoList.some(
                    ({ status }) => status === 'loaded' || status === 'cached',
                );
                if (needRender)
                    this.lastContentInDescendant()?.update();
            })
            .catch((err) => {
                // if no parameter provided, will cause error.
                debug.warn(err);
            });
    }

    override get path(): TBlockPath {
        const { path: pPath } = this.parent!;
        const offset = this.parent!.offset(this);

        return [...pPath, offset];
    }

    constructor(muya: Muya, { meta }: ICodeBlockState) {
        super(muya);
        this.tagName = 'pre';
        this.meta = meta;
        this.classList = ['mu-code-block', `mu-${meta.type}-code`];
        if (muya.options.codeBlockLineNumbers)
            this.classList.push('mu-line-numbers');
        this.createDomNode();
    }

    private _createCaption() {
        const caption = document.createElement('input');
        caption.type = 'text';
        caption.className = 'mu-code-caption';
        caption.tabIndex = 0;
        caption.spellcheck = false;
        caption.placeholder = this.muya.i18n.t('Code Block');
        caption.value = codeInfoTitle(this.meta.lang);
        this.domNode!.appendChild(caption);

        const stopPropagation = (event: Event) => event.stopPropagation();
        this.muya.eventCenter.attachDOMEvent(caption, 'mousedown', stopPropagation);
        this.muya.eventCenter.attachDOMEvent(caption, 'click', stopPropagation);
        this.muya.eventCenter.attachDOMEvent(caption, 'keydown', (event) => {
            event.stopPropagation();
            if (event instanceof KeyboardEvent && event.key === 'Enter') {
                event.preventDefault();
                caption.blur();
            }
        });
        this.muya.eventCenter.attachDOMEvent(caption, 'input', (event) => {
            event.stopPropagation();
            const languageInput = this.firstContentInDescendant() as LangInputContent | null;
            languageInput?.updateInfoString(withCodeInfoTitle(this.meta.lang, caption.value));
        });
    }

    private _createCollapseIndicator() {
        const indicator = document.createElement('button');
        const collapseText = this.muya.i18n.t('Collapse Section');
        indicator.type = 'button';
        indicator.className = 'mu-code-collapse-indicator';
        indicator.contentEditable = 'false';
        indicator.setAttribute('aria-expanded', 'true');
        indicator.setAttribute('aria-label', collapseText);
        indicator.dataset.tooltip = collapseText;

        this.domNode!.addEventListener('mousedown', (event) => {
            if (
                this.domNode!.classList.contains('mu-code-collapsed')
                && event.target === this.domNode
            ) {
                event.preventDefault();
            }
        });
        indicator.addEventListener('mousedown', event => event.preventDefault());
        indicator.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const collapsed = this.domNode!.classList.toggle('mu-code-collapsed');
            if (collapsed)
                this.domNode!.contentEditable = 'false';
            else
                this.domNode!.removeAttribute('contenteditable');
            const text = this.muya.i18n.t(collapsed ? 'Expand Section' : 'Collapse Section');
            indicator.setAttribute('aria-expanded', String(!collapsed));
            indicator.setAttribute('aria-label', text);
            indicator.dataset.tooltip = text;
        });

        this.domNode!.appendChild(indicator);
    }

    queryBlock(path: TBlockPath) {
        if (path.length === 0) {
            return this;
        }
        else {
            if (path[0] === 'meta' || path[0] === 'type')
                return this;
            else if (path[0] === 'lang')
                return this.firstContentInDescendant();
            else
                return this.lastContentInDescendant();
        }
    }

    override getState(): ICodeBlockState {
        const state: ICodeBlockState = {
            name: 'code-block',
            meta: { ...this.meta },
            text: this.lastContentInDescendant()!.text,
        };

        return state;
    }
}

export default CodeBlock;
