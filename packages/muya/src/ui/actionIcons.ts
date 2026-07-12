import type { VNode } from 'snabbdom';
import { h } from '../utils/snabbdom';

export type ActionIconName
    = 'text-style'
        | 'strong'
        | 'strikethrough'
        | 'italic'
        | 'underline'
        | 'inline-code'
        | 'color'
        | 'comment'
        | 'delete'
        | 'move-up'
        | 'move-down'
        | 'move-left'
        | 'move-right'
        | 'align-left'
        | 'align-center'
        | 'align-right'
        | 'reset-width'
        | 'edit'
        | 'inline-image';

const LABELS: Partial<Record<ActionIconName, string>> = {
    'text-style': 'T',
    'strong': 'B',
    'strikethrough': 'S',
    'italic': 'I',
    'underline': 'U',
    'inline-code': '</>',
    'color': 'A',
};

const PATHS: Partial<Record<ActionIconName, string[]>> = {
    'comment': [
        'M3.2 2.5h9.6a1.7 1.7 0 0 1 1.7 1.7v5.2a1.7 1.7 0 0 1-1.7 1.7H7l-3.5 2.4v-2.4h-.3a1.7 1.7 0 0 1-1.7-1.7V4.2a1.7 1.7 0 0 1 1.7-1.7Z',
        'M4.8 5.7h6.4M4.8 8.2h4.6',
    ],
    'delete': [
        'M2.7 4.5h10.6M4.4 6v6.1c0 1.2.7 1.9 1.9 1.9h3.4c1.2 0 1.9-.7 1.9-1.9V6M6.1 4.5V2.8h3.8v1.7',
    ],
    'move-up': ['M8 14V2.5M3.8 6.7 8 2.5l4.2 4.2'],
    'move-down': ['M8 2v11.5M3.8 9.3 8 13.5l4.2-4.2'],
    'move-left': ['M14 8H2.5M6.7 3.8 2.5 8l4.2 4.2'],
    'move-right': ['M2 8h11.5M9.3 3.8 13.5 8l-4.2 4.2'],
    'align-left': ['M2 3h12M2 7h7M2 11h12M2 15h8'],
    'align-center': ['M2 3h12M4.5 7h7M2 11h12M4 15h8'],
    'align-right': ['M2 3h12M7 7h7M2 11h12M6 15h8'],
    'reset-width': ['M2 8h12M5 5 2 8l3 3M11 5l3 3-3 3'],
    'edit': [
        'M3 11.8 2.5 14l2.2-.5 7.8-7.8-1.7-1.7L3 11.8ZM9.8 5l1.7 1.7M9.8 3l1.2-1.2a1.2 1.2 0 0 1 1.7 0l1.5 1.5a1.2 1.2 0 0 1 0 1.7L13 6.2',
    ],
    'inline-image': [
        'M2.5 3.5h11v9h-11zM4.3 10.5l2.4-2.6 1.8 1.8 1.4-1.4 1.8 2.2M5.4 6.2h.1',
    ],
};

export function formatActionIcon(format: string): ActionIconName | null {
    switch (format) {
        case 'strong': return 'strong';
        case 'del': return 'strikethrough';
        case 'em': return 'italic';
        case 'u': return 'underline';
        case 'inline_code': return 'inline-code';
        default: return null;
    }
}

export function renderActionIcon(icon: ActionIconName, label = LABELS[icon] ?? ''): VNode {
    const paths = PATHS[icon];
    const children = paths
        ? [h('svg', {
                attrs: {
                    'viewBox': '0 0 16 16',
                    'aria-hidden': 'true',
                },
            }, paths.map(path => h('path', { attrs: { d: path } })))]
        : label;

    return h(`span.mu-action-icon.mu-action-icon-${icon}`, children);
}
