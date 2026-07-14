import type Table from '../../block/gfm/table';
import type TableBodyCell from '../../block/gfm/table/cell';
import type TableInner from '../../block/gfm/table/table';
import type { Muya } from '../../index';

import { ScrollPage } from '../../block/scrollPage';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isMouseEvent, throttle } from '../../utils';
import BaseFloat from '../baseFloat';
import './index.css';

type BarType = 'bottom' | 'right';
type InsertSide = 'before' | 'after' | null;

interface IDragInfo {
    table: Table;
    clientX: number;
    clientY: number;
    barType: BarType;
    index: number;
    curIndex: number;
    dragCells: HTMLTableCellElement[];
    cells: HTMLTableCellElement[][];
    aspects: number[];
    offset: number;
}

interface IPendingInsertionRender {
    block: TableBodyCell;
    barType: BarType;
    x: number;
    y: number;
}

function calculateAspects(tableBlock: Table, barType: BarType) {
    const table = tableBlock.firstChild!.domNode!;

    if (barType === 'bottom') {
        const firstRow = table.querySelector('tr');

        return Array.from(firstRow!.children).map(cell => cell.clientWidth);
    }
    else {
        return Array.from(table.querySelectorAll('tr')).map(
            row => row.clientHeight,
        );
    }
}

export function getAllTableCells(tableBlock: Table) {
    const table = tableBlock.firstChild!.domNode!;
    const rows = table.querySelectorAll('tr');
    const cells = [];

    for (const row of Array.from(rows))
        cells.push(Array.from(row.children));

    return cells as HTMLTableCellElement[][];
}

export function getIndex(barType: BarType, cellBlock: TableBodyCell) {
    const { row, table } = cellBlock;

    return barType === 'bottom'
        ? row.offset(cellBlock)
        : (table.firstChild as TableInner).offset(row);
}

function getDragCells(tableBlock: Table, barType: BarType, index: number) {
    const table = tableBlock.firstChild!.domNode!;
    const dragCells = [];

    if (barType === 'right') {
        const row = [...table.querySelectorAll('tr')][index];
        dragCells.push(...row.children);
    }
    else {
        const rows = [...table.querySelectorAll('tr')];
        const len = rows.length;
        let i;

        for (i = 0; i < len; i++)
            dragCells.push(rows[i].children[index]);
    }

    return dragCells as HTMLTableCellElement[];
}

const OFFSET = 20;
const INSERT_HIT_AREA = 12;

export function getInsertionSide(
    barType: BarType,
    rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
    x: number,
    y: number,
): InsertSide {
    const startDistance = barType === 'bottom' ? x - rect.left : y - rect.top;
    const endDistance = barType === 'bottom' ? rect.right - x : rect.bottom - y;
    if (startDistance >= 0 && startDistance <= INSERT_HIT_AREA)
        return 'before';
    if (endDistance >= 0 && endDistance <= INSERT_HIT_AREA)
        return 'after';
    return null;
}

export function isSameInsertionBoundary(
    barType: BarType,
    currentRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
    currentSide: InsertSide,
    nextRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
    nextSide: InsertSide,
): boolean {
    if (!currentSide || !nextSide)
        return false;

    const getEdge = (
        rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
        side: Exclude<InsertSide, null>,
    ) => barType === 'bottom'
        ? rect[side === 'before' ? 'left' : 'right']
        : rect[side === 'before' ? 'top' : 'bottom'];

    return Math.abs(
        getEdge(currentRect, currentSide) - getEdge(nextRect, nextSide),
    ) <= 1;
}

export function shouldContinueTableDrag(buttons: number): boolean {
    return (buttons & 1) === 1;
}

export function shouldHighlightTableAxis(insertSide: InsertSide): boolean {
    return insertSide === null;
}

export function isTableCellOwnedByMuya(
    element: Element,
    muya: unknown,
): boolean {
    const block = element[BLOCK_DOM_PROPERTY];
    return block?.blockName === 'table.cell' && block.muya === muya;
}

