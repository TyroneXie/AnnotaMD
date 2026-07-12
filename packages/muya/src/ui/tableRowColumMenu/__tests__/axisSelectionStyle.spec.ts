import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
    fileURLToPath(new URL('../../../assets/styles/blockSyntax.css', import.meta.url)),
    'utf8',
);

describe('Feishu-style table axis selection appearance', () => {
    it('uses a prominent rounded five-pixel edge for selected columns and rows', () => {
        expect(css).toMatch(
            /\.mu-table-axis-edge-column::before\s*\{[^}]*border-top:\s*5px solid #3370ff;[^}]*border-radius:\s*3px 3px 0 0;/s,
        );
        expect(css).toMatch(
            /\.mu-table-axis-edge-row::before\s*\{[^}]*border-left:\s*5px solid #3370ff;[^}]*border-radius:\s*3px 0 0 3px;/s,
        );
    });

    it('draws hover and selected edges on the same inner cell border', () => {
        expect(css).toMatch(
            /\.mu-table-axis-hover-edge-column::before\s*\{[^}]*border-top:\s*5px solid #3370ff;[^}]*border-radius:\s*3px 3px 0 0;/s,
        );
        expect(css).toMatch(
            /\.mu-table-axis-hover-edge-row::before\s*\{[^}]*border-left:\s*5px solid #3370ff;[^}]*border-radius:\s*3px 0 0 3px;/s,
        );
    });
});
