import { afterEach, describe, expect, it, vi } from 'vitest';

import { measureStrikethroughLines } from '../strikethroughLines';

const rect = (
    left: number,
    top: number,
    right: number,
    bottom: number,
): DOMRect => ({
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
});

describe('strikethrough line geometry', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses one parent fragment per visual line instead of nested font boxes', () => {
        vi.stubGlobal('getComputedStyle', () => ({ color: 'rgb(12, 34, 56)' }));
        const deletion = {
            getClientRects: () => [
                rect(120, 80, 420, 104),
                rect(120, 112, 300, 136),
            ],
        } as unknown as HTMLElement;

        const lines = measureStrikethroughLines(
            [deletion],
            rect(100, 40, 500, 300),
        );
        expect(lines).toMatchObject([
            { left: 20, width: 300, color: 'rgb(12, 34, 56)' },
            { left: 20, width: 180, color: 'rgb(12, 34, 56)' },
        ]);
        expect(lines[0].top).toBeCloseTo(51.52);
        expect(lines[1].top).toBeCloseTo(83.52);
    });

    it('ignores collapsed fragments', () => {
        vi.stubGlobal('getComputedStyle', () => ({ color: '' }));
        const deletion = {
            getClientRects: () => [
                rect(10, 10, 10, 30),
                rect(10, 10, 40, 10),
            ],
        } as unknown as HTMLElement;

        expect(measureStrikethroughLines(
            [deletion],
            rect(0, 0, 100, 100),
        )).toEqual([]);
    });
});
