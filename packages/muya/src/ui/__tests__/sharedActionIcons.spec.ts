// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
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
        'inline-image',
    ] as const)('renders %s on the shared sixteen-pixel icon canvas', (icon) => {
        const vnode = renderActionIcon(icon);
        expect(vnode.sel).toBe(`span.mu-action-icon.mu-action-icon-${icon}`);
    });
});
