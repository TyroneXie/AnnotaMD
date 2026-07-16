import type { VNode } from 'snabbdom';
import type Parent from '../../block/base/parent';
import type { Muya } from '../../index';
import type { IBaseOptions } from '../types';
import { autoUpdate, computePosition, flip, offset } from '@floating-ui/dom';

import BulletList from '../../block/commonMark/bulletList';
import OrderList from '../../block/commonMark/orderList';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isMouseEvent, throttle, verticalPositionInRect } from '../../utils';
import { h, patch } from '../../utils/snabbdom';

import './index.css';

const LEFT_OFFSET = 100;
const LIST_ITEM_MAIN_AXIS = 30;
const FRONT_BUTTON_OWNER = '__MUYA_FRONT_BUTTON_OWNER__';

type FrontButtonWrapper = HTMLDivElement & {
    [FRONT_BUTTON_OWNER]?: HTMLElement;
};

function defaultOptions() {
    return {
        placement: 'left-start' as const,
        offsetOptions: {
            mainAxis: 0,
            crossAxis: 0,
            alignmentAxis: 0,
        },
        showArrow: false,
    };
}

function isOrderOrBulletList(block: Parent): block is OrderList | BulletList {
    return block instanceof OrderList || block instanceof BulletList;
}

function isListItem(block: Parent): boolean {
    return block.blockName === 'list-item' || block.blockName === 'task-list-item';
}

function isTextChildOfHighlight(block: Parent): boolean {
    if (!/^(?:paragraph|atx-heading|setext-heading|block-quote|order-list|bullet-list|task-list)$/.test(block.blockName))
        return false;
    let ancestor = block.parent;
    while (ancestor) {
        if (ancestor.blockName === 'highlight-block')
            return true;
        ancestor = ancestor.parent;
    }
    return false;
}

function displayBlock(block: Parent): Parent {
    return isListItem(block) && block.parent ? block.parent : block;
}

export function frontButtonTarget(elements: Element[]): Parent | null {
    const blocks = elements
        .map(element => element[BLOCK_DOM_PROPERTY] as Parent | undefined)
        .filter((block): block is Parent => !!block);
    return blocks.find(isListItem)
        ?? blocks.find(isTextChildOfHighlight)
        ?? blocks.find(block => block.isOutMostBlock)
        ?? null;
}

export function imageFrontButtonWrapper(elements: Element[]): HTMLElement | null {
    for (const element of elements) {
        const imageContainer = element.closest<HTMLElement>('.mu-image-container');
        const wrapper = imageContainer?.closest<HTMLElement>('.mu-inline-image');
        if (wrapper)
            return wrapper;
    }

    return null;
}

export function isImageFloatingControlHit(elements: Element[]): boolean {
    return elements.some(element => !!element.closest(
        '.mu-image-toolbar-container, .mu-transformer',
    ));
}

export function imageFrontButtonTarget(reference: unknown, fallback: Parent): Parent {
    if (!(reference instanceof Element))
        return fallback;

    const ancestors: Element[] = [];
    let element: Element | null = reference;
    while (element) {
        ancestors.push(element);
        element = element.parentElement;
    }

    return frontButtonTarget(ancestors) ?? fallback;
}

export function isStandaloneImageBlock(block: Parent): boolean {
    if (block.blockName !== 'paragraph' || !block.domNode)
        return false;

    const state = block.getState() as { text?: string };
    if (typeof state.text !== 'string')
        return false;

    const text = state.text.trim();
    return Array.from(block.domNode?.querySelectorAll<HTMLElement>('.mu-inline-image') ?? [])
        .some(wrapper => wrapper.dataset.raw?.trim() === text);
}

export function frontButtonElementsForEditor(
    editorRoot: HTMLElement,
    elements: Element[],
): Element[] {
    return elements.filter(element => editorRoot.contains(element));
}

