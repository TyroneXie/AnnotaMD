import type { VNode } from 'snabbdom';
import { h } from '../utils/snabbdom';

export type ActionIconName
    = 'text-style'
        | 'strong'
        | 'strikethrough'
        | 'italic'
        | 'underline'
        | 'link'
        | 'unlink'
        | 'inline-code'
        | 'color'
        | 'comment'
        | 'delete'
        | 'move-up'
        | 'move-down'
        | 'move-left'
        | 'move-right'
        | 'insert-left'
        | 'insert-right'
        | 'align-left'
        | 'align-center'
        | 'align-right'
        | 'reset-width'
        | 'edit'
        | 'more'
        | 'copy-link'
        | 'web-link'
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
    'link': [
        'M6 4.8H4a3.2 3.2 0 0 0 0 6.4h2',
        'M10 4.8h2a3.2 3.2 0 0 1 0 6.4h-2',
        'M5.2 8h5.6',
    ],
    'unlink': [
        'M6 4.8H4a3.2 3.2 0 0 0 0 6.4h2',
        'M10 4.8h2a3.2 3.2 0 0 1 0 6.4h-2',
        'M2.2 2.2 13.8 13.8',
    ],
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
    'insert-left': ['M3 2.5v11M7 8h6M10 5l3 3-3 3'],
    'insert-right': ['M13 2.5v11M3 8h6M6 5l3 3-3 3'],
    'align-left': ['M2 3h12M2 7h7M2 11h12M2 15h8'],
    'align-center': ['M2 3h12M4.5 7h7M2 11h12M4 15h8'],
    'align-right': ['M2 3h12M7 7h7M2 11h12M6 15h8'],
    'reset-width': ['M2 8h12M5 5 2 8l3 3M11 5l3 3-3 3'],
    'inline-image': [
        'M2.5 3.5h11v9h-11zM4.3 10.5l2.4-2.6 1.8 1.8 1.4-1.4 1.8 2.2M5.4 6.2h.1',
    ],
};

const PHOSPHOR_BOLD_PATHS: Partial<Record<ActionIconName, string>> = {
    'edit': 'M230.15,70.54,185.46,25.86a20,20,0,0,0-28.28,0L33.86,149.17A19.86,19.86,0,0,0,28,163.31V208a20,20,0,0,0,20,20H216a12,12,0,0,0,0-24H125L230.15,98.83A20,20,0,0,0,230.15,70.54ZM91,204H52V165l84-84,39,39ZM192,103,153,64l18.34-18.34,39,39Z',
    'more': 'M100,36H56A20,20,0,0,0,36,56v44a20,20,0,0,0,20,20h44a20,20,0,0,0,20-20V56A20,20,0,0,0,100,36ZM96,96H60V60H96ZM200,36H156a20,20,0,0,0-20,20v44a20,20,0,0,0,20,20h44a20,20,0,0,0,20-20V56A20,20,0,0,0,200,36Zm-4,60H160V60h36Zm-96,40H56a20,20,0,0,0-20,20v44a20,20,0,0,0,20,20h44a20,20,0,0,0,20-20V156A20,20,0,0,0,100,136Zm-4,60H60V160H96Zm104-60H156a20,20,0,0,0-20,20v44a20,20,0,0,0,20,20h44a20,20,0,0,0,20-20V156A20,20,0,0,0,200,136Zm-4,60H160V160h36Z',
    'copy-link': 'M80,116h96a12,12,0,0,1,0,24H80a12,12,0,0,1,0-24Zm24,48H64a36,36,0,0,1,0-72h40a12,12,0,0,0,0-24H64a60,60,0,0,0,0,120h40a12,12,0,0,0,0-24Zm88-96H152a12,12,0,0,0,0,24h40a36,36,0,0,1,0,72H152a12,12,0,0,0,0,24h40a60,60,0,0,0,0-120Z',
    'web-link': 'M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm83.13,96H179.56a144.3,144.3,0,0,0-21.35-66.36A84.22,84.22,0,0,1,211.13,116ZM128,207c-9.36-10.81-24.46-33.13-27.45-67h54.94a119.74,119.74,0,0,1-17.11,52.77A108.61,108.61,0,0,1,128,207Zm-27.45-91a119.74,119.74,0,0,1,17.11-52.77A108.61,108.61,0,0,1,128,49c9.36,10.81,24.46,33.13,27.45,67ZM97.79,49.64A144.3,144.3,0,0,0,76.44,116H44.87A84.22,84.22,0,0,1,97.79,49.64ZM44.87,140H76.44a144.3,144.3,0,0,0,21.35,66.36A84.22,84.22,0,0,1,44.87,140Zm113.34,66.36A144.3,144.3,0,0,0,179.56,140h31.57A84.22,84.22,0,0,1,158.21,206.36Z',
};

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

export function renderActionIcon(icon: ActionIconName, label = LABELS[icon] ?? ''): VNode {
    const phosphorPath = PHOSPHOR_BOLD_PATHS[icon];
    if (phosphorPath) {
        return h(
            `span.mu-action-icon.mu-action-icon-${icon}.mu-action-icon-phosphor-bold`,
            h('svg', {
                attrs: {
                    'viewBox': '0 0 256 256',
                    'aria-hidden': 'true',
                },
            }, h('path', { attrs: { d: phosphorPath } })),
        );
    }

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
