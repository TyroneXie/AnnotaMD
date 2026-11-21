import type Format from '../../block/base/format';
import type { Muya } from '../../index';
import type { ImageToken } from '../../inlineRenderer/types';
import { autoUpdate } from '@floating-ui/dom';

import { isHTMLElement } from '../../utils';
import { findScrollContainer } from '../../utils/dom';
import './index.css';

type CornerHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type RowHandle = 'row-left' | 'row-right';
type ResizeHandle = CornerHandle | RowHandle;

interface IImageRowDrag {
    items: HTMLElement[];
    widths: number[];
    index: number;
    neighbor: number;
    preview: number[] | null;
}

const CORNER_HANDLES: CornerHandle[] = [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
];
const ROW_HANDLES: RowHandle[] = ['row-left', 'row-right'];
const HANDLE_SIZE = 32;
const RESIZE_DRAG_THRESHOLD = 4;
const MIN_IMAGE_WIDTH = 50;
const IMAGE_WIDTH_GUIDE_RANGE = 36;
const IMAGE_WIDTH_SNAP_RANGE = 12;

export function getImageWidthSnap(
    proposedWidth: number,
    contentWidth: number,
): { showGuide: boolean; width: number } {
    const width = Math.max(MIN_IMAGE_WIDTH, proposedWidth);
    const showGuide = width >= contentWidth - IMAGE_WIDTH_GUIDE_RANGE;

    return {
        showGuide,
        width: width >= contentWidth - IMAGE_WIDTH_SNAP_RANGE
            ? contentWidth
            : Math.min(width, contentWidth),
    };
}

export function redistributeImageWidths(widths: number[], index: number, neighbor: number, delta: number) {
    const pairWidth = widths[index] + widths[neighbor];
    const minWidth = Math.min(MIN_IMAGE_WIDTH, widths[index]);
    const maxWidth = pairWidth - Math.min(MIN_IMAGE_WIDTH, widths[neighbor]);
    const width = Math.max(minWidth, Math.min(maxWidth, widths[index] + delta));
    const next = [...widths];
    next[index] = width;
    next[neighbor] = pairWidth - width;
    return next;
}

export class ImageResizeBar {
    static pluginName = 'transformer';
    private _reference: HTMLElement | null = null;
    private _block: Format | null = null;
    private _imageInfo: {
        token: ImageToken;
        imageId: string;
    } | null = null;

    private _status: boolean = false;
    private _lastScrollTop: number | null = null;
    private _drag: {
        pointerId: number;
        handle: HTMLElement;
        handleType: ResizeHandle;
        image: HTMLImageElement;
        row: IImageRowDrag | null;
        clientX: number;
        clientY: number;
        startWidth: number;
        aspectRatio: number;
        originalWidth: string | null;
        width: number | null;
    } | null = null;
    // Stops the autoUpdate reposition loop set up in `_render`.
    private _cleanup: (() => void) | null = null;
    private _pendingRender: ReturnType<typeof setTimeout> | null = null;
    // A container for storing drag strips
    private _container: HTMLDivElement;
    private _snapGuide: HTMLDivElement;

    constructor(public muya: Muya) {
        const container = (this._container = document.createElement('div'));
        container.classList.add('mu-transformer');
        document.body.appendChild(container);
        this._snapGuide = document.createElement('div');
        this._snapGuide.className = 'mu-image-resize-guide';
        this._snapGuide.contentEditable = 'false';
        this._snapGuide.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this._snapGuide);

