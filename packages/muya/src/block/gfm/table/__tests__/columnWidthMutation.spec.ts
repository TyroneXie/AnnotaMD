// @vitest-environment happy-dom

import type Table from '../index';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../../muya';
import { applyTableColumnWidths } from '../../../../ui/tableDragBar';

const hosts: HTMLElement[] = [];
afterEach(() => {
    while (hosts.length)
        hosts.pop()!.remove();
    vi.unstubAllGlobals();
});

function bootTable() {
    vi.stubGlobal('MUYA_VERSION', 'test');
    const host = document.createElement('div');
    document.body.append(host);
    const muya = new Muya(host, {
        markdown: '| Label | | Explanation |\n| --- | --- | --- |\n| A | | A long explanation that must remain readable |\n',
    });
    muya.init();
    hosts.push(muya.domNode);
    const table = muya.editor.scrollPage!.firstChild as Table;
    const element = table.firstChild!.domNode as HTMLTableElement;
    applyTableColumnWidths(element, [160, 72, 360]);
    return { muya, table, element };
}

for (const operation of ['delete', 'insert'] as const) {
    it(`drops stale DOM-only widths when columns ${operation}`, async () => {
        const { muya, table, element } = bootTable();
        if (operation === 'delete')
            table.removeColumn(1);
        else
            table.insertColumn(1);

        expect(element.querySelector('colgroup[data-muya-column-widths]')).toBeNull();
        expect(element.dataset.columnResized).toBeUndefined();
        expect(element.style.tableLayout).toBe('');
        expect(element.style.width).toBe('');
        expect(element.style.minWidth).toBe('');
        expect([...element.querySelectorAll('tr')].map(row => row.children.length))
            .toEqual(operation === 'delete' ? [2, 2] : [4, 4]);
        await vi.waitFor(() => expect(muya.getMarkdown()).toContain('A long explanation'));
    });
}
