import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toolList } from '../config';

const css = readFileSync(
    fileURLToPath(new URL('../index.css', import.meta.url)),
    'utf8',
);
const sharedIconCss = readFileSync(
    fileURLToPath(new URL('../../actionIcons.css', import.meta.url)),
    'utf8',
);

describe('feishu-style table axis toolbar configuration', () => {
    it('does not duplicate row or column insertion already provided by edge plus controls', () => {
        expect(toolList.right.some(item => item.action === 'insert')).toBe(false);
        expect(toolList.bottom.some(item => item.action === 'insert')).toBe(false);
    });

    it('offers the shared text formatting, color and comment actions for rows and columns', () => {
        for (const tools of [toolList.right, toolList.bottom]) {
            expect(tools.filter(item => item.action === 'format').map(item => item.format)).toEqual([
                'strong',
                'del',
                'em',
                'u',
                'inline_code',
            ]);
            expect(tools.some(item => item.action === 'palette')).toBe(true);
            expect(tools.some(item => item.action === 'comment')).toBe(true);
        }
    });

    it('keeps comment immediately before delete without a separator', () => {
        for (const tools of [toolList.right, toolList.bottom]) {
            const commentIndex = tools.findIndex(item => item.action === 'comment');
            const removeIndex = tools.findIndex(item => item.action === 'remove');

            expect(commentIndex).toBe(removeIndex - 1);
            expect(tools[commentIndex].group).toBe(tools[removeIndex].group);
        }
    });

    it('uses a short middle stroke whose position distinguishes alignment', () => {
        const source = readFileSync(
            fileURLToPath(new URL('../index.ts', import.meta.url)),
            'utf8',
        );
        expect(source).toMatch(/return `align-\$\{item\.value\}`/);
        expect(source).toContain('renderActionIcon(tableActionIcon(item))');
    });

    it('shows an immediate text tooltip for every icon button', () => {
        expect(css).toMatch(
            /li\.item\[data-tooltip\]::after\s*\{[^}]*content:\s*attr\(data-tooltip\);[^}]*opacity:\s*0;/,
        );
        expect(css).toMatch(
            /li\.item\[data-tooltip\]:hover::after\s*\{[^}]*opacity:\s*1;/,
        );
    });

    it('keeps every toolbar symbol on the same visual canvas', () => {
        expect(sharedIconCss).toMatch(
            /\.mu-action-icon\s*\{[^}]*width:\s*16px;[^}]*min-width:\s*16px;[^}]*height:\s*16px;/,
        );
    });

    it('keeps the inline-code glyph narrow inside the shared icon canvas', () => {
        expect(sharedIconCss).toMatch(
            /\.mu-action-icon-inline-code\s*\{[^}]*font-size:\s*11px;[^}]*transform:\s*scaleX\(0\.86\);/,
        );
    });
});
