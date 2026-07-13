import type { VNode } from 'snabbdom';
import type TableBodyCell from '../../block/gfm/table/cell';
import type TableInner from '../../block/gfm/table/table';

import type { Muya } from '../../index';
import type { ColorFormatType } from '../inlineFormatToolbar/config';
import type { MenuItem, TableAxisFormat } from './config';
import type { ActionIconName } from '../actionIcons';
import Format from '../../block/base/format';
import { h, patch } from '../../utils/snabbdom';
import { formatActionIcon, renderActionIcon } from '../actionIcons';
import BaseFloat from '../baseFloat';
import { COLOR_PALETTES } from '../inlineFormatToolbar/config';
import { toolList } from './config';
import '../actionIcons.css';
import './index.css';

const defaultOptions = {
    placement: 'bottom' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

const columnOptions = {
    ...defaultOptions,
    placement: 'top' as const,
    offsetOptions: { ...defaultOptions.offsetOptions, mainAxis: 8 },
};

const rowOptions = {
    ...defaultOptions,
    placement: 'right' as const,
    offsetOptions: { ...defaultOptions.offsetOptions, mainAxis: 8 },
};

function wrapOrUnwrap(text: string, open: string, close = open): string {
    return text.startsWith(open) && text.endsWith(close)
        ? text.slice(open.length, -close.length)
        : `${open}${text}${close}`;
}

export function isWholeTableCellFormatted(text: string, type: TableAxisFormat): boolean {
    switch (type) {
        case 'strong':
            return text.startsWith('**') && text.endsWith('**');
        case 'del':
            return text.startsWith('~~') && text.endsWith('~~');
        case 'em':
            return text.startsWith('*') && !text.startsWith('**') && text.endsWith('*');
        case 'u':
            return text.startsWith('<u>') && text.endsWith('</u>');
        case 'inline_code':
            return /^(`+)[\s\S]*\1$/.test(text);
    }
}

function tableActionIcon(item: MenuItem): ActionIconName {
    if (item.action === 'format')
        return formatActionIcon(item.format!)!;
    if (item.action === 'palette')
        return 'color';
    if (item.action === 'comment')
        return 'comment';
    if (item.action === 'remove')
        return 'delete';
    if (item.action === 'reset-width')
        return 'reset-width';
    if (item.action === 'align')
        return `align-${item.value}` as ActionIconName;
    if (item.target === 'row')
        return item.location === 'previous' ? 'move-up' : 'move-down';
    return item.location === 'left' ? 'move-left' : 'move-right';
}

export function formatWholeTableCell(
    text: string,
    type: TableAxisFormat | ColorFormatType,
    value = '',
): string {
    switch (type) {
        case 'strong':
            return wrapOrUnwrap(text, '**');
        case 'del':
            return wrapOrUnwrap(text, '~~');
        case 'em':
            return wrapOrUnwrap(text, '*');
        case 'u':
            return wrapOrUnwrap(text, '<u>', '</u>');
        case 'inline_code': {
            const match = text.match(/^(`+)([\s\S]*)\1$/);
            if (match)
                return match[2];
            const marker = text.includes('`') ? '``' : '`';
            return `${marker}${text}${marker}`;
        }
        case 'text_color':
        case 'background_color': {
            const property = type === 'text_color' ? 'color' : 'background-color';
            const pattern = new RegExp(`^<span style="${property}: [^"]+">([\\s\\S]*)<\\/span>$`);
            const match = text.match(pattern);
            if (!value)
                return match?.[1] ?? text;
            const open = `<span style="${property}: ${value}">`;
            if (text.startsWith(open) && text.endsWith('</span>'))
                return text.slice(open.length, -7);
            return `${open}${match?.[1] ?? text}</span>`;
        }
    }
}

interface ITableInfo {
    barType: 'bottom' | 'right';
}

export class TableRowColumMenu extends BaseFloat {
    static pluginName = 'tableBarTools';
    public override capturesContentKeydown = true;
    private _oldVNode: VNode | null = null;
    private _tableInfo: ITableInfo | null = null;
    private _block: TableBodyCell | null = null;
    private _tableBarContainer: HTMLDivElement = document.createElement('div');
    private _paletteOpen = false;

    constructor(muya: Muya, options = {}) {
        const name = 'mu-table-bar-tools';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);

