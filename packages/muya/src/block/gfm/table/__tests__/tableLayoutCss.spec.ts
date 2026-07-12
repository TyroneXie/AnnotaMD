import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
    fileURLToPath(new URL('../../../../assets/styles/blockSyntax.css', import.meta.url)),
    'utf8',
);

describe('table responsive layout', () => {
    it('lets wide tables exceed the viewport so the desktop scroll container can expose every column', () => {
        expect(stylesheet).toMatch(/\.mu-table-inner\s*\{[^}]*min-width:\s*100%;[^}]*width:\s*max-content;/s);
    });
});