export function isImageBlockHoverRegion(
    blockRect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>,
    menuRect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>,
    x: number,
    y: number,
): boolean {
    return x >= Math.min(blockRect.left, menuRect.left)
        && x <= Math.max(blockRect.right, menuRect.right)
        && y >= Math.min(blockRect.top, menuRect.top)
        && y <= Math.max(blockRect.bottom, menuRect.bottom);
}

export function frontButtonMainAxis(
    blockName: string,
    paddingTop: number,
    isLooseList: boolean,
    isCollapsedSection = false,
    isListItemTarget = false,
) {
    // List markers and task checkboxes live outside the list item's content
    // box. Keep the floating button to their left instead of covering them.
    if (isListItemTarget)
        return LIST_ITEM_MAIN_AXIS;

    // Code blocks reserve 40px of top padding for their caption/actions row.
    // That vertical header must not become a horizontal Floating UI offset.
    if (blockName === 'code-block')
        return 8;

    return (isLooseList ? paddingTop * 2 : paddingTop) + 8 + (isCollapsedSection ? 18 : 0);
}

function blockLabel(block: Parent) {
    switch (block.blockName) {
        case 'atx-heading':
        case 'setext-heading':
            return `H${(block as Parent & { meta?: { level?: number } }).meta?.level ?? ''}`;
        case 'paragraph':
            return 'T';
        case 'task-list':
            return '✓';
        case 'block-quote':
            return '”';
        case 'highlight-block':
            return '✦';
        case 'code-block':
            return '</>';
        default:
            return 'T';
    }
}

function blockKind(block: Parent) {
    switch (block.blockName) {
        case 'atx-heading':
        case 'setext-heading':
            return 'heading';
        case 'order-list':
            return 'order-list';
        case 'bullet-list':
            return 'bullet-list';
        case 'task-list':
            return 'task-list';
        case 'table':
            return 'table';
        case 'diagram':
            return 'diagram';
        case 'code-block':
            return 'code';
        case 'block-quote':
            return 'quote';
        case 'highlight-block':
            return 'highlight';
        default:
            return 'text';
    }
}

function renderListIcon(kind: 'order-list' | 'bullet-list') {
    return h(`span.mu-block-label.${kind}`, [
        h('span.mu-block-label-glyph.mu-list-icon', [1, 2, 3].map(index => h('span.mu-list-icon-row', [
            h('span.mu-list-icon-marker', kind === 'order-list' ? `${index}` : ''),
            h('span.mu-list-icon-line'),
        ]))),
    ]);
}

function renderTableIcon() {
    return h('span.mu-block-label.table', [
        h('span.mu-block-label-glyph.mu-table-icon', Array.from({ length: 9 }, () => h('i'))),
    ]);
}

function renderDiagramIcon() {
    return h('span.mu-block-label.diagram', [
        h('span.mu-block-label-glyph.mu-diagram-icon', [
            h('i.node.root'),
            h('i.node.left'),
            h('i.node.right'),
            h('i.link.stem'),
            h('i.link.branch'),
        ]),
    ]);
}

