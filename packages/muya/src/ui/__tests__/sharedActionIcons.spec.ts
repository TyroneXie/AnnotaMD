// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTION_ICON_NAMES, createActionIconElement, formatActionIcon, renderActionIcon } from '../actionIcons';
import { getAllThemeNames, getIconDefinition, getIconTheme, getIconThemeConfig, setIconTheme } from '../iconThemes';

describe('shared menu action icons', () => {
    it.each([
        ['strong', 'strong'],
        ['del', 'strikethrough'],
        ['em', 'italic'],
        ['u', 'underline'],
        ['inline_code', 'inline-code'],
    ] as const)('maps %s to the same semantic icon in every toolbar', (format, icon) => {
        expect(formatActionIcon(format)).toBe(icon);
        expect(renderActionIcon(icon).sel).toContain(`mu-action-icon-${icon}`);
    });

    it.each([
        'color',
        'comment',
        'delete',
        'move-up',
        'move-down',
        'move-left',
        'move-right',
        'align-left',
        'align-center',
        'align-right',
        'reset-width',
        'edit',
        'more',
        'copy-link',
        'web-link',
        'inline-image',
        'insert-left',
        'insert-right',
    ] as const)('renders %s on the shared action-icon canvas', (icon) => {
        const vnode = renderActionIcon(icon);
        expect(vnode.sel).toContain(`span.mu-action-icon.mu-action-icon-${icon}`);
        const svg = vnode.children?.[0] as { data?: { attrs?: { viewBox?: string }; props?: { innerHTML?: string } } };
        expect(svg?.data?.attrs?.viewBox).toMatch(/^0 0 \d+ \d+$/);
        expect(svg?.data?.props?.innerHTML).toContain('<');
    });

    it('supports multiple icon themes', () => {
        const themes = getAllThemeNames();
        expect(themes).toContain('tabler');
        expect(themes).toContain('lucide');
        expect(themes).toContain('heroicons');
        expect(themes).toContain('feather');
        expect(themes).toContain('svg');
        expect(themes).toContain('phosphor');
        expect(themes).toContain('remix');
        expect(themes).toContain('material');
        expect(themes).toContain('hugeicons');
        expect(themes).toContain('mdi');
        expect(themes).toContain('bootstrap');
        expect(themes.length).toBe(11);
    });

    it('covers every menu icon in every theme', () => {
        for (const theme of getAllThemeNames()) {
            setIconTheme(theme);
            for (const icon of ACTION_ICON_NAMES) {
                expect(getIconDefinition(icon), `${theme} is missing ${icon}`).toBeTruthy();
                expect(renderActionIcon(icon).children?.[0]).toBeTruthy();
            }
        }
        setIconTheme('tabler');
    });

    it('uses each official library’s matched H1-H6 family instead of hand-drawn digits', () => {
        for (const theme of ['tabler', 'lucide', 'phosphor', 'remix', 'material', 'hugeicons', 'mdi', 'bootstrap'] as const) {
            setIconTheme(theme);
            const sources = Array.from({ length: 6 }, (_, index) => {
                const definition = getIconDefinition(`heading-${index + 1}`);
                return definition && !Array.isArray(definition) ? definition.source : null;
            });
            expect(sources.every(Boolean), `${theme} must use six official heading icons`).toBe(true);
            expect(new Set(sources).size).toBe(6);
        }
        setIconTheme('tabler');
    });

    it('uses the current theme for direct DOM toolbars too', () => {
        setIconTheme('phosphor');
        const icon = createActionIconElement('download');
        expect(icon.querySelector('svg')?.innerHTML).toContain('<');
        setIconTheme('tabler');
    });

    it('defaults to tabler theme', () => {
        setIconTheme('tabler');
        expect(getIconTheme()).toBe('tabler');
    });

    it('can switch icon theme', () => {
        setIconTheme('lucide');
        expect(getIconTheme()).toBe('lucide');
        const config = getIconThemeConfig();
        expect(config.strokeWidth).toBe(2);
        expect(config.strokeLinecap).toBe('round');

        setIconTheme('heroicons');
        expect(getIconTheme()).toBe('heroicons');
        expect(getIconThemeConfig().strokeWidth).toBe(1.5);

        setIconTheme('tabler');
        expect(getIconTheme()).toBe('tabler');
        expect(getIconThemeConfig().strokeWidth).toBe(1.5);
        expect(getIconThemeConfig().strokeLinecap).toBe('square');
    });

    it('keeps toolbar icon wrappers on the same eighteen-pixel visual scale', () => {
        const stylesheets = [
            'inlineFormatToolbar/index.css',
            'linkTools/index.css',
            'imageToolbar/index.css',
            'previewToolBar/index.css',
            'tableColumnToolbar/index.css',
        ].map(file => readFileSync(resolve(process.cwd(), 'src/ui', file), 'utf8'));
        for (const stylesheet of stylesheets)
            expect(stylesheet).toMatch(/icon-wrapper[^}]*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s);

        const sharedCss = readFileSync(resolve(process.cwd(), 'src/ui/actionIcons.css'), 'utf8');
        expect(sharedCss).not.toMatch(/\.mu-action-icon svg\s*\{[^}]*(?:fill|stroke):/s);
        expect(sharedCss).not.toContain('.mu-action-icon-delete svg');
    });
});