        this.floatBox!.classList.add('mu-table-bar-tools');
        this.container!.appendChild(this._tableBarContainer);
        this.listen();
    }

    override listen() {
        super.listen();
        const { eventCenter } = this.muya;
        eventCenter.subscribe(
            'muya-table-bar',
            ({ reference, tableInfo, block }) => {
                if (reference) {
                    this._clearSelection();
                    this._tableInfo = tableInfo;
                    this._block = block;
                    this._paletteOpen = false;
                    this.options = tableInfo.barType === 'bottom'
                        ? columnOptions
                        : rowOptions;
                    this.render();
                    this._highlightSelection();
                    this.show(reference);
                }
                else {
                    this.hide();
                }
            },
        );
    }

    override hide() {
        this._paletteOpen = false;
        this._clearSelection();
        super.hide();
    }

    private _highlightSelection() {
        if (!this._block || !this._tableInfo)
            return;

        const { table, row } = this._block;
        const cells = Array.from(
            table.domNode?.querySelectorAll<HTMLElement>('.mu-table-cell') ?? [],
        );
        const rowIndex = (table.firstChild as TableInner).offset(row);
        const columnIndex = row.offset(this._block);
        const columnCount = table.columnCount;
        const selectedCells: HTMLElement[] = [];
        cells.forEach((cell, index) => {
            const selected = this._tableInfo!.barType === 'right'
                ? Math.floor(index / columnCount) === rowIndex
                : index % columnCount === columnIndex;
            if (selected) {
                cell.classList.add('mu-table-axis-selected');
                selectedCells.push(cell);
            }
        });
        selectedCells[0]?.classList.add(
            this._tableInfo.barType === 'right'
                ? 'mu-table-axis-edge-row'
                : 'mu-table-axis-edge-column',
        );
    }

    private _clearSelection() {
        this._block?.table.domNode
            ?.querySelectorAll('.mu-table-axis-selected')
            .forEach((cell) => {
                cell.classList.remove(
                    'mu-table-axis-selected',
                    'mu-table-axis-edge-row',
                    'mu-table-axis-edge-column',
                );
            });
    }

    render() {
        const { _tableInfo: tableInfo, _oldVNode: oldVNode, _tableBarContainer: tableBarContainer } = this;
        const { i18n } = this.muya;
        const renderArray: MenuItem[] = toolList[tableInfo!.barType];
        const rowIndex = (this._block!.table.firstChild as TableInner).offset(this._block!.row);
        const columnIndex = this._block!.row.offset(this._block!);
        const axisTexts = this._axisContents()
            .map(content => content.text)
            .filter(text => text.trim());
        let previousGroup: number | null = null;
        const children = renderArray.map((item) => {
            const { label } = item;
            const groupStart = previousGroup !== null && previousGroup !== item.group;
            previousGroup = item.group;
            const direction = item.location ?? item.value ?? '';
            const disabled = item.action === 'move'
                && (item.target === 'row'
                    ? (item.location === 'previous' ? rowIndex === 0 : rowIndex === this._block!.table.rowCount - 1)
                    : (item.location === 'left' ? columnIndex === 0 : columnIndex === this._block!.table.columnCount - 1));
            const active = (item.action === 'align' && this._block!.align === item.value)
                || (item.action === 'format' && item.format != null && axisTexts.length > 0
                    && axisTexts.every(text => isWholeTableCellFormatted(text, item.format!)));
            const paletteOpen = item.action === 'palette' && this._paletteOpen;
            const selector = `li.item.${item.action}.${item.format ?? ''}.${direction}${groupStart ? '.group-start' : ''}${disabled ? '.disabled' : ''}${active ? '.active' : ''}${paletteOpen ? '.palette-open' : ''}`;
            const itemChildren: VNode[] = [renderActionIcon(tableActionIcon(item))];
            if (paletteOpen)
                itemChildren.push(this._createColorPalette());

            return h(
                selector,
                {
                    attrs: {
                        'aria-label': i18n.t(label),
                        'aria-disabled': String(disabled),
                        'data-tooltip': i18n.t(label),
                    },
                    dataset: {
                        label: item.action,
                    },
                    on: {
                        click: (event) => {
                            if (disabled)
                                return;
                            this.selectItem(event, item);
                        },
                    },
                },
                itemChildren,
            );
        });

        const vnode = h('ul', children);

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(tableBarContainer, vnode);

        this._oldVNode = vnode;
    }

    selectItem(event: Event, item: MenuItem) {
        event.preventDefault();
        event.stopPropagation();

        const { table, row } = this._block!;
        const rowCount = (table.firstChild as TableInner).offset(row);
        const columnCount = row.offset(this._block!);
        const { location, action, target } = item;

        if (action === 'palette') {
            this._paletteOpen = !this._paletteOpen;
            this.render();
            return;
        }

        if (action === 'format' && item.format) {
            this._formatAxis(item.format);
            this.render();
            return;
        }

        if (action === 'comment') {
            this._commentAxis();
            this.hide();
            return;
        }

        if (action === 'insert') {
            let cursorBlock = null;

            if (target === 'row') {
                const offset = location === 'previous' ? rowCount : rowCount + 1;
                cursorBlock = table.insertRow(offset);
            }
            else {
                const offset = location === 'left' ? columnCount : columnCount + 1;
                cursorBlock = table.insertColumn(offset);
            }

            if (cursorBlock)
                cursorBlock.setCursor(0, 0);
        }
        else if (action === 'remove') {
            // After a row/column delete, the caret used to live inside a
            // now-detached cell. The table
            // mutators now return a surviving neighbour cell's content so we
            // can re-anchor the caret on a still-attached cell.
            const cursorBlock = target === 'row'
                ? table.removeRow(rowCount)
                : table.removeColumn(columnCount);

            if (cursorBlock)
                cursorBlock.setCursor(0, 0);
        }

        else if (action === 'move') {
            const current = target === 'row' ? rowCount : columnCount;
            const targetIndex = current + (
                location === 'previous' || location === 'left' ? -1 : 1
            );
            const cursorBlock = target === 'row'
                ? table.moveRow(current, targetIndex)
                : table.moveColumn(current, targetIndex);
            cursorBlock?.setCursor(0, 0);
        }

        else if (action === 'align') {
            table.alignColumn(columnCount, item.value!);
            this.render();
            return;
        }

        else if (action === 'reset-width') {
            table.resetColumnWidths();
            return;
        }

        this.hide();
    }

    private _axisContents(): Format[] {
        if (!this._block || !this._tableInfo)
            return [];

        const { table, row } = this._block;
        const rowIndex = (table.firstChild as TableInner).offset(row);
        const columnIndex = row.offset(this._block);
        const cells: TableBodyCell[] = [];
        if (this._tableInfo.barType === 'right') {
            for (let column = 0; column < table.columnCount; column++) {
                const cell = table.cellAt(rowIndex, column);
                if (cell)
                    cells.push(cell);
            }
        }
        else {
            for (let rowOffset = 0; rowOffset < table.rowCount; rowOffset++) {
                const cell = table.cellAt(rowOffset, columnIndex);
                if (cell)
                    cells.push(cell);
            }
        }

        return cells
            .map(cell => cell.firstContentInDescendant())
            .filter((content): content is Format => content instanceof Format);
    }

    private _formatAxis(type: TableAxisFormat | ColorFormatType, value?: string): void {
        for (const content of this._axisContents()) {
            if (!content.text.trim())
                continue;
            content.text = formatWholeTableCell(content.text, type, value);
            // Assigning `text` updates the document state, but table cells do
            // not re-render themselves from that assignment. Refresh every
            // affected cell so the whole selected row/column changes visibly
            // at once instead of only updating after reopening the document.
            content.update();
        }
    }

    private _commentAxis(): void {
        const contents = this._axisContents().filter(content => content.text.trim());
        const first = contents[0];
        const last = contents.at(-1);
        if (!first || !last)
            return;

        const quote = contents
            .map(content => content.domNode?.innerText || content.domNode?.textContent || content.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        const anchorKey = first.path.join('/');
        const focusKey = last.path.join('/');
        this.muya.eventCenter.emit('annotamd-comment-selection', {
            quote,
            anchor: { key: anchorKey, offset: 0 },
            focus: { key: focusKey, offset: last.text.length },
            isCrossBlock: anchorKey !== focusKey,
            capturedAt: Date.now(),
        });
    }

    private _createColorPalette(): VNode {
        const { i18n } = this.muya;
        const groups = (['text_color', 'background_color'] as ColorFormatType[]).map(type => h(
            'div.axis-color-group',
            [
                h(
                    'div.axis-color-title',
                    i18n.t(type === 'text_color' ? 'Font Color' : 'Background Color'),
                ),
                h('div.axis-color-grid', COLOR_PALETTES[type].map(value => h(
                    `button.axis-color-swatch${value ? '' : '.default'}`,
                    {
                        attrs: {
                            type: 'button',
                            'aria-label': value || i18n.t('Default Color'),
                            title: value || i18n.t('Default Color'),
                        },
                        style: value ? { background: value } : {},
                        on: {
                            mousedown: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            },
                            click: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                this._formatAxis(type, value);
                                this._paletteOpen = false;
                                this.render();
                            },
                        },
                    },
                    '',
                ))),
            ],
        ));
        return h('div.axis-color-palette', groups);
    }
}
