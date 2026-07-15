import type { ActionIconName } from '../actionIcons';

interface LinkToolIconConfig {
    type: 'edit' | 'unlink';
    actionIcon: ActionIconName;
    tooltip: string;
}

const icons: LinkToolIconConfig[] = [
    {
        type: 'edit',
        actionIcon: 'edit',
        tooltip: 'Edit Link',
    },
    {
        type: 'unlink',
        actionIcon: 'unlink',
        tooltip: 'Remove Link',
    },
];

export default icons;
