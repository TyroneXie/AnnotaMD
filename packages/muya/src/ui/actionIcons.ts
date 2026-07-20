import type { VNode } from 'snabbdom';
import { h } from '../utils/snabbdom';
import { getIconDefinition, getIconThemeConfig } from './iconThemes';

export const ACTION_ICON_NAMES = [
    'text-style', 'strong', 'strikethrough', 'italic', 'underline',
    'link', 'unlink', 'inline-code', 'color', 'comment', 'delete',
    'move-up', 'move-down', 'move-left', 'move-right',
    'insert-left', 'insert-right', 'insert-above', 'insert-below',
    'align-left', 'align-center', 'align-right', 'reset-width',
    'edit', 'more', 'copy-link', 'web-link', 'inline-image',
    'copy', 'wrap', 'heading-link', 'diagram-view', 'fullscreen',
    'palette', 'download', 'link-view', 'title-view',
    'paragraph', 'horizontal-line', 'frontmatter',
    'heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5', 'heading-6',
    'table', 'math', 'html', 'code', 'quote', 'highlight', 'emoji',
    'ordered-list', 'bullet-list', 'task-list', 'chart', 'mermaid',
    'plantuml', 'flowchart', 'sequence', 'footnote',
    'copy-plain-text', 'copy-markdown', 'duplicate', 'cut', 'promote', 'demote',
    'heading-number-continue', 'heading-number-restart', 'heading-number-set',
] as const;

export type ActionIconName = typeof ACTION_ICON_NAMES[number];

export function formatActionIcon(format: string): ActionIconName | null {
    switch (format) {
        case 'strong': return 'strong';
        case 'del': return 'strikethrough';
        case 'em': return 'italic';
        case 'u': return 'underline';
        case 'link': return 'link';
        case 'inline_code': return 'inline-code';
        default: return null;
    }
}

export function renderActionIcon(icon: ActionIconName): VNode {
    const config = getIconThemeConfig();
    const definition = getIconDefinition(icon);

    if (!definition) {
        // Fallback: render icon name as text if not found
        return h(`span.mu-action-icon.mu-action-icon-${icon}`, icon);
    }

    const svg = Array.isArray(definition)
        ? h('svg', {
                attrs: {
                    'viewBox': config.viewBox,
                    'aria-hidden': 'true',
                    'fill': 'none',
                    'stroke': 'currentColor',
                    'stroke-width': config.strokeWidth,
                    'stroke-linecap': config.strokeLinecap,
                    'stroke-linejoin': config.strokeLinejoin,
                },
            }, definition.map(d => h('path', { attrs: { d } })))
        : h('svg', {
                attrs: {
                    'viewBox': definition.viewBox,
                    'aria-hidden': 'true',
                },
                props: { innerHTML: definition.body },
            });

    return h(
        `span.mu-action-icon.mu-action-icon-${icon}`,
        svg,
    );
}

export function createActionIconElement(icon: ActionIconName): HTMLSpanElement {
    const config = getIconThemeConfig();
    const definition = getIconDefinition(icon);
    const wrapper = document.createElement('span');
    wrapper.className = `mu-action-icon mu-action-icon-${icon}`;
    if (!definition)
        return wrapper;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', Array.isArray(definition) ? config.viewBox : definition.viewBox);
    svg.setAttribute('aria-hidden', 'true');
    if (Array.isArray(definition)) {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', `${config.strokeWidth}`);
        svg.setAttribute('stroke-linecap', config.strokeLinecap);
        svg.setAttribute('stroke-linejoin', config.strokeLinejoin);
        definition.forEach((d) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        });
    } else {
        svg.innerHTML = definition.body;
    }
    wrapper.appendChild(svg);
    return wrapper;
}