function renderQuoteIcon() {
    const pathAttrs = {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.7',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    };
    return h('span.mu-block-label.quote', [
        h(
            'svg.mu-block-label-glyph.mu-quote-icon',
            {
                attrs: {
                    viewBox: '0 0 20 20',
                    'aria-hidden': 'true',
                },
            },
            [
                h('path', { attrs: { ...pathAttrs, d: 'M4.5 5.5h3v4.2c0 2.4-1.1 3.8-3.4 4.8' } }),
                h('path', { attrs: { ...pathAttrs, d: 'M11.5 5.5h3v4.2c0 2.4-1.1 3.8-3.4 4.8' } }),
            ],
        ),
    ]);
}

function renderImageIcon() {
    const pathAttrs = {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.8',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    };
    return h('span.mu-block-label.image', [
        h(
            'svg.mu-block-label-glyph.mu-image-block-icon',
            {
                attrs: {
                    viewBox: '0 0 24 24',
                    'aria-hidden': 'true',
                },
            },
            [
                h('rect', { attrs: { ...pathAttrs, x: '4', y: '4.5', width: '16', height: '15', rx: '1.8' } }),
                h('circle', { attrs: { ...pathAttrs, cx: '15.8', cy: '8.8', r: '1.3' } }),
                h('path', { attrs: { ...pathAttrs, d: 'M6.5 16.8 10.2 12.7l2.6 2.7 2-2 2.8 3.4' } }),
            ],
        ),
    ]);
}

function renderBlockLabel(kind: string, label: string) {
    if (kind === 'order-list' || kind === 'bullet-list')
        return renderListIcon(kind);
    if (kind === 'table')
        return renderTableIcon();
    if (kind === 'diagram')
        return renderDiagramIcon();
    if (kind === 'quote')
        return renderQuoteIcon();
    if (kind === 'image')
        return renderImageIcon();

    return h(`span.mu-block-label.${kind}`, [
        h('span.mu-block-label-glyph', label),
    ]);
}

function renderGrip() {
    return h('span.mu-block-grip', [
        h('i'),
        h('i'),
        h('i'),
        h('i'),
        h('i'),
        h('i'),
    ]);
}

export class ParagraphFrontButton {
    public name: string = 'mu-front-button';
    private _resizeObserver: ResizeObserver | null = null;
    private _options: IBaseOptions;
    private _block: Parent | null = null;
    private _oldVNode: VNode | null = null;
    private _status: boolean = false;
    private _kindOverride: 'image' | null = null;
    private _lastPointer: { x: number; y: number } | null = null;
    private _floatBox: HTMLDivElement = document.createElement('div');
    private _container: HTMLDivElement = document.createElement('div');
    private _iconWrapper: HTMLDivElement = document.createElement('div');
    private _cleanup: (() => void) | null = null;
    private _dragTimer: ReturnType<typeof setTimeout> | null = null;
    private _dragInfo: {
        block: Parent;
        target?: Parent | null;
        position?: 'down' | 'up' | null;
    } | null = null;

    private _ghost: HTMLDivElement | null = null;
    private _shadow: HTMLDivElement | null = null;
    private _disableListen: boolean = false;
    private _dragEvents: string[] = [];

    constructor(public muya: Muya, options = {}) {
        this._options = Object.assign({}, defaultOptions(), options);
        this.init();
        this.listen();
    }

    init() {
        const { _floatBox: floatBox, _container: container, _iconWrapper: iconWrapper } = this;
        document.querySelectorAll<FrontButtonWrapper>('.mu-front-button-wrapper').forEach((wrapper) => {
            const owner = wrapper[FRONT_BUTTON_OWNER];
            if (!owner || owner === this.muya.domNode || !owner.isConnected)
                wrapper.remove();
        });
        (floatBox as FrontButtonWrapper)[FRONT_BUTTON_OWNER] = this.muya.domNode;
        // Use to remember which float container is shown.
        container.classList.add(this.name);
        container.appendChild(iconWrapper);
        floatBox.classList.add('mu-front-button-wrapper');
        floatBox.appendChild(container);
        document.body.appendChild(floatBox);

        // Since the size of the container is not fixed and changes according to the change of content,
        // the floatBox needs to set the size according to the container size
        const resizeObserver = (this._resizeObserver = new ResizeObserver(() => {
            // Use requestAnimationFrame to avoid "ResizeObserver loop completed" warning
            requestAnimationFrame(() => {
                const { offsetWidth, offsetHeight } = container;

                Object.assign(floatBox.style, {
                    width: `${offsetWidth}px`,
                    height: `${offsetHeight}px`,
                });

                // Position will be updated by autoUpdate
            });
        }));

        resizeObserver.observe(container);
    }

    listen() {
        const { _container: container } = this;
        const { eventCenter } = this.muya;

        // attachDOMEvent's listener is typed as `EventListener` ((evt:
        // Event) => void). Take Event and narrow with the `isMouseEvent`
        // guard — same pattern as `mouseMove` below — rather than casting
        // the wrapper to EventListener (which would hide a real mismatch).
        const mousemoveHandler = throttle((event: Event) => {
            if (this._disableListen)
                return;
            if (!isMouseEvent(event))
                return;

            const { x, y } = event;
            this._lastPointer = { x, y };
            const directElements = document.elementsFromPoint(x, y);
            if (
                this._kindOverride === 'image'
                && directElements.some(element => this._floatBox.contains(element))
            ) {
                return;
            }

            const imageWrapper = imageFrontButtonWrapper(directElements);
            if (imageWrapper && this.muya.domNode.contains(imageWrapper)) {
                const target = frontButtonTarget(frontButtonElementsForEditor(
                    this.muya.domNode,
                    directElements,
                ));
                if (target) {
                    this.show(target, 'image');
                    this.render();
                }
                else {
                    this.hide();
                }
                return;
            }

            if (isImageFloatingControlHit(directElements)) {
                if (this._kindOverride !== 'image')
                    this.hide();
                return;
            }

            if (this._isCurrentImageHoverRegion(x, y))
                return;

            const els = frontButtonElementsForEditor(this.muya.domNode, [
                ...directElements,
                ...document.elementsFromPoint(x + LEFT_OFFSET, y),
            ]);
            const target = frontButtonTarget(els);
            if (target) {
                if (isStandaloneImageBlock(target)) {
                    this.show(target, 'image');
                    this.render();
                    return;
                }
                this.show(target);
                this.render();
            }
            else {
                this.hide();
            }
        }, 300);

        const clickHandler = () => {
            eventCenter.emit('muya-front-menu', {
                reference: {
                    getBoundingClientRect: () => container.getBoundingClientRect(),
                },
                block: this._block,
                kind: this._kindOverride,
            });
        };

        eventCenter.attachDOMEvent(container, 'mousedown', this._dragBarMouseDown);
        eventCenter.attachDOMEvent(container, 'mouseup', this._dragBarMouseUp);
        eventCenter.attachDOMEvent(document, 'mousemove', mousemoveHandler);
        eventCenter.attachDOMEvent(container, 'click', clickHandler);
        eventCenter.on('muya-transformer', ({ block, reference }) => {
            if (reference && block) {
                this.show(imageFrontButtonTarget(reference, block), 'image');
                this.render();
            }
            else if (
                this._kindOverride === 'image'
                && (!this._lastPointer || !this._isCurrentImageHoverRegion(
                    this._lastPointer.x,
                    this._lastPointer.y,
                ))
            ) {
                this.hide();
            }
        });
    }

    private _isCurrentImageHoverRegion(x: number, y: number): boolean {
        if (this._kindOverride !== 'image' || !this._block?.domNode || !this._status)
            return false;

        return isImageBlockHoverRegion(
            this._block.domNode.getBoundingClientRect(),
            this._floatBox.getBoundingClientRect(),
            x,
            y,
        );
    }

    private _dragBarMouseDown = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this._dragTimer = setTimeout(() => {
            this._startDrag();
            this._dragTimer = null;
        }, 300);
    };

    private _dragBarMouseUp = () => {
        if (this._dragTimer) {
            clearTimeout(this._dragTimer);
            this._dragTimer = null;
        }
    };

    private _mouseMove = (event: Event) => {
        if (!this._dragInfo || !isMouseEvent(event))
            return;

        event.preventDefault();

        const { x, y } = event;
        const els = [
            ...document.elementsFromPoint(x, y),
            ...document.elementsFromPoint(x + LEFT_OFFSET, y),
        ];
        const outMostElement = els.find(
            ele =>
                ele[BLOCK_DOM_PROPERTY]
                && (ele[BLOCK_DOM_PROPERTY] as Parent).isOutMostBlock,
        );
        this._moveShadow(event);

        if (
            outMostElement
            && outMostElement[BLOCK_DOM_PROPERTY] !== this._dragInfo.block
            && (outMostElement[BLOCK_DOM_PROPERTY] as Parent).blockName !== 'frontmatter'
        ) {
            const block = outMostElement[BLOCK_DOM_PROPERTY];
            const rect = outMostElement.getBoundingClientRect();
            const position = verticalPositionInRect(event, rect);
            this._createStyledGhost(rect, position);

            Object.assign(this._dragInfo, {
                target: block,
                position,
            });
        }
        else {
            if (this._ghost) {
                this._ghost.remove();
                this._ghost = null;
                this._dragInfo.target = null;
                this._dragInfo.position = null;
            }
        }
    };

    private _mouseUp = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        this._disableListen = false;
        const { eventCenter } = this.muya;
        this._dragEvents.forEach(eventId => eventCenter.detachDOMEvent(eventId));
        this._dragEvents = [];
        if (this._ghost)
            this._ghost.remove();

        this._destroyShadow();
        document.body.style.cursor = 'auto';
        this._dragTimer = null;
        const { block, target, position } = this._dragInfo || {};

        if (target && position && block) {
            if (
                (position === 'down' && block.prev === target)
                || (position === 'up' && block.next === target)
            ) {
                return;
            }

            if (position === 'up')
                block.insertInto(block.parent!, target);
            else
                block.insertInto(block.parent!, target.next);

            // TODO: @JOCS, remove use this.selection directly.
            const { anchorBlock, anchor, focus, isSelectionInSameBlock }
                = block.muya.editor.selection ?? {};

            if (
                isSelectionInSameBlock
                && anchorBlock
                && anchorBlock.isInBlock(block)
            ) {
                const begin = Math.min(anchor!.offset, focus!.offset);
                const end = Math.max(anchor!.offset, focus!.offset);
                anchorBlock.setCursor(begin, end);
            }
        }

        this._dragInfo = null;
    };

    private _startDrag = () => {
        const { _block: block } = this;
        // Frontmatter should not be drag.
        if (!block || block.blockName === 'frontmatter' || isListItem(block))
            return;

        this._disableListen = true;
        this._dragInfo = {
            block,
        };
        this._createStyledShadow();
        this.hide();
        const { eventCenter } = this.muya;

        document.body.style.cursor = 'grabbing';

        this._dragEvents = [
            eventCenter.attachDOMEvent(
                document,
                'mousemove',
                throttle(this._mouseMove, 100),
            ),
            eventCenter.attachDOMEvent(document, 'mouseup', this._mouseUp),
        ];
    };

    private _createStyledGhost(rect: DOMRect, position: 'down' | 'up') {
        let ghost = this._ghost;
        if (!ghost) {
            ghost = document.createElement('div');
            document.body.appendChild(ghost);
            ghost.classList.add('mu-line-ghost');
            this._ghost = ghost;
        }

        Object.assign(ghost.style, {
            width: `${rect.width}px`,
            left: `${rect.left}px`,
            top: position === 'up' ? `${rect.top}px` : `${rect.top + rect.height}px`,
        });
    }

    private _createStyledShadow() {
        const { domNode } = this._block!;
        const { width, top, left } = domNode!.getBoundingClientRect();
        const shadow = document.createElement('div');
        shadow.classList.add('mu-shadow');
        Object.assign(shadow.style, {
            width: `${width}px`,
            top: `${top}px`,
            left: `${left}px`,
        });
        shadow.appendChild(domNode!.cloneNode(true));
        document.body.appendChild(shadow);
        this._shadow = shadow;
    }

    private _moveShadow(event: Event) {
        const { _shadow: shadow } = this;
        // The shadow already be removed.
        if (!shadow || !isMouseEvent(event))
            return;

        const { y } = event;
        Object.assign(shadow.style, {
            top: `${y}px`,
        });
    }

    private _destroyShadow() {
        const { _shadow: shadow } = this;
        if (shadow) {
            shadow.remove();
            this._shadow = null;
        }
    }

    render() {
        const { _container: container, _iconWrapper: iconWrapper, _block: block, _oldVNode: oldVNode } = this;

        const visualBlock = displayBlock(block!);
        const kind = this._kindOverride ?? blockKind(visualBlock);
        const label = blockLabel(visualBlock);
        const iconWrapperSelector = `div.mu-icon-wrapper.${kind}`;
        const vnode = h(
            iconWrapperSelector,
            [
                renderBlockLabel(kind, label),
                renderGrip(),
            ],
        );

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(iconWrapper, vnode);

        this._oldVNode = vnode;

        // Reset float box style height
        const { lineHeight } = getComputedStyle(block!.domNode!);
        container.style.height = lineHeight;
    }

    hide() {
        if (!this._status)
            return;

        this._block = null;
        this._kindOverride = null;
        this._status = false;
        const { eventCenter } = this.muya;
        if (this._cleanup) {
            this._cleanup();
            this._cleanup = null;
        }

        if (this._floatBox) {
            Object.assign(this._floatBox.style, {
                left: `-9999px`,
                top: `-9999px`,
                opacity: '0',
            });
        }

        eventCenter.emit('muya-float-button', this, false);
    }

    show(block: Parent, kindOverride: 'image' | null = null) {
        if (this._block === block && this._kindOverride === kindOverride)
            return;

        this._block = block;
        this._kindOverride = kindOverride;
        const { domNode } = block;
        const { _floatBox: floatBox } = this;
        const { placement, offsetOptions } = this._options;
        const { eventCenter } = this.muya;

        if (this._cleanup) {
            this._cleanup();
            this._cleanup = null;
        }

        const styles = window.getComputedStyle(domNode!);
        const paddingTop = Number.parseFloat(styles.paddingTop);

        const visualBlock = displayBlock(block);
        const isLooseList = block === visualBlock && isOrderOrBulletList(block) && block.meta.loose;
        const dynamicMainAxis = frontButtonMainAxis(
            visualBlock.blockName,
            paddingTop,
            isLooseList,
            domNode!.classList.contains('mu-section-has-disclosure'),
            isListItem(block),
        );

        // Extract offset values, handling both number and object types
        let crossAxisValue = 0;
        let alignmentAxisValue = 0;
        if (typeof offsetOptions === 'object' && offsetOptions !== null && !('then' in offsetOptions)) {
            crossAxisValue = (offsetOptions as { crossAxis?: number }).crossAxis ?? 0;
            alignmentAxisValue = (offsetOptions as { alignmentAxis?: number | null }).alignmentAxis ?? 0;
        }

        const updatePosition = () => {
            computePosition(domNode!, floatBox, {
                placement,
                middleware: [
                    offset({
                        mainAxis: dynamicMainAxis,
                        crossAxis: crossAxisValue,
                        alignmentAxis: alignmentAxisValue,
                    }),
                    flip(),
                ],
            }).then(({ x, y }) => {
                Object.assign(floatBox.style, {
                    left: `${x}px`,
                    top: `${y}px`,
                    opacity: 1,
                });
            });
        };

        updatePosition();
        this._cleanup = autoUpdate(domNode!, floatBox, updatePosition);

        this._status = true;
        eventCenter.emit('muya-float-button', this, true);
    }

    destroy() {
        if (this._container && this._resizeObserver)
            this._resizeObserver.unobserve(this._container);

        if (this._cleanup) {
            this._cleanup();
            this._cleanup = null;
        }

        this._floatBox.remove();
    }
}
