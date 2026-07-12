import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
    fileURLToPath(new URL('../index.css', import.meta.url)),
    'utf8',
);

describe('paragraph front button cursor', () => {
    it('uses a pointing hand until the drag handle is pressed', () => {
        expect(stylesheet).toMatch(/\.mu-icon-wrapper\s*\{[^}]*cursor:\s*pointer;/s);
        expect(stylesheet).toMatch(/\.mu-icon-wrapper:active\s*\{[^}]*cursor:\s*grabbing;/s);
    });
});