const rightOptions = {
    placement: 'left' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

const bottomOptions = {
    placement: 'top' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

function isInMovedRange(
    i: number,
    index: number,
    curIndex: number,
    isPositive: boolean,
) {
    return isPositive
        ? i > index && i <= curIndex
        : i >= curIndex && i < index;
}

function switchTransform(
    i: number,
    index: number,
    curIndex: number,
    aspect: number,
    axis: 'translateX' | 'translateY',
    isPositive: boolean,
): string | null {
    if (isInMovedRange(i, index, curIndex, isPositive))
        return `${axis}(${isPositive ? -aspect : aspect}px)`;
    if (i !== index)
        return `${axis}(0px)`;

    return null;
}

function applyBottomSwitch(
    cells: HTMLTableCellElement[][],
    len: number,
    compute: (i: number) => string | null,
) {
    for (const row of cells) {
        for (let i = 0; i < len; i++) {
            const transform = compute(i);
            if (transform !== null)
                row[i].style.transform = transform;
        }
    }
}

function applyRightSwitch(
    cells: HTMLTableCellElement[][],
    len: number,
    compute: (i: number) => string | null,
) {
    for (let i = 0; i < len; i++) {
        const transform = compute(i);
        if (transform === null)
            continue;

        for (const cell of cells[i])
            cell.style.transform = transform;
    }
}

export class TableDragBar extends BaseFloat {
    static pluginName = 'tableDragBar';
    private _block: TableBodyCell | null = null;
    private _mouseTimer: ReturnType<typeof setTimeout> | null = null;
    private _dragEventIds: string[] = [];
    private _isDragTableBar: boolean = false;
    private _barType: 'bottom' | 'right' | null = null;
    private _insertSide: InsertSide = null;
    private _dragInfo: IDragInfo | null = null;
    private _hoverCells: HTMLElement[] = [];
    private _insertionTable: HTMLElement | null = null;
    private _pendingInsertionRender: IPendingInsertionRender | null = null;

    constructor(muya: Muya, options = {}) {
        const name = 'mu-table-drag-bar';
        const opts = Object.assign({}, bottomOptions, options);
        super(muya, name, opts);

        this.floatBox!.classList.add('mu-table-drag-container');
        this.listen();
    }

    override listen() {
        const { eventCenter } = this.muya;
        const { container } = this;
        super.listen();

        const handler = throttle((event: Event) => {
            if (!isMouseEvent(event))
                return;

            const { x, y } = event;
            const els = [...document.elementsFromPoint(x, y)];
            const belowEls = [...document.elementsFromPoint(x, y + OFFSET)];
            const rightEls = [...document.elementsFromPoint(x + OFFSET, y)];

            const isOwnedTableCell = (element: Element) =>
                isTableCellOwnedByMuya(element, this.muya);
            const hasTableCell = (elements: Element[]) =>
                elements.some(isOwnedTableCell);

            if (
                !this._isDragTableBar
                && !hasTableCell(els)
                && (hasTableCell(belowEls) || hasTableCell(rightEls))
            ) {
                const tableCellEl = [...belowEls, ...rightEls].find(
                    isOwnedTableCell,
                );
                const cellBlock = tableCellEl![BLOCK_DOM_PROPERTY] as TableBodyCell;
                const barType = hasTableCell(belowEls) ? 'bottom' : 'right';

                const currentRect = this._block?.domNode?.getBoundingClientRect();
                const nextRect = tableCellEl!.getBoundingClientRect();
                const nextInsertSide = getInsertionSide(barType, nextRect, x, y);
                if (
                    this._block
                    && this._block !== cellBlock
                    && this._block.table === cellBlock.table
                    && this._barType === barType
                    && currentRect
                    && isSameInsertionBoundary(
                        barType,
                        currentRect,
                        this._insertSide,
                        nextRect,
                        nextInsertSide,
                    )
                ) {
                    return;
                }

                if (
                    this.status
                    && this._block === cellBlock
                    && this._barType === barType
                ) {
                    if (this._pendingInsertionRender) {
                        this._pendingInsertionRender.x = x;
                        this._pendingInsertionRender.y = y;
                    }
                    else {
                        this._render(barType, x, y);
                    }
                    return;
                }

                this._suspendInsertionVisual();
                this.options = Object.assign(
                    {},
                    barType === 'right' ? rightOptions : bottomOptions,
                );
                this._barType = barType;
                this._block = cellBlock;
                this._syncRenderSize(barType);
                this._pendingInsertionRender = { block: cellBlock, barType, x, y };
                this.show(tableCellEl!);
            }
            else {
                this.hide();
            }
        });

        eventCenter.attachDOMEvent(document.body, 'mousemove', handler);
        eventCenter.attachDOMEvent(container!, 'mousedown', this._mousedown);
        eventCenter.attachDOMEvent(container!, 'mouseup', this._mouseup);
    }

    override hide() {
        this._pendingInsertionRender = null;
        this._suspendInsertionVisual();
        this._setInsertionActive(false);
        this._clearHover();
        super.hide();
    }

    protected override onPositioned() {
        const pending = this._pendingInsertionRender;
        if (
            !pending
            || pending.block !== this._block
            || pending.barType !== this._barType
        ) {
            return;
        }

        this._pendingInsertionRender = null;
        this._render(pending.barType, pending.x, pending.y);
    }

    private _suspendInsertionVisual() {
        this._insertSide = null;
        if (this.container)
            delete this.container.dataset.insert;
        this._setInsertionActive(false);
        this._clearHover();
    }

    private _setInsertionActive(active: boolean) {
        const table = active
            ? (this._block?.table.firstChild?.domNode as HTMLElement | undefined)
            : undefined;

        if (this._insertionTable && this._insertionTable !== table)
            this._insertionTable.classList.remove('mu-table-insertion-active');

        table?.classList.add('mu-table-insertion-active');
        this._insertionTable = table ?? null;
    }

    private _highlightHover(barType: BarType, block: TableBodyCell) {
        this._clearHover();
        this._hoverCells = getDragCells(block.table, barType, getIndex(barType, block));
        this._hoverCells.forEach(cell => cell.classList.add('mu-table-axis-hovered'));
        this._hoverCells[0]?.classList.add(
            barType === 'right'
                ? 'mu-table-axis-hover-edge-row'
                : 'mu-table-axis-hover-edge-column',
        );
    }

    private _clearHover() {
        this._hoverCells.forEach(cell => cell.classList.remove(
            'mu-table-axis-hovered',
            'mu-table-axis-hover-edge-row',
            'mu-table-axis-hover-edge-column',
        ));
        this._hoverCells = [];
    }

    private _syncRenderSize(barType: BarType) {
        this.container!.dataset.drag = barType;
        const rect = this._block?.domNode?.getBoundingClientRect();
        if (!rect)
            return null;

        this.container!.style.setProperty(
            '--table-axis-length',
            `${barType === 'bottom' ? rect.width : rect.height}px`,
        );
        const tableRect = this._block!.table.firstChild!.domNode!.getBoundingClientRect();
        this.container!.style.setProperty(
            '--table-cross-length',
            `${barType === 'bottom' ? tableRect.height : tableRect.width}px`,
        );

        // BaseFloat mirrors the container size through a ResizeObserver, but
        // that update lands a frame later. Floating UI must see the new size on
        // the first pass or a differently-sized column/row is briefly centered
        // using the previous drag bar dimensions.
        Object.assign(this.floatBox!.style, {
            width: `${this.container!.offsetWidth}px`,
            height: `${this.container!.offsetHeight}px`,
        });

        return rect;
    }

    private _mousedown = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this._insertSide)
            return;
        this._mouseTimer = setTimeout(() => {
            this._startDrag(event);
            this._mouseTimer = null;
        }, 300);
    };

    private _mouseup = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        const { container, _barType: barType } = this;
        const { eventCenter } = this.muya;

        if (this._insertSide && this._block && barType) {
            const index = getIndex(barType, this._block);
            const offset = index + (this._insertSide === 'after' ? 1 : 0);
            const cursor = barType === 'bottom'
                ? this._block.table.insertColumn(offset)
                : this._block.table.insertRow(offset);
            cursor?.setCursor(0, 0, true);
            this._insertSide = null;
            return this.hide();
        }

        if (this._mouseTimer) {
            clearTimeout(this._mouseTimer);
            this._mouseTimer = null;
            if (barType) {
                const rect = container!.getBoundingClientRect();
                eventCenter.emit('muya-table-bar', {
                    reference: {
                        getBoundingClientRect: () => rect,
                    },
                    tableInfo: {
                        barType,
                    },
                    block: this._block,
                });
                this.hide();
            }
        }
    };

    private _startDrag(event: Event) {
        event.preventDefault();
        if (!isMouseEvent(event) || !this._block || !this._barType)
            return;

        const { table } = this._block;
        const { eventCenter } = this.muya;
        const { clientX, clientY } = event;
        const barType = this._barType;
        const index = getIndex(barType, this._block);
        const aspects = calculateAspects(table, barType);
        this._dragInfo = {
            table,
            clientX,
            clientY,
            barType,
            index,
            curIndex: index,
            dragCells: getDragCells(table, barType, index),
            cells: getAllTableCells(table),
            aspects,
            offset: 0,
        };

        for (const row of this._dragInfo.cells) {
            for (const cell of row) {
                if (!this._dragInfo.dragCells.includes(cell))
                    cell.classList.add('mu-cell-transform');
            }
        }

        this._dragEventIds.push(
            eventCenter.attachDOMEvent(document, 'mousemove', this._docMousemove),
            eventCenter.attachDOMEvent(document, 'mouseup', this._docMouseup),
        );
    }

    private _docMousemove = (event: Event) => {
        if (!this._dragInfo || !isMouseEvent(event))
            return;

        if (!shouldContinueTableDrag(event.buttons)) {
            this._cancelDrag();
            return;
        }

        const { barType } = this._dragInfo;
        const attrName = barType === 'bottom' ? 'clientX' : 'clientY';
        const offset = (this._dragInfo.offset
            = event[attrName] - this._dragInfo[attrName]);
        if (Math.abs(offset) < 5)
            return;

        this._isDragTableBar = true;
        this._calculateCurIndex();
        this._setDragTargetStyle();
        this._setSwitchStyle();
    };

    private _docMouseup = (event: Event) => {
        event.preventDefault();

        const { eventCenter } = this.muya;

        for (const id of this._dragEventIds)
            eventCenter.detachDOMEvent(id);

        this._dragEventIds = [];
        if (!this._isDragTableBar) {
            this._resetDragTableBar();
            return;
        }

        this._setDropTargetStyle();

        // The drop animation need 300ms.
        setTimeout(() => {
            this._switchTableData();
            this._resetDragTableBar();
        }, 300);
    };

    private _calculateCurIndex = () => {
        if (!this._dragInfo)
            return;

        const { aspects, index } = this._dragInfo;
        let { offset } = this._dragInfo;
        let curIndex = index;
        const len = aspects.length;
        let i;
        if (offset > 0) {
            for (i = index; i < len; i++) {
                const aspect = aspects[i];
                if (i === index)
                    offset -= Math.floor(aspect / 2);
                else
                    offset -= aspect;

                if (offset < 0)
                    break;
                else
                    curIndex++;
            }
        }
        else if (offset < 0) {
            for (i = index; i >= 0; i--) {
                const aspect = aspects[i];
                if (i === index)
                    offset += Math.floor(aspect / 2);
                else
                    offset += aspect;

                if (offset > 0)
                    break;
                else
                    curIndex--;
            }
        }

        this._dragInfo.curIndex = Math.max(0, Math.min(curIndex, len - 1));
    };

    private _setDragTargetStyle = () => {
        const { offset, barType, dragCells } = this._dragInfo!;

        for (const cell of dragCells) {
            if (!cell.classList.contains('mu-drag-cell')) {
                cell.classList.add('mu-drag-cell');
                cell.classList.add(`mu-drag-${barType}`);
            }
            const valueName = barType === 'bottom' ? 'translateX' : 'translateY';
            cell.style.transform = `${valueName}(${offset}px)`;
        }
    };

    private _setSwitchStyle = () => {
        if (!this._dragInfo)
            return;

        const { index, offset, curIndex, barType, aspects, cells } = this._dragInfo;
        const aspect = aspects[index];
        const len = aspects.length;
        const isPositive = offset > 0;
        const axis = barType === 'bottom' ? 'translateX' : 'translateY';
        const compute = (i: number) =>
            switchTransform(i, index, curIndex, aspect, axis, isPositive);

        if (barType === 'bottom')
            applyBottomSwitch(cells, len, compute);
        else
            applyRightSwitch(cells, len, compute);
    };

    private _setDropTargetStyle = () => {
        if (!this._dragInfo)
            return;

        const { dragCells, barType, curIndex, index, aspects, offset }
            = this._dragInfo;
        let move = 0;
        let i;
        if (offset > 0) {
            for (i = index + 1; i <= curIndex; i++)
                move += aspects[i];
        }
        else {
            for (i = curIndex; i < index; i++)
                move -= aspects[i];
        }

        for (const cell of dragCells) {
            cell.classList.remove('mu-drag-cell');
            cell.classList.remove(`mu-drag-${barType}`);
            cell.classList.add('mu-cell-transform');
            const valueName = barType === 'bottom' ? 'translateX' : 'translateY';
            cell.style.transform = `${valueName}(${move}px)`;
        }
    };

    private _switchTableData = () => {
        if (!this._dragInfo)
            return;

        const { barType, index, curIndex, table, offset } = this._dragInfo;
        if (index === curIndex)
            return;

        const tableState = table.getState();

        let cursorRowOffset = null;
        let cursorColumnOffset = null;
        let startOffset = 0;
        let endOffset = 0;

        // Find the new cursor position in table.
        if (table.active) {
            // TODO: @JOCS remove use this.selection directly
            const { anchorBlock, anchor, focus, isSelectionInSameBlock }
                = this.muya.editor.selection ?? {};
            const { rowOffset, columnOffset } = anchorBlock?.closestBlock(
                'table.cell',
            ) as TableBodyCell;

            startOffset = isSelectionInSameBlock
                ? Math.min(anchor!.offset, focus!.offset)
                : 0;
            endOffset = isSelectionInSameBlock
                ? Math.max(anchor!.offset, focus!.offset)
                : 0;
            if (barType === 'bottom') {
                cursorRowOffset = rowOffset;
                if (columnOffset === index) {
                    cursorColumnOffset = curIndex;
                }
                else if (
                    columnOffset >= Math.min(index, curIndex)
                    && columnOffset <= Math.max(index, curIndex)
                ) {
                    cursorColumnOffset = columnOffset + (offset > 0 ? -1 : 1);
                }
                else {
                    cursorColumnOffset = columnOffset;
                }
            }
            else {
                cursorColumnOffset = columnOffset;
                if (rowOffset === index) {
                    cursorRowOffset = curIndex;
                }
                else if (
                    rowOffset >= Math.min(index, curIndex)
                    && rowOffset <= Math.max(index, curIndex)
                ) {
                    cursorRowOffset = rowOffset + (offset > 0 ? -1 : 1);
                }
                else {
                    cursorRowOffset = rowOffset;
                }
            }
        }

        if (barType === 'bottom') {
            tableState.children.forEach((row) => {
                const cellState = row.children.splice(index, 1)[0];
                row.children.splice(curIndex, 0, cellState);
            });
        }
        else {
            const rowState = tableState.children.splice(index, 1)[0];
            tableState.children.splice(curIndex, 0, rowState);
        }

        const newTable = ScrollPage.loadBlock('table').create(
            this.muya,
            tableState,
        );
        table.replaceWith(newTable);

        if (cursorRowOffset !== null && cursorColumnOffset !== null) {
            const cursorBlock = newTable.firstChild
                .find(cursorRowOffset)
                .find(cursorColumnOffset)
                .firstContentInDescendant();
            cursorBlock.setCursor(startOffset, endOffset, true);
        }
    };

    private _resetDragTableBar = () => {
        this._dragInfo = null;
        this._isDragTableBar = false;
    };

    private _cancelDrag = () => {
        const { eventCenter } = this.muya;
        this._dragEventIds.forEach(id => eventCenter.detachDOMEvent(id));
        this._dragEventIds = [];

        this._dragInfo?.cells.flat().forEach((cell) => {
            cell.classList.remove(
                'mu-cell-transform',
                'mu-drag-cell',
                'mu-drag-bottom',
                'mu-drag-right',
            );
            cell.style.removeProperty('transform');
        });
        this._resetDragTableBar();
        this.hide();
    };

    private _render(barType: BarType, x: number, y: number) {
        const rect = this._syncRenderSize(barType);
        if (rect) {
            this._insertSide = getInsertionSide(barType, rect, x, y);
            if (this._insertSide)
                this.container!.dataset.insert = this._insertSide;
            else delete this.container!.dataset.insert;

            this._setInsertionActive(this._insertSide !== null);

            if (shouldHighlightTableAxis(this._insertSide))
                this._highlightHover(barType, this._block!);
            else
                this._clearHover();
        }
    }
}
