import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCK_DOM_PROPERTY } from '../../../config';
import {
    getInsertionSide,
    isTableCellOwnedByMuya,
    isSameInsertionBoundary,
    shouldContinueTableDrag,
    shouldHighlightTableAxis,
} from '../index';

const rect = { left: 100, right: 200, top: 50, bottom: 90 };
const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');
const blockCss = readFileSync(
    fileURLToPath(new URL('../../../assets/styles/blockSyntax.css', import.meta.url)),
    'utf8',
);

describe('Feishu-style table insertion hit areas', () => {
    it('only lets the editor that owns a table cell react to it', () => {
        const owner = {};
        const foreignEditor = {};
        const cell = {
            [BLOCK_DOM_PROPERTY]: { blockName: 'table.cell', muya: owner },
        } as unknown as Element;
        const nonCell = {
            [BLOCK_DOM_PROPERTY]: { blockName: 'paragraph', muya: owner },
        } as unknown as Element;

        expect(isTableCellOwnedByMuya(cell, owner)).toBe(true);
        expect(isTableCellOwnedByMuya(cell, foreignEditor)).toBe(false);
        expect(isTableCellOwnedByMuya(nonCell, owner)).toBe(false);
    });

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

    it('does not activate a neighbouring insertion handle after leaving the cell axis', () => {
        expect(getInsertionSide('bottom', rect, 99, 45)).toBeNull();
        expect(getInsertionSide('bottom', rect, 201, 45)).toBeNull();
        expect(getInsertionSide('right', rect, 95, 49)).toBeNull();
        expect(getInsertionSide('right', rect, 95, 91)).toBeNull();
    });

    it('treats both sides of a shared cell edge as one insertion boundary', () => {
        const leftCell = { left: 0, right: 100, top: 0, bottom: 40 };
        const rightCell = { left: 100, right: 220, top: 0, bottom: 40 };
        expect(isSameInsertionBoundary(
            'bottom',
            leftCell,
            'after',
            rightCell,
            'before',
        )).toBe(true);

        const upperCell = { left: 0, right: 100, top: 0, bottom: 40 };
        const lowerCell = { left: 0, right: 100, top: 40, bottom: 90 };
        expect(isSameInsertionBoundary(
            'right',
            upperCell,
            'after',
            lowerCell,
            'before',
        )).toBe(true);
        expect(isSameInsertionBoundary(
            'bottom',
            leftCell,
            'before',
            rightCell,
            'before',
        )).toBe(false);
    });

    it('keeps the drag hit areas transparent and paints hover borders outside cells', () => {
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

    it('hides the thick axis highlight while an insertion handle is visible', () => {
        expect(shouldHighlightTableAxis(null)).toBe(true);
        expect(shouldHighlightTableAxis('before')).toBe(false);
        expect(shouldHighlightTableAxis('after')).toBe(false);
        expect(blockCss).toContain('.mu-table-inner.mu-table-insertion-active');
    });

    it('keeps the insertion guide centered under the plus on both trailing edges', () => {
        expect(css).toMatch(
            /\[data-drag='bottom'\]\[data-insert='after'\]::after\s*\{[^}]*translateX\(50%\)/s,
        );
        expect(css).toMatch(
            /\[data-drag='right'\]\[data-insert='after'\]::after\s*\{[^}]*translateY\(50%\)/s,
        );
    });
});
