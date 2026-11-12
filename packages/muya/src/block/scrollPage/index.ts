import type { Muya } from '../../muya';
import type { TState } from '../../state/types';
import type { Nullable } from '../../types';
import type Content from '../base/content';
import type TreeNode from '../base/treeNode';
import type { IConstructor, TBlockPath } from '../types';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isHTMLElement, isMouseEvent } from '../../utils';
import { getBlock } from '../../utils/dom';
import logger from '../../utils/logger';
import Parent from '../base/parent';

const debug = logger('scrollpage:');

interface IBlurFocus {
    blur: Nullable<Content>;
    focus: Nullable<Content>;
}

export class ScrollPage extends Parent {
    private _blurFocus: IBlurFocus = { blur: null, focus: null };

    static override blockName = 'scrollpage';

    // Registry of block constructors keyed by their static blockName.
    // Stored as Parent constructors — the overwhelming majority of
    // call sites do `loadBlock(...).create(...).append(child)`, which only
    // makes sense for Parent. Content leaves register themselves through
    // their containing Parent's create flow and don't go through
    // `loadBlock(...).create()` externally.
    private static _registeredBlocks = new Map<string, IConstructor<Parent>>();

    static register(Block: IConstructor<TreeNode>) {
        const { blockName } = Block;
        this._registeredBlocks.set(blockName, Block as IConstructor<Parent>);
    }

    // Returns the registered constructor. Asserts non-undefined for
    // callers (the registry is populated by `registerBlocks()` once at
    // `editor.init()` time, and `loadBlock` runs strictly after init.).
    // Mismatched names hit the warn branch and the caller crashes at
    // `.create()` — matches the original loose contract.
    static loadBlock(blockName: string): IConstructor<Parent> {
        const block = this._registeredBlocks.get(blockName);

        if (!block)
            debug.warn(`block:${blockName} is not existed.`);

        return block as IConstructor<Parent>;
    }

    static create(muya: Muya, state: TState[]) {
        const scrollPage = new ScrollPage(muya);

        scrollPage.append(
            ...state.map((block) => {
                return this.loadBlock(block.name).create(muya, block);
            }),
        );

        scrollPage.parent!.domNode!.appendChild(scrollPage.domNode!);

        return scrollPage;
    }

    override get path() {
        return [];
    }

    constructor(muya: Muya) {
        super(muya);
        // muya is not extends Parent, but it is the parent of scrollPage.
        // ScrollPage is the tree root; widening the base `TreeNode.parent`
        // declaration would ripple to every node, so spell out the boundary.
        // eslint-disable-next-line no-restricted-syntax
        this.parent = muya as unknown as Parent;
        this.tagName = 'div';
        this.classList = ['mu-container'];

        this.createDomNode();
        this._listenDomEvent();
    }

    override getState() {
        debug.warn('You can never call `getState` in scrollPage');

        return {} as TState;
    }

    private _listenDomEvent() {
        const { eventCenter } = this.muya;
        const { domNode } = this;

        eventCenter.attachDOMEvent(domNode!, 'click', this._clickHandler.bind(this));
        eventCenter.attachDOMEvent(this.muya.domNode, 'dblclick', this._doubleClickHandler.bind(this));
    }

    updateState(state: TState[]) {
        const { muya } = this;
        // Empty scrollPage dom
        this.empty();
        this.append(
            ...state.map((block) => {
                return ScrollPage.loadBlock(block.name).create(muya, block);
            }),
        );
    }

    /**
     * Find the content block by the path
     * @param {Array} path
     */
    queryBlock(path: TBlockPath) {
        if (path.length === 0)
            return this;

        const p = path.shift() as number;
        const block = this.find(p) as Parent & { queryBlock: (p: TBlockPath) => Parent | Content | undefined };
        return block && path.length ? block.queryBlock(path) : block;
    }

    updateRefLinkAndImage(label: string) {
        const REG = new RegExp(`\\[${label}\\](?!:)`);

        this.breadthFirstTraverse((node) => {
            if (node.isContent() && REG.test(node.text))
                node.update();
        });
    }

    handleBlurFromContent(block: Content) {
        this._blurFocus.blur = block;
        requestAnimationFrame(this._updateActiveStatus);
    }

