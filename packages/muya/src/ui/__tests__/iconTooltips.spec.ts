import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
    return readFileSync(
        fileURLToPath(new URL(relativePath, import.meta.url)),
        'utf8',
    );
}

describe('icon-only block control tooltips', () => {
    it.each([
        '../paragraphFrontMenu/index.ts',
        '../imageToolbar/index.ts',
        '../tableColumnToolbar/index.ts',
        '../previewToolBar/index.ts',
        '../../block/commonMark/headingCopyLink/index.ts',
    ])('%s uses accessible custom tooltips instead of delayed native titles', (file) => {
        const source = read(file);
        expect(source).toContain('data-tooltip');
        expect(source).toContain('aria-label');
        expect(source).not.toMatch(/(?:attrs|props):\s*\{\s*title:/);
        expect(source).not.toMatch(/setAttribute\(['"]title/);
    });

    it('uses the shared black tooltip with near-immediate feedback', () => {
        const css = read('../tooltip/index.css');
        expect(css).toMatch(/\.mu-icon-tooltip::after\s*\{[^}]*color:\s*#fff;[^}]*background:\s*#1f2329;/);
        expect(css).toContain('transition: opacity 50ms linear, transform 50ms linear');
    });

    it.each([
        '../inlineFormatToolbar/index.ts',
        '../tableRowColumMenu/index.ts',
        '../paragraphFrontMenu/index.ts',
        '../imageToolbar/index.ts',
        '../previewToolBar/index.ts',
    ])('%s renders common actions through the shared icon component', (file) => {
        expect(read(file)).toContain('renderActionIcon');
    });

    it('portals block-type tooltips outside the clipped dropdown', () => {
        const source = read('../paragraphFrontMenu/index.ts');
        const css = read('../paragraphFrontMenu/index.css');
        expect(source).toContain('document.body.appendChild(tooltip)');
        expect(source).toContain('tooltip.className = \'mu-front-menu-type-tooltip\'');
        expect(css).toMatch(/\.mu-front-menu-type-tooltip\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*2147483000;/);
    });

    it('uses a balanced outlined quote icon for quote blocks', () => {
        const source = read('../paragraphFrontButton/index.ts');
        const css = read('../paragraphFrontButton/index.css');
        const quoteRenderer = source.slice(
            source.indexOf('function renderQuoteIcon()'),
            source.indexOf('function renderImageIcon()'),
        );
        expect(source).toContain('svg.mu-block-label-glyph.mu-quote-icon');
        expect(quoteRenderer.match(/stroke: 'currentColor'/g)).toHaveLength(1);
        expect(source).toContain('if (kind === \'quote\')');
        expect(css).toMatch(/\.mu-block-label\.quote \.mu-block-label-glyph\s*\{[^}]*color:\s*#3370ff;/);
    });

    it.each([
        '../inlineFormatToolbar/index.css',
        '../tableRowColumMenu/index.css',
        '../imageToolbar/index.css',
        '../previewToolBar/index.css',
    ])('%s uses the shared toolbar surface and 32px controls', (file) => {
        const css = read(file);
        expect(css).toContain('border: 1px solid #dee0e3');
        expect(css).toContain('border-radius: 8px');
        expect(css).toMatch(/width:\s*32px;[\s\S]*height:\s*32px;/);
        expect(css).toContain('background: #f2f3f5');
    });
});
