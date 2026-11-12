// @vitest-environment happy-dom

import type Content from '../../../base/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOsx } from '../../../../config';
import { Muya } from '../../../../muya';

// `TableCellContent.enterHandler` dispatches based on
// the keyboard modifiers it reads off the event:
//   - Enter / Shift+Enter: inserts a literal `<br/>` at the caret.
//   - Cmd/Ctrl+Enter → `commandEnter`: inserts a new row after the current one.
// `isOsx` is resolved at import time from the userAgent. Under happy-dom the
// userAgent is "...X11; Darwin arm64..." which does NOT match /Mac/, so
// `isOsx === false` here and the command branch is reached via `ctrlKey`, not
// `metaKey`. We assert the ACTUAL behavior in this environment.
//
// Driven through a real boot (mirroring backspaceSafety.spec.ts) so cell
// resolution, row insertion, and caret placement run exactly as a real
// keystroke would.

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length) {
        const host = bootedHosts.pop()!;
        host.remove();
    }
    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

// Collect the table cell content blocks in document order.
function tableCells(muya: Muya): Content[] {
    const out: Content[] = [];
    const visit = (block: {
        constructor: { blockName?: string };
        children?: { forEach: (cb: (b: unknown) => void) => void };
    }) => {
        if (block.constructor.blockName === 'table.cell.content')
            out.push(block as unknown as Content);
        block.children?.forEach(b => visit(b as typeof block));
    };
    visit(muya.editor.scrollPage as unknown as Parameters<typeof visit>[0]);
    return out;
}