    handleFocusFromContent(block: Content) {
        this._blurFocus.focus = block;
        requestAnimationFrame(this._updateActiveStatus);
    }

    private _updateActiveStatus = () => {
        const { blur, focus } = this._blurFocus;

        if (blur == null && focus == null)
            return;

        let needBlurBlocks: Parent[] = [];
        let needFocusBlocks: Parent[] = [];
        let block;

        if (blur && focus) {
            needFocusBlocks = focus.getAncestors();
            block = blur.parent;
            while (block && block.isParent && block.isParent() && !needFocusBlocks.includes(block)) {
                needBlurBlocks.push(block);
                block = block.parent;
            }
        }
        else if (blur) {
            needBlurBlocks = blur.getAncestors();
        }
        else if (focus) {
            needFocusBlocks = focus.getAncestors();
        }

        if (needBlurBlocks.length) {
            needBlurBlocks.forEach((b) => {
                b.active = false;
            });
        }

        if (needFocusBlocks.length) {
            needFocusBlocks.forEach((b) => {
                b.active = true;
            });
        }

        this._blurFocus = {
            blur: null,
            focus: null,
        };
    };

    private _focusOrCreateParagraph(previous: Nullable<Parent>, next: Nullable<Parent>) {
        const existing = [previous, next].find(block =>
            block?.blockName === 'paragraph' && block.firstContentInDescendant()?.text === '',
        );
        let paragraph = existing;
        if (!paragraph) {
            this.muya.editor.history.cutoff();
            paragraph = ScrollPage.loadBlock('paragraph').create(this.muya, { name: 'paragraph', text: '' });
            if (next)
                this.insertBefore(paragraph, next, 'user');
            else
                this.append(paragraph, 'user');
        }
        this.muya.domNode.focus({ preventScroll: true });
        paragraph.firstContentInDescendant()?.setCursor(0, 0, true);
    }

    private _doubleClickParagraph(event: MouseEvent, block: Parent | Content) {
        const content = block.isContent() ? block : block.firstContentInDescendant();
        if (!content)
            return;
        if (content.text === '') {
            this.muya.domNode.focus({ preventScroll: true });
            content.setCursor(0, 0, true);
            return;
        }
        const outer = block.outMostBlock;
        if (outer?.blockName !== 'paragraph' || !content.domNode?.querySelector('.mu-inline-image'))
            return;
        const range = document.createRange();
        range.selectNodeContents(content.domNode);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        if (!rects.length || rects.some(rect => event.clientY <= rect.bottom))
            return;
        event.preventDefault();
        this._focusOrCreateParagraph(outer, outer.next);
    }

    private _doubleClickHandler(event: Event) {
        if (!(event instanceof MouseEvent) || event.button !== 0 || !isHTMLElement(event.target))
            return;
        const target = event.target;
        if (target.closest('[contenteditable="false"], button, input, textarea, a'))
            return;
        const block = getBlock(target);
        if (block?.blockName === 'paragraph' || block?.blockName === 'paragraph.content') {
            this._doubleClickParagraph(event, block);
            return;
        }

        if (target !== this.domNode && target !== this.muya.domNode)
            return;
        const bounds = this.domNode!.getBoundingClientRect();
        if (event.clientX <= bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top)
            return;

        let previous: Nullable<Parent> = null;
        let next = this.firstChild as Nullable<Parent>;
        while (next) {
            const rect = next.domNode!.getBoundingClientRect();
            if (event.clientY < rect.top)
                break;
            if (event.clientY <= rect.bottom)
                return;
            previous = next;
            next = next.next;
        }
        event.preventDefault();
        this._focusOrCreateParagraph(previous, next);
    }

    // Preserve single-click insertion at the end of the document.
    private _clickHandler(event: Event) {
        if (!isMouseEvent(event) || !isHTMLElement(event.target))
            return;

        const target = event.target;

        if (target[BLOCK_DOM_PROPERTY] === this) {
            const lastChild = this.lastChild as Parent;
            const { clientY } = event;
            const bottom = lastChild?.domNode?.getBoundingClientRect().bottom ?? 0;
            if (clientY > bottom)
                this._focusOrCreateParagraph(lastChild, null);
        }
    }
}
