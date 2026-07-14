import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
    fileURLToPath(new URL('../../../assets/styles/blockSyntax.css', import.meta.url)),
    'utf8',
);
const desktopEditor = readFileSync(
    fileURLToPath(
        new URL(
            '../../../../../desktop/src/renderer/src/components/editorWithTabs/editor.vue',
            import.meta.url,
        ),
    ),
    'utf8',
);

describe('Feishu-style table axis selection appearance', () => {
    it('draws selected column and row edges outside the table border', () => {
        expect(css).toMatch(
            /\.mu-table-axis-edge-column::before\s*\{(?=[^}]*height:\s*calc\(100% \+ 6px\);)(?=[^}]*border-top:\s*5px solid #3370ff;)(?=[^}]*transform:\s*translateY\(-5px\);)[^}]*\}/s,
        );
        expect(css).toMatch(
            /\.mu-table-axis-edge-row::before\s*\{(?=[^}]*width:\s*calc\(100% \+ 6px\);)(?=[^}]*border-left:\s*5px solid #3370ff;)(?=[^}]*transform:\s*translateX\(-5px\);)[^}]*\}/s,
        );
    });

    it('draws hover edges outside without moving selected edges', () => {
        expect(css).toMatch(
            /\.mu-table-axis-hover-edge-column::before\s*\{(?=[^}]*height:\s*calc\(100% \+ 6px\);)(?=[^}]*border-top:\s*5px solid #3370ff;)(?=[^}]*transform:\s*translateY\(-5px\);)[^}]*\}/s,
        );
        expect(css).toMatch(
            /\.mu-table-axis-hover-edge-row::before\s*\{(?=[^}]*width:\s*calc\(100% \+ 6px\);)(?=[^}]*border-left:\s*5px solid #3370ff;)(?=[^}]*transform:\s*translateX\(-5px\);)[^}]*\}/s,
        );
    });

    it('does not clip the outside hover edges in the desktop table viewport', () => {
        expect(desktopEditor).toMatch(
            /table\.mu-table-inner\s*\{[^}]*overflow:\s*visible\s*!important;/s,
        );
        expect(desktopEditor).toMatch(
            /figure\.mu-table\s*\{[^}]*padding-inline-start:\s*5px;/s,
        );
    });
});
