import type { Muya } from '../../../muya';
import type { IHtmlBlockState, TState } from '../../../state/types';
import { CLASS_NAMES, PREVIEW_DOMPURIFY_CONFIG } from '../../../config';
import { sanitize } from '../../../utils';
import sanitizeHtml from '../../../utils/dompurify';
import { getImageSrc } from '../../../utils/image';
import logger from '../../../utils/logger';
import { getHighlightHtml } from '../../../utils/marked/getHighlightHtml';
import Parent from '../../base/parent';

const debug = logger('htmlPreview:');

// Elements whose rendered content comes from attributes (e.g. `src`) rather
// than child nodes, so an empty tag body must not be treated as an empty block.
const SELF_CONTAINED_MEDIA = new Set(['video', 'audio']);

// A single element with an empty body (`<div></div>`), except self-contained
// media elements whose content lives in attributes (`<video src=...></video>`).
export function isEmptyHtmlBlock(html: string): boolean {
    // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation
    const match = html.trim().match(/^<([a-z][a-z\d]*)[^>]*>\s*<\/\1>$/);
    return !!match && !SELF_CONTAINED_MEDIA.has(match[1]);
}

export function renderMarkdownInDetails(doc: Document): void {
    for (const details of doc.querySelectorAll('details')) {
        const summary = Array.from(details.children)
            .find(child => child.tagName.toLowerCase() === 'summary');
        if (!summary)
            continue;

        const bodyNodes: ChildNode[] = [];
        let node = summary.nextSibling;
        while (node) {
            bodyNodes.push(node);
            node = node.nextSibling;
        }

        const markdown = bodyNodes.map((child) => {
            return child instanceof Element ? child.outerHTML : child.textContent ?? '';
        }).join('');
        if (!markdown.trim())
            continue;

        const lines = markdown.split('\n');
        while (lines.length && !lines[0].trim())
            lines.shift();
        while (lines.length && !lines.at(-1)!.trim())
            lines.pop();
        const indentation = Math.min(...lines
            .filter(line => line.trim())
            .map(line => line.match(/^\s*/)?.[0].length ?? 0));
        const normalizedMarkdown = lines
            .map(line => line.slice(indentation))
            .join('\n');

        const rendered = sanitizeHtml(
            getHighlightHtml(normalizedMarkdown),
            PREVIEW_DOMPURIFY_CONFIG,
        ) as string;
        const renderedBody = doc.createElement('div');
        renderedBody.innerHTML = rendered;
        const topLevelListItems = Array.from(renderedBody.children)
            .filter(child => child.tagName.toLowerCase() === 'li');
        if (topLevelListItems.length) {
            const list = doc.createElement('ul');
            topLevelListItems[0].before(list);
            topLevelListItems.forEach(item => list.appendChild(item));
        }

        bodyNodes.forEach(child => child.remove());
        details.append(...Array.from(renderedBody.childNodes));
    }
}

class HTMLPreview extends Parent {
    private _html: string;

    static override blockName = 'html-preview';

    static create(muya: Muya, state: IHtmlBlockState) {
        const htmlBlock = new HTMLPreview(muya, state);

        return htmlBlock;
    }

    override get path() {
        debug.warn('You can never call `get path` in htmlPreview');
        return [];
    }

    constructor(muya: Muya, { text }: IHtmlBlockState) {
        super(muya);
        this.tagName = 'div';
        this._html = text;
        this.classList = [CLASS_NAMES.MU_HTML_PREVIEW];
        this.attributes = {
            spellcheck: 'false',
            contenteditable: 'false',
        };
        this.createDomNode();
        this.update();
    }

    update(html = this._html) {
        if (this._html !== html)
            this._html = html;

        const { disableHtml } = this.muya.options;
        const htmlContent = sanitize(html, PREVIEW_DOMPURIFY_CONFIG, disableHtml) as string;

        // handle empty html bock
        if (isEmptyHtmlBlock(htmlContent)) {
            this.domNode!.innerHTML
                = `<div class="${CLASS_NAMES.MU_EMPTY}">&lt;Empty HTML Block&gt;</div>`;
        }
        else {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            renderMarkdownInDetails(doc);
            const imgs = doc.documentElement.querySelectorAll('img');

            for (const img of imgs) {
                const src = img.getAttribute('src')!;
                const imageSrc = getImageSrc(src);
                img.setAttribute('src', imageSrc.src);
            }

            this.domNode!.innerHTML
                = doc.documentElement!.querySelector('body')!.innerHTML;
        }
    }

    override getState(): TState {
        debug.warn('You can never call `getState` in htmlPreview');
        return {} as TState;
    }
}

export default HTMLPreview;
