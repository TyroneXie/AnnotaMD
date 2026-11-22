import type { ActionIconName } from '../actionIcons';

interface ILinkToolIconConfig {
    type: 'edit' | 'unlink';
    actionIcon: ActionIconName;
    tooltip: string;
}

const icons: ILinkToolIconConfig[] = [
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