function makeEnterEvent(
    modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
): KeyboardEvent {
    return {
        key: 'Enter',
        shiftKey: modifiers.shiftKey ?? false,
        metaKey: modifiers.metaKey ?? false,
        ctrlKey: modifiers.ctrlKey ?? false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
}

function enterAt(
    muya: Muya,
    cell: Content,
    offset: number,
    modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
): void {
    muya.editor.activeContentBlock = cell;
    cell.setCursor(offset, offset, true);
    cell.enterHandler(makeEnterEvent(modifiers));
}

function flush(): Promise<void> {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

describe('tableCellContent.enterHandler', () => {
    it('sanity-checks the happy-dom isOsx assumption', () => {
        // The command branch in this env is reached via ctrlKey, not metaKey.
        expect(isOsx).toBe(false);
    });

    it('shift+Enter inserts a literal <br/> at the caret and advances it by 5', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        expect(cells.length).toBe(4);

        const cell = cells[0]; // header cell `ab`
        // Caret in the middle of `ab` (offset 1).
        enterAt(muya, cell, 1, { shiftKey: true });

        await flush();
        expect(cell.text).toContain('<br/>');
        expect(cell.text).toBe('a<br/>b');

        const cursor = cell.getCursor();
        expect(cursor).not.toBeNull();
        // Caret advances by `<br/>`.length (5) from the original offset 1.
        expect(cursor!.start.offset).toBe(1 + '<br/>'.length);
        expect(cursor!.start.offset).toBe(6);
    });

    it.each([0, 1, 2])('plain Enter at header offset %i splits text inside the same cell', async (offset) => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        // cells: [0]=ab (header c0), [1]=cd (header c1), [2]=ef (body c0), [3]=gh (body c1)

        enterAt(muya, cells[0], offset);

        await flush();
        // Table is intact.
        const state = muya.getState();
        expect(state.length).toBe(1);
        expect(state[0].name).toBe('table');

        const target = cells[0];
        expect(target.text).toBe(`${'ab'.slice(0, offset)}<br/>${'ab'.slice(offset)}`);
        const cursor = target.getCursor();
        expect(cursor).not.toBeNull();
        expect(cursor!.start.offset).toBe(offset + '<br/>'.length);
        expect(muya.editor.activeContentBlock).toBe(target);
        expect(cells[2].text).toBe('ef');
    });

    it('plain Enter in a last-row cell adds an editable line without appending a paragraph', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        // Last-row first cell is `ef` (cells[2]); the row's last content is `gh`.
        // Nothing follows the table in the document, so a trailing paragraph is
        // appended.
        enterAt(muya, cells[2], cells[2].text.length);

        await flush();
        const state = muya.getState();
        expect(state.length).toBe(1);
        expect(state[0].name).toBe('table');
        const target = cells[2];
        expect(target.text).toBe('ef<br/>');
        expect(target.domNode!.querySelector('.mu-table-cell-line-end')).not.toBeNull();
        expect(muya.editor.activeContentBlock).toBe(target);
        const cursor = target.getCursor();
        expect(cursor).not.toBeNull();
        expect(cursor!.start.offset).toBe('ef<br/>'.length);
    });

    it('repeated Enter adds another blank line in the same cell', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cell = tableCells(muya)[2];
        enterAt(muya, cell, cell.text.length);
        enterAt(muya, cell, cell.text.length);
        await flush();
        expect(cell.text).toBe('ef<br/><br/>');
        expect(cell.getCursor()!.start.offset).toBe(cell.text.length);
        expect(muya.editor.activeContentBlock).toBe(cell);
    });

    it('enter replaces selected text with a cell-local line break', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| efgh | ij |\n');
        const cell = tableCells(muya)[2];
        cell.setCursor(1, 3, true);
        cell.enterHandler(makeEnterEvent());
        await flush();
        expect(cell.text).toBe('e<br/>h');
        expect(cell.getCursor()!.start.offset).toBe(6);
    });

    it.each(['<br/>', '<br>', '<br />'])('backspace removes an entire %s between lines', async (br) => {
        const muya = bootMuya(`| ab | cd |\n| --- | --- |\n| ef${br}gh | ij |\n`);
        const cell = tableCells(muya)[2];
        cell.setCursor(2 + br.length, 2 + br.length, true);
        cell.backspaceHandler(new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }));
        await flush();
        expect(cell.text).toBe('efgh');
        expect(cell.getCursor()!.start.offset).toBe(2);
    });

    it.each(['<br/>', '<br>', '<br />'])('delete removes an entire %s before the next line', async (br) => {
        const muya = bootMuya(`| ab | cd |\n| --- | --- |\n| ef${br}gh | ij |\n`);
        const cell = tableCells(muya)[2];
        cell.setCursor(2, 2, true);
        cell.deleteHandler(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));
        await flush();
        expect(cell.text).toBe('efgh');
        expect(cell.getCursor()!.start.offset).toBe(2);
    });

    it.each([{}, { shiftKey: true }])('backspace reverses a new Enter line without exposing its markup: %j', async (modifiers) => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cell = tableCells(muya)[2];
        enterAt(muya, cell, cell.text.length, modifiers);
        cell.backspaceHandler(new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }));
        await flush();
        expect(cell.text).toBe('ef');
        expect(cell.getCursor()!.start.offset).toBe(2);
    });

    it('removes a line break inside formatting without removing the format or surrounding text', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| **ef<br/>gh** | ij |\n');
        const cell = tableCells(muya)[2];
        cell.setCursor(9, 9, true);
        cell.backspaceHandler(new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }));
        await flush();
        expect(cell.text).toBe('**efgh**');
        expect(cell.getCursor()!.start.offset).toBe(4);
    });

    it('leaves a literal break tag in inline code to normal character deletion', () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef`<br/>`gh | ij |\n');
        const cell = tableCells(muya)[2];
        const before = cell.text;
        const offset = before.indexOf('<br/>') + '<br/>'.length;
        cell.setCursor(offset, offset, true);
        const event = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
        cell.backspaceHandler(event);
        expect(event.defaultPrevented).toBe(false);
        expect(cell.text).toBe(before);
    });

    it('ctrl+Enter (command branch when !isOsx) inserts a new row, rowCount + 1', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        const table = (cells[0] as unknown as { table: { rowCount: number } }).table;
        const beforeRowCount = table.rowCount;
        expect(beforeRowCount).toBe(2);

        enterAt(muya, cells[0], 0, { ctrlKey: true });

        await flush();
        expect(table.rowCount).toBe(beforeRowCount + 1);
        expect(table.rowCount).toBe(3);

        const state = muya.getState();
        expect(state.length).toBe(1);
        expect(state[0].name).toBe('table');
        // The table state now carries 3 rows.
        expect((state[0] as { children: unknown[] }).children.length).toBe(3);
    });

    it('metaKey+Enter does NOT take the command branch under happy-dom (isOsx false) and behaves as plain Enter', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        const table = (cells[0] as unknown as { table: { rowCount: number } }).table;
        const beforeRowCount = table.rowCount;

        // metaKey alone, ctrlKey false: because isOsx === false, this falls
        // through to an in-cell line break, so no row is added.
        enterAt(muya, cells[0], 0, { metaKey: true });

        await flush();
        expect(table.rowCount).toBe(beforeRowCount);

        const target = cells[0];
        const cursor = target.getCursor();
        expect(cursor).not.toBeNull();
        expect(cursor!.start.offset).toBe('<br/>'.length);
        expect(target.text).toBe('<br/>ab');
    });
});
