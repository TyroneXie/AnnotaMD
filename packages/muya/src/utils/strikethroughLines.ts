const GEOMETRIC_CLASS = 'mu-geometric-strikethrough';
const LAYER_CLASS = 'mu-strikethrough-line-layer';
const LINE_CLASS = 'mu-strikethrough-line';

interface IRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

export interface IStrikethroughLine {
    left: number;
    top: number;
    width: number;
    color: string;
}

export const measureStrikethroughLines = (
    deletions: Iterable<HTMLElement>,
    rootRect: IRect,
): IStrikethroughLine[] => {
    const lines: IStrikethroughLine[] = [];

    for (const deletion of deletions) {
        const color = getComputedStyle(deletion).color;
        for (const rect of Array.from(deletion.getClientRects())) {
            if (rect.width <= 0 || rect.height <= 0)
                continue;

            lines.push({
                left: rect.left - rootRect.left,
                top: rect.top - rootRect.top + rect.height * 0.48,
                width: rect.width,
                color,
            });
        }
    }

    return lines;
};

export const syncStrikethroughLineOverlays = (root: HTMLElement): void => {
    root.querySelector(`:scope > .${LAYER_CLASS}`)?.remove();

    const lines = measureStrikethroughLines(
        root.querySelectorAll<HTMLElement>('del.mu-inline-rule'),
        root.getBoundingClientRect(),
    );
    if (!lines.length)
        return;

    const layer = document.createElement('div');
    layer.className = LAYER_CLASS;
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('contenteditable', 'false');
    for (const rect of lines) {
        const line = document.createElement('span');
        line.className = LINE_CLASS;
        Object.assign(line.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            backgroundColor: rect.color,
        });
        layer.appendChild(line);
    }
    // Keep overlays before document blocks. The desktop keeps its document
    // comment mount as the final child; appending here would make both features
    // continuously move each other while observing child-list changes.
    root.prepend(layer);
};

const isOverlayNode = (node: Node): boolean => {
    return node instanceof Element
        && (node.classList.contains(LAYER_CLASS) || node.closest(`.${LAYER_CLASS}`) != null);
};

export default class StrikethroughLineOverlay {
    private _frame: number | null = null;
    private _mutationObserver: MutationObserver | null = null;
    private _resizeObserver: ResizeObserver | null = null;

    constructor(private _root: HTMLElement) {
        _root.classList.add(GEOMETRIC_CLASS);
        this._mutationObserver = new MutationObserver((mutations) => {
            const onlyOverlayChanges = mutations.every((mutation) => {
                const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
                return nodes.length > 0 && nodes.every(isOverlayNode);
            });
            if (!onlyOverlayChanges)
                this.queue();
        });
        this._mutationObserver.observe(_root, {
            childList: true,
            characterData: true,
            subtree: true,
        });
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(this.queue);
            this._resizeObserver.observe(_root);
        }
        this.queue();
    }

    queue = (): void => {
        if (this._frame != null)
            cancelAnimationFrame(this._frame);
        this._frame = requestAnimationFrame(() => {
            this._frame = null;
            syncStrikethroughLineOverlays(this._root);
        });
    };

    destroy(): void {
        if (this._frame != null)
            cancelAnimationFrame(this._frame);
        this._frame = null;
        this._mutationObserver?.disconnect();
        this._resizeObserver?.disconnect();
        this._mutationObserver = null;
        this._resizeObserver = null;
        this._root.querySelector(`:scope > .${LAYER_CLASS}`)?.remove();
        this._root.classList.remove(GEOMETRIC_CLASS);
    }
}
