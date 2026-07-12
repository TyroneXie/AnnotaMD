import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getInsertionSide, shouldContinueTableDrag } from '../index';

const rect = { left: 100, right: 200, top: 50, bottom: 90 };
const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');
const blockCss = readFileSync(
    fileURLToPath(new URL('../../../assets/styles/blockSyntax.css', import.meta.url)),
    'utf8',
);

describe('Feishu-style table insertion hit areas', () => {
    it('uses column edges for column insertion and center for selection', () => {
        expect(getInsertionSide('bottom', rect, 105, 45)).toBe('before');
        expect(getInsertionSide('bottom', rect, 195, 45)).toBe('after');
        expect(getInsertionSide('bottom', rect, 150, 45)).toBeNull();
    });

    it('uses row edges for row insertion and center for selection', () => {
        expect(getInsertionSide('right', rect, 95, 55)).toBe('before');
        expect(getInsertionSide('right', rect, 95, 85)).toBe('after');
        expect(getInsertionSide('right', rect, 95, 70)).toBeNull();
    });

    it('keeps the outer drag hit areas transparent and paints hover borders inside cells', () => {
        expect(css).toMatch(
            /\.mu-table-drag-bar::before\s*\{[^}]*background:\s*transparent;/s,
        );
        expect(blockCss).toContain('.mu-table-axis-hover-edge-column::before');
        expect(blockCss).toContain('.mu-table-axis-hover-edge-row::before');
    });

    it('continues dragging only while the primary mouse button is held', () => {
        expect(shouldContinueTableDrag(1)).toBe(true);
        expect(shouldContinueTableDrag(0)).toBe(false);
        expect(shouldContinueTableDrag(2)).toBe(false);
    });
});
