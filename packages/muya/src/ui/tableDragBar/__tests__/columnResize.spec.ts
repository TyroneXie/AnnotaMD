// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
    applyTableColumnWidths,
    getTableRightSnap,
    resizeColumnWidths,
} from '../index';

describe('table column resize', () => {
    it('resizes only the requested column without mutating the measured widths', () => {
        const widths = [120, 160, 200];

        expect(resizeColumnWidths(widths, 1, 35)).toEqual([120, 195, 200]);
        expect(widths).toEqual([120, 160, 200]);
    });

    it('keeps a resized column wide enough to remain usable', () => {
        expect(resizeColumnWidths([120, 160], 0, -100)).toEqual([72, 160]);
    });

    it('uses a colgroup so every cell in the column shares the same width', () => {
        const table = document.createElement('table');
        table.innerHTML = '<tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr>';

        applyTableColumnWidths(table, [120, 180]);

        const columns = [...table.querySelectorAll(':scope > colgroup > col')];
        expect(columns.map(column => (column as HTMLElement).style.width)).toEqual([
            '120px',
            '180px',
        ]);
        expect(table.style.tableLayout).toBe('fixed');
        expect(table.style.width).toBe('300px');
        expect(table.style.minWidth).toBe('0px');
        expect(table.dataset.columnResized).toBe('true');
    });

    it('shows the content-edge guide before the table reaches the snap range', () => {
        expect(getTableRightSnap(965, 1000)).toEqual({
            showGuide: true,
            adjustment: 0,
        });
        expect(getTableRightSnap(960, 1000)).toEqual({
            showGuide: false,
            adjustment: 0,
        });
    });

    it('snaps either side of the table edge to the content edge when close', () => {
        expect(getTableRightSnap(992, 1000)).toEqual({
            showGuide: true,
            adjustment: 8,
        });
        expect(getTableRightSnap(1007, 1000)).toEqual({
            showGuide: true,
            adjustment: -7,
        });
    });
});
