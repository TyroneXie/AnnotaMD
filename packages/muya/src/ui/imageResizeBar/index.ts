import type Format from '../../block/base/format';
import type { Muya } from '../../index';
import type { ImageToken } from '../../inlineRenderer/types';
import { autoUpdate } from '@floating-ui/dom';

import { isHTMLElement, isMouseEvent } from '../../utils';
import { findScrollContainer } from '../../utils/dom';
import './index.css';

type CornerHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CORNER_HANDLES: CornerHandle[] = [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
];
const HANDLE_SIZE = 32;
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

export class ImageResizeBar {
    static pluginName = 'transformer';
    private _reference: HTMLElement | null = null;
    private _block: Format | null = null;
    private _imageInfo: {
        token: ImageToken;
        imageId: string;
    } | null = null;

    private _movingAnchor: CornerHandle | null = null;
    private _status: boolean = false;
    private _width: number | null = null;
    private _eventId: string[] = [];
    private _lastScrollTop: number | null = null;
    private _resizing: boolean = false;
    private _dragStart: {
        clientX: number;
        clientY: number;
        width: number;
        aspectRatio: number;
    } | null = null;
    // Stops the autoUpdate reposition loop set up in `_render`.
    private _cleanup: (() => void) | null = null;
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
                !this._resizing
                && this._status
                && Math.abs(event.target.scrollTop - this._lastScrollTop) > 50
            ) {
                this.hide();
            }
        };

        eventCenter.on('muya-transformer', ({ block, reference, imageInfo }) => {
            this._reference = reference;
            if (reference) {
                this._block = block;
                this._imageInfo = imageInfo;
                setTimeout(() => {
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
        eventCenter.attachDOMEvent(document.body, 'mousedown', this._mouseDown);
    }

    private _render() {
        const { eventCenter } = this.muya;
        if (this._status)
            this.hide();

        this._status = true;

        this._createElements();
        this._update();
        // Reposition the handles whenever the image moves (window/ancestor
        // resize, sidebar toggle, scroll), so they stay attached to it (#2939).
        this._cleanup = autoUpdate(this._reference!, this._container, () => this._update());
        eventCenter.emit('muya-float', this, true);
    }

    private _createElements() {
        const outline = document.createElement('div');
        outline.className = 'mu-image-resize-outline';
        this._container.appendChild(outline);
        CORNER_HANDLES.forEach((c) => {
            const bar = document.createElement('div');
            bar.classList.add('bar');
            bar.classList.add(c);
            bar.setAttribute('data-position', c);
            this._container.appendChild(bar);
        });
    }

    private _update() {
        // Anchor the hot zones to the visible bitmap rather than its wrapper.
        // The wrapper can be taller/wider because of inline layout, which made
        // the resize cursor appear noticeably away from the image edge.
        const image = this._reference!.querySelector('img');
        const rect = (image ?? this._reference!).getBoundingClientRect();
        const outline = this._container.querySelector<HTMLElement>('.mu-image-resize-outline');
        if (outline) {
            outline.style.left = `${rect.left}px`;
            outline.style.top = `${rect.top}px`;
            outline.style.width = `${rect.width}px`;
            outline.style.height = `${rect.height}px`;
        }
        CORNER_HANDLES.forEach((c) => {
            const bar: HTMLDivElement = this._container.querySelector(`.${c}`)!;
            const isLeft = c.endsWith('left');
            const isTop = c.startsWith('top');
            // Keep the full invisible hot zone inside the visible outline. This
            // makes every resize cursor discoverable from within the framed
            // image and leaves no surprising active area outside the frame.
            bar.style.left = `${isLeft ? rect.left : rect.right - HANDLE_SIZE}px`;
            bar.style.top = `${isTop ? rect.top : rect.bottom - HANDLE_SIZE}px`;
        });
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

        if (!this._resizing)
            this.hide();
    };

    private _mouseDown = (event: Event) => {
        if (!isHTMLElement(event.target) || !event.target.closest('.bar'))
            return;

        const target = event.target;
        const { eventCenter } = this.muya;
        this._movingAnchor = target.getAttribute('data-position') as CornerHandle;
        const image = this._reference?.querySelector('img');
        const rect = image?.getBoundingClientRect();
        if (!image || !rect || rect.width <= 0 || rect.height <= 0) {
            this._movingAnchor = null;
            return;
        }
        const mouseEvent = event as MouseEvent;
        this._dragStart = {
            clientX: mouseEvent.clientX,
            clientY: mouseEvent.clientY,
            width: rect.width,
            aspectRatio: rect.width / rect.height,
        };
        const mouseMoveId = eventCenter.attachDOMEvent(
            document.body,
            'mousemove',
            this._mouseMove,
        );
        const mouseUpId = eventCenter.attachDOMEvent(
            document.body,
            'mouseup',
            this._mouseUp,
        );
        this._resizing = true;
        // Hide image toolbar
        eventCenter.emit('muya-image-toolbar', { reference: null });
        this._eventId.push(mouseMoveId, mouseUpId);
    };

    private _mouseMove = (event: Event) => {
        if (!isMouseEvent(event))
            return;

        event.preventDefault();
        if (!this._movingAnchor || !this._dragStart)
            return;

        const image = this._reference!.querySelector('img');
        if (!image)
            return;

        const { clientX, clientY } = event;
        const { width: startWidth, aspectRatio, clientX: startX, clientY: startY }
            = this._dragStart;
        const horizontalDelta = (this._movingAnchor.endsWith('right') ? 1 : -1)
            * (clientX - startX);
        const verticalDelta = (this._movingAnchor.startsWith('bottom') ? 1 : -1)
            * (clientY - startY) * aspectRatio;
        const delta = Math.abs(horizontalDelta) >= Math.abs(verticalDelta)
            ? horizontalDelta
            : verticalDelta;
        const content = this._reference!.closest('.mu-content')
            ?? this.muya.domNode.querySelector('.mu-container')
            ?? this.muya.domNode;
        const contentRect = content.getBoundingClientRect();
        const snap = getImageWidthSnap(startWidth + delta, contentRect.width);
        const width = Math.round(snap.width);

        if (snap.showGuide)
            this._showSnapGuide(contentRect.right);
        else this._hideSnapGuide();

        // Image width/height attribute must be an integer.
        this._width = width;
        image.setAttribute('width', String(width));
        this._update();
    };

    private _mouseUp = (event: Event) => {
        event.preventDefault();
        const { eventCenter } = this.muya;
        if (this._eventId.length) {
            for (const id of this._eventId)
                eventCenter.detachDOMEvent(id);

            this._eventId = [];
        }

        if (typeof this._width === 'number' && this._block && this._imageInfo) {
            this._block.updateImage(this._imageInfo, 'width', String(this._width));
            this.hide();
        }

        this._width = null;
        this._resizing = false;
        this._movingAnchor = null;
        this._dragStart = null;
        this._hideSnapGuide();
    };

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
        this._cleanup?.();
        this._cleanup = null;
        this._container.remove();
        this._snapGuide.remove();
    }
}
