export type TableAxisTarget = 'row' | 'column' | 'cells';
export type TableAxisFormat = 'strong' | 'del' | 'em' | 'u' | 'inline_code';
export type TableAxisAction =
    | 'insert'
    | 'remove'
    | 'move'
    | 'align'
    | 'reset-width'
    | 'format'
    | 'palette'
    | 'comment';

export interface MenuItem {
    label: string;
    action: TableAxisAction;
    target: TableAxisTarget;
    location?: 'previous' | 'next' | 'left' | 'right';
    value?: 'left' | 'center' | 'right';
    format?: TableAxisFormat;
    symbol: string;
    group: number;
}

const formatTools = (target: TableAxisTarget, group: number): MenuItem[] => [
    { label: 'Emphasize', action: 'format', target, format: 'strong', symbol: 'B', group },
    { label: 'Strikethrough', action: 'format', target, format: 'del', symbol: 'S', group },
    { label: 'Italic', action: 'format', target, format: 'em', symbol: 'I', group },
    { label: 'Underline', action: 'format', target, format: 'u', symbol: 'U', group },
    { label: 'Inline Code', action: 'format', target, format: 'inline_code', symbol: '</>', group },
    { label: 'Font Color', action: 'palette', target, symbol: 'A', group },
];

export const toolList: Record<'right' | 'bottom' | 'rect', MenuItem[]> = {
    right: [
        ...formatTools('row', 1),
        { label: 'Move Row Up', action: 'move', location: 'previous', target: 'row', symbol: '↑', group: 2 },
        { label: 'Move Row Down', action: 'move', location: 'next', target: 'row', symbol: '↓', group: 2 },
        { label: 'Comment', action: 'comment', target: 'row', symbol: '', group: 3 },
        { label: 'Remove Row', action: 'remove', target: 'row', symbol: '⌫', group: 3 },
    ],
    bottom: [
        { label: 'Align Left', action: 'align', value: 'left', target: 'column', symbol: '≡', group: 1 },
        { label: 'Align Center', action: 'align', value: 'center', target: 'column', symbol: '≡', group: 1 },
        { label: 'Align Right', action: 'align', value: 'right', target: 'column', symbol: '≡', group: 1 },
        ...formatTools('column', 2),
        { label: 'Move Column Left', action: 'move', location: 'left', target: 'column', symbol: '←', group: 3 },
        { label: 'Move Column Right', action: 'move', location: 'right', target: 'column', symbol: '→', group: 3 },
        { label: 'Reset Column Width', action: 'reset-width', target: 'column', symbol: '↔', group: 4 },
        { label: 'Comment', action: 'comment', target: 'column', symbol: '', group: 5 },
        { label: 'Remove Column', action: 'remove', target: 'column', symbol: '⌫', group: 5 },
    ],
    rect: [
        ...formatTools('cells', 1),
        { label: 'Comment', action: 'comment', target: 'cells', symbol: '', group: 2 },
    ],
};
