// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatActionIcon, renderActionIcon } from '../actionIcons';

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
    });

    it.each(['edit', 'more', 'copy-link', 'web-link'] as const)(
        'renders the selected Phosphor Bold %s icon',
        (icon) => {
            const vnode = renderActionIcon(icon);
            expect(vnode.sel).toContain('mu-action-icon-phosphor-bold');
            expect((vnode.children?.[0] as { data?: { attrs?: { viewBox?: string } } }).data?.attrs?.viewBox)
                .toBe('0 0 256 256');
        },
    );

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
        expect(sharedCss).toMatch(/stroke-width:\s*1\.65;/);
        expect(sharedCss).not.toContain('.mu-action-icon-delete svg');
    });
});
