// @vitest-environment happy-dom

import type Table from '../../../block/gfm/table';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { TableRowColumMenu } from '../index';

let muya: Muya;
let menu: TableRowColumMenu;

beforeEach(() => {
    window.MUYA_VERSION = 'test';
    const host = document.createElement('div');
    document.body.appendChild(host);
    muya = new Muya(host, {
        markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |\n',
    } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    menu = new TableRowColumMenu(muya, {});
});

afterEach(() => {
    menu.destroy();
    muya.domNode.remove();
});

const reference = {
    getBoundingClientRect: () => new DOMRect(100, 100, 40, 24),
};

function table(): Table {
    return muya.editor.scrollPage!.firstChild as Table;
}

function select(barType: 'right' | 'bottom', row: number, column: number) {
    const block = table().cellAt(row, column)!;
    muya.eventCenter.emit('muya-table-bar', {
        reference,
        tableInfo: { barType },
        block,
    });
}

describe('Feishu-style table axis selection', () => {
    it('selects and pins a whole row until the menu closes', () => {
        select('right', 1, 0);

        const selected = table().domNode!.querySelectorAll('.mu-table-axis-selected');
        expect(selected).toHaveLength(2);
        expect(Array.from(selected).map(cell => cell.textContent?.trim())).toEqual(['1', '2']);
        expect(selected[0].classList.contains('mu-table-axis-edge-row')).toBe(true);

        menu.hide();
        expect(table().domNode!.querySelectorAll('.mu-table-axis-selected')).toHaveLength(0);
    });

    it('selects and pins a whole column until the menu closes', () => {
        select('bottom', 0, 1);

        const selected = table().domNode!.querySelectorAll('.mu-table-axis-selected');
        expect(selected).toHaveLength(2);
        expect(Array.from(selected).map(cell => cell.textContent?.trim())).toEqual(['B', '2']);
        expect(selected[0].classList.contains('mu-table-axis-edge-column')).toBe(true);
        expect(
            Array.from(menu.container!.querySelectorAll<HTMLElement>('li.item'))
                .every(item => Boolean(item.dataset.tooltip)),
        ).toBe(true);
        for (const icon of [
            'align-left',
            'align-center',
            'align-right',
            'strong',
            'strikethrough',
            'italic',
            'underline',
            'inline-code',
            'color',
            'comment',
            'move-left',
            'move-right',
            'reset-width',
            'delete',
        ]) {
            expect(menu.container!.querySelector(`.mu-action-icon-${icon}`), icon).not.toBeNull();
        }
    });

    it('formats every non-empty cell in the selected axis', async () => {
        select('right', 1, 0);
        expect((menu as unknown as { _axisContents: () => unknown[] })._axisContents()).toHaveLength(2);

        menu.selectItem(new Event('click'), {
            label: 'Emphasize',
            action: 'format',
            target: 'row',
            format: 'strong',
            symbol: 'B',
            group: 1,
        });

        await vi.waitFor(() => expect(muya.getMarkdown()).toContain('| **1** | **2** |'));
        expect(table().domNode!.querySelectorAll('strong')).toHaveLength(2);
    });

    it('toggles inline code for the selected axis and reflects its active state', async () => {
        select('right', 1, 0);
        const item = {
            label: 'Inline Code',
            action: 'format' as const,
            target: 'row' as const,
            format: 'inline_code' as const,
            symbol: '</>',
            group: 1,
        };

        menu.selectItem(new Event('click'), item);
        await vi.waitFor(() => expect(muya.getMarkdown()).toContain('| `1` | `2` |'));
        expect(menu.container!.querySelector('li.item.inline_code')?.classList.contains('active')).toBe(true);

        menu.selectItem(new Event('click'), item);
        await vi.waitFor(() => expect(muya.getMarkdown()).toMatch(/\| 1\s+\| 2\s+\|/));
        expect(menu.container!.querySelector('li.item.inline_code')?.classList.contains('active')).toBe(false);
    });

    it('emits one comment request spanning the selected axis', () => {
        const listener = vi.fn();
        muya.eventCenter.on('annotamd-comment-selection', listener);
        select('bottom', 0, 1);

        menu.selectItem(new Event('click'), {
            label: 'Comment',
            action: 'comment',
            target: 'column',
            symbol: '',
            group: 1,
        });

        expect(listener).toHaveBeenCalledOnce();
        expect(listener.mock.calls[0][0]).toMatchObject({
            quote: 'B 2',
            isCrossBlock: true,
        });
    });
});
