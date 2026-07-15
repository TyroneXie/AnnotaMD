import type { ActionIconName } from '../actionIcons';

const icons = [
    {
        type: 'left',
        tooltip: 'Align Left',
        actionIcon: 'align-left' as ActionIconName,
    },
    {
        type: 'center',
        tooltip: 'Align Center',
        actionIcon: 'align-center' as ActionIconName,
    },
    {
        type: 'right',
        tooltip: 'Align Right',
        actionIcon: 'align-right' as ActionIconName,
    },
    {
        type: 'insert left',
        tooltip: 'Insert Column left',
        actionIcon: 'insert-left' as ActionIconName,
    },
    {
        type: 'insert right',
        tooltip: 'Insert Column right',
        actionIcon: 'insert-right' as ActionIconName,
    },
    {
        type: 'remove',
        tooltip: 'Remove Column',
        actionIcon: 'delete' as ActionIconName,
    },
];

export type TableColumnToolIcon = typeof icons[number];

export default icons;