        this._listen();
    }

    private _listen() {
        const { eventCenter, domNode } = this.muya;

        const scrollHandler = (event: Event) => {
            if (!isHTMLElement(event.target))
                return;
            if (typeof this._lastScrollTop !== 'number') {
                this._lastScrollTop = event.target.scrollTop;

                return;
            }

            // only when scroll distance great than 50px, then hide the float box.
            if (
                !this._drag
                && this._status
                && Math.abs(event.target.scrollTop - this._lastScrollTop) > 50
            ) {
                this.hide();
            }
        };

        eventCenter.on('muya-transformer', ({ block, reference, imageInfo }) => {
            // Moving handles can expose the bitmap (or another image) under the
            // pointer. Hover events must not retarget an active resize.
            if (this._drag)
                return;

            this._reference = reference;
            if (reference) {
                this._block = block;
                this._imageInfo = imageInfo;
                if (this._pendingRender)
                    clearTimeout(this._pendingRender);
                this._pendingRender = setTimeout(() => {
                    this._pendingRender = null;
                    if (this._reference === reference)
                        this._render();
                });
            }
            else {
                this.hide();
            }
        });

        eventCenter.attachDOMEvent(document, 'click', this.hide.bind(this));
        eventCenter.attachDOMEvent(findScrollContainer(domNode), 'scroll', scrollHandler);
        eventCenter.attachDOMEvent(this._container, 'dragstart', event =>
            event.preventDefault());
        eventCenter.attachDOMEvent(this._container, 'mouseout', this._handleContainerMouseOut);
        eventCenter.attachDOMEvent(this._container, 'pointerdown', this._pointerDown);
        eventCenter.attachDOMEvent(this._container, 'pointermove', this._pointerMove);
        eventCenter.attachDOMEvent(this._container, 'pointerup', this._pointerUp);
        eventCenter.attachDOMEvent(this._container, 'pointercancel', this._pointerCancel);
        eventCenter.attachDOMEvent(this._container, 'lostpointercapture', this._pointerCancel);
    }

    private _render() {
        const { eventCenter } = this.muya;
        const reference = this._reference;
        if (this._drag || !reference?.isConnected)
            return;

        if (this._status)
            this.hide();

        this._status = true;

        this._createElements();
        if (!this._update()) {
            this.hide();
            return;
        }
        // Reposition the handles whenever the image moves (window/ancestor
        // resize, sidebar toggle, scroll), so they stay attached to it (#2939).
        this._cleanup = autoUpdate(reference, this._container, () => {
            if (!this._update())
                this.hide();
        });
        eventCenter.emit('muya-float', this, true);
    }

    private _createElements() {
        const outline = document.createElement('div');
        outline.className = 'mu-image-resize-outline';
        this._container.appendChild(outline);
        const handles = this._reference?.closest('.mu-image-row')
            ? [...CORNER_HANDLES, ...ROW_HANDLES]
            : CORNER_HANDLES;
        handles.forEach((c) => {
            const bar = document.createElement('div');
            bar.classList.add('bar');
            bar.classList.add(c);
            bar.setAttribute('data-position', c);
            this._container.appendChild(bar);
        });
    }

    private _update(): boolean {
        const reference = this._reference;
        if (!this._status || !reference?.isConnected)
            return false;

        // Anchor the hot zones to the visible bitmap rather than its wrapper.
        // The wrapper can be taller/wider because of inline layout, which made
        // the resize cursor appear noticeably away from the image edge.
        const image = reference.querySelector('img');
        const rect = (image ?? reference).getBoundingClientRect();
        const outline = this._container.querySelector<HTMLElement>('.mu-image-resize-outline');
        if (!outline)
            return false;

        outline.style.left = `${rect.left}px`;
        outline.style.top = `${rect.top}px`;
        outline.style.width = `${rect.width}px`;
        outline.style.height = `${rect.height}px`;
        for (const c of CORNER_HANDLES) {
            const bar = this._container.querySelector<HTMLDivElement>(`.${c}`);
            if (!bar)
                return false;
            const isLeft = c.endsWith('left');
            const isTop = c.startsWith('top');
            // Keep the full invisible hot zone inside the visible outline. This
            // makes every resize cursor discoverable from within the framed
            // image and leaves no surprising active area outside the frame.
            bar.style.left = `${isLeft ? rect.left : rect.right - HANDLE_SIZE}px`;
            bar.style.top = `${isTop ? rect.top : rect.bottom - HANDLE_SIZE}px`;
        }
        this._positionRowHandles(reference);

        return true;
    }

    private _positionRowHandles(reference: HTMLElement) {
        const row = reference.closest('.mu-image-row');
        const item = reference.closest('.mu-inline-image');
        if (!row || !item)
            return;

        const items = Array.from(row.querySelectorAll<HTMLElement>(':scope > .mu-inline-image'));
        const index = items.indexOf(item as HTMLElement);
        const rowBounds = row.getBoundingClientRect();
        const bounds = item.getBoundingClientRect();
        for (const side of ROW_HANDLES) {
            const handle = this._container.querySelector<HTMLElement>(`.${side}`);
            const isRight = side === 'row-right';
            const neighbor = items[index + (isRight ? 1 : -1)];
            if (!handle)
                continue;

            handle.hidden = !neighbor;
            if (neighbor) {
                const other = neighbor.getBoundingClientRect();
                const left = isRight ? bounds.right : other.right;
                const right = isRight ? other.left : bounds.left;
                Object.assign(handle.style, {
                    left: `${left - 2}px`,
                    top: `${rowBounds.top}px`,
                    width: `${right - left + 4}px`,
                    height: `${rowBounds.height}px`,
                });
            }
        }
    }

    private _getRowDrag(reference: HTMLElement, handle: ResizeHandle): IImageRowDrag | null {
        const row = reference.closest('.mu-image-row');
        if (!row)
            return null;

        const items = Array.from(row.querySelectorAll<HTMLElement>(':scope > .mu-inline-image'));
        const index = items.findIndex(item => item.contains(reference));
        if (index === -1 || items.length < 2)
            return null;

        const direction = handle.endsWith('right') ? 1 : -1;
        return {
            items,
            widths: items.map(item => item.getBoundingClientRect().width),
            index,
            neighbor: items[index + direction] ? index + direction : index - direction,
            preview: null,
        };
    }

    private _handleContainerMouseOut = (event: Event) => {
        if (!(event instanceof MouseEvent))
            return;

        const related = event.relatedTarget;
        if (
            related instanceof Node
            && (
                this._reference?.contains(related)
                || (related instanceof HTMLElement && !!related.closest('.mu-transformer .bar'))
            )
        ) {
            return;
        }

        if (!this._drag)
            this.hide();
    };

    private _pointerDown = (event: Event) => {
        if (!(event instanceof PointerEvent) || event.button !== 0 || this._drag || !isHTMLElement(event.target))
            return;

        const handle = event.target.closest<HTMLElement>('.bar');
        const reference = this._reference;
        const image = reference?.querySelector('img');
        const rect = image?.getBoundingClientRect();
        if (!handle || !reference || !image || !rect || rect.width <= 0 || rect.height <= 0)
            return;

        const handleType = handle.dataset.position as ResizeHandle;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        this._drag = {
            pointerId: event.pointerId,
            handle,
            handleType,
            image,
            row: this._getRowDrag(reference, handleType),
            clientX: event.clientX,
            clientY: event.clientY,
            startWidth: rect.width,
            aspectRatio: rect.width / rect.height,
            originalWidth: image.getAttribute('width'),
            width: null,
        };
        this.muya.eventCenter.emit('muya-image-toolbar', { reference: null });
    };

    private _pointerMove = (event: Event) => {
        const drag = this._drag;
        if (!(event instanceof PointerEvent) || !drag || drag.pointerId !== event.pointerId)
            return;

        event.preventDefault();
        const reference = this._reference;
        if (!reference?.isConnected || !drag.image.isConnected) {
            this.hide();
            return;
        }

        const { handleType, row, startWidth, aspectRatio, clientX: startX, clientY: startY } = drag;
        const movementX = event.clientX - startX;
        const movementY = event.clientY - startY;
        const isDivider = handleType.startsWith('row-');
        const movement = isDivider ? Math.abs(movementX) : Math.max(Math.abs(movementX), Math.abs(movementY));
        if (drag.width === null && !row?.preview && movement < RESIZE_DRAG_THRESHOLD)
            return;

        const horizontalDelta = (handleType.endsWith('right') ? 1 : -1)
            * movementX;
        const verticalDelta = (handleType.startsWith('bottom') ? 1 : -1)
            * movementY * aspectRatio;
        const delta = isDivider || Math.abs(horizontalDelta) >= Math.abs(verticalDelta)
            ? horizontalDelta
            : verticalDelta;
        if (row) {
            const widths = redistributeImageWidths(row.widths, row.index, row.neighbor, delta);
            row.items.forEach((item, index) => {
                item.style.flexGrow = String(widths[index]);
            });
            row.preview = widths;
            this._update();
            return;
        }

        const content = reference.closest('.mu-content')
            ?? this.muya.domNode.querySelector('.mu-container')
            ?? this.muya.domNode;
        const contentRect = content.getBoundingClientRect();
        const snap = getImageWidthSnap(startWidth + delta, contentRect.width);
        const width = Math.round(snap.width);

        if (snap.showGuide)
            this._showSnapGuide(contentRect.right);
        else this._hideSnapGuide();

        // Image width/height attribute must be an integer.
        drag.width = width;
        drag.image.setAttribute('width', String(width));
        this._update();
    };

    private _pointerUp = (event: Event) => {
        if (!(event instanceof PointerEvent) || this._drag?.pointerId !== event.pointerId)
            return;

        event.preventDefault();
        this._finishDrag(true);
        this.hide();
    };

    private _pointerCancel = (event: Event) => {
        if (event instanceof PointerEvent && this._drag?.pointerId === event.pointerId)
            this.hide();
    };

    private _finishDrag(commit = false) {
        const drag = this._drag;
        if (!drag)
            return;

        this._drag = null;
        if (drag.handle.hasPointerCapture(drag.pointerId))
            drag.handle.releasePointerCapture(drag.pointerId);

        if (drag.row) {
            const { items, preview } = drag.row;
            items.forEach(item => item.style.removeProperty('flex-grow'));
            if (commit && preview && items.every(item => item.isConnected))
                this._block?.updateImageRowWidths(preview);
            return;
        }

        if (drag.width === null || !drag.image.isConnected)
            return;

        if (commit && this._block && this._imageInfo)
            this._block.updateImage(this._imageInfo, 'width', String(drag.width));
        else if (drag.originalWidth === null)
            drag.image.removeAttribute('width');
        else
            drag.image.setAttribute('width', drag.originalWidth);
    }

    private _showSnapGuide(contentRight: number) {
        const editor = this.muya.domNode.closest('.editor-component')
            ?? this.muya.domNode.parentElement
            ?? this.muya.domNode;
        const rect = editor.getBoundingClientRect();
        const top = Math.max(0, rect.top);
        const bottom = Math.min(window.innerHeight, rect.bottom);

        this._snapGuide.dataset.visible = 'true';
        this._snapGuide.style.left = `${contentRight}px`;
        this._snapGuide.style.top = `${top}px`;
        this._snapGuide.style.height = `${Math.max(0, bottom - top)}px`;
    }

    private _hideSnapGuide() {
        delete this._snapGuide.dataset.visible;
    }

    hide() {
        const { eventCenter } = this.muya;
        if (this._pendingRender) {
            clearTimeout(this._pendingRender);
            this._pendingRender = null;
        }
        this._finishDrag();
        this._cleanup?.();
        this._cleanup = null;
        this._container.replaceChildren();
        this._status = false;
        this._hideSnapGuide();
        eventCenter.emit('muya-float', this, false);
    }

    // Remove the `.mu-transformer` container appended to document.body in the
    // constructor; invoked by `Muya.destroy()` so it is not leaked (#3315).
    destroy() {
        if (this._pendingRender)
            clearTimeout(this._pendingRender);
        this._finishDrag();
        this._cleanup?.();
        this._cleanup = null;
        this._container.remove();
        this._snapGuide.remove();
    }
}
