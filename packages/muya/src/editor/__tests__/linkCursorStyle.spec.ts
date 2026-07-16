import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
    fileURLToPath(new URL('../../assets/styles/inlineSyntax.css', import.meta.url)),
    'utf8',
);

describe('rendered link cursor', () => {
    it('uses a pointer for Markdown, reference, auto and HTML-preview links', () => {
        expect(stylesheet).toMatch(
            /a\.mu-inline-rule,\s*span\.mu-inline-rule\.mu-link\s*\{[^}]*cursor:\s*pointer;/s,
        );
        expect(stylesheet).toMatch(
            /\.mu-html-preview a\[href\]\s*\{[^}]*cursor:\s*pointer;/s,
        );
    });
});
