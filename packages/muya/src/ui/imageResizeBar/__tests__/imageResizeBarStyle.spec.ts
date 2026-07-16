import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
    fileURLToPath(new URL('../index.css', import.meta.url)),
    'utf8',
);
describe('image resize handles', () => {
    it('keeps four invisible 32px corner hot zones above the image', () => {
        expect(stylesheet).toMatch(
            /\.mu-transformer \.bar\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*9999;[^}]*display:\s*block;/s,
        );
        expect(stylesheet).toMatch(
            /\.mu-transformer \.bar\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/s,
        );
        expect(stylesheet).not.toMatch(/display:\s*none\s*!important/);
        expect(stylesheet).toMatch(
            /\.mu-transformer \.bar\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s,
        );
        expect(stylesheet).toMatch(/\.mu-transformer \.top-left,[^}]*\.mu-transformer \.bottom-right/s);
        expect(stylesheet).toMatch(/\.mu-transformer \.top-right,[^}]*\.mu-transformer \.bottom-left/s);
        expect(stylesheet).toMatch(/\.mu-image-resize-guide\s*\{[^}]*border-left:\s*1px dashed/s);
    });

    it('shows a light border directly on the image without adding a shadow', () => {
        expect(stylesheet).toMatch(
            /\.mu-image-resize-outline\s*\{[^}]*position:\s*fixed;[^}]*border:\s*1px solid rgb\(51 112 255 \/ 72%\);[^}]*pointer-events:\s*none;/s,
        );
        expect(stylesheet).not.toMatch(/\.mu-image-resize-outline\s*\{[^}]*box-shadow:/s);
    });
});
