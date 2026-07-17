import type Parent from '../../block/base/parent';
import type {
    IQuickInsertMenuItem,
} from '../paragraphQuickInsertMenu/config';
import { canTurnInto } from '../../block/blockTransforms';
import { isOsx } from '../../config';
import {
    MENU_CONFIG,
} from '../paragraphQuickInsertMenu/config';

const ALL_MENU_CONFIG = MENU_CONFIG.reduce(
    (acc, section) => [...acc, ...section.children],
    [] as IQuickInsertMenuItem['children'],
);

const COMMAND_KEY = isOsx ? '⌘' : '⌃';
const exceptBlocks = (...blockNames: string[]) => (block: Parent) => !blockNames.includes(block.blockName);
const isHeading = (block: Parent) => /^(?:atx|setext)-heading$/.test(block.blockName);
const exceptHeadings = (block: Parent) => !isHeading(block);

function headingLevel(block: Parent | null): number | null {
    if (!block || !isHeading(block))
        return null;
    return (block as Parent & { meta?: { level?: number } }).meta?.level ?? null;
}

function sectionHeadings(block: Parent): Parent[] {
    const level = headingLevel(block);
    if (level == null)
        return [];

    const headings = [block];
    let current = block.next as Parent | null;
    while (current) {
        const currentLevel = headingLevel(current);
        if (currentLevel != null && currentLevel <= level)
            break;
        if (currentLevel != null)
            headings.push(current);
        current = current.next as Parent | null;
    }
    return headings;
}

function hasPreviousPeerHeading(block: Parent): boolean {
    const level = headingLevel(block);
    let current = block.prev as Parent | null;
    while (current && level != null) {
        const currentLevel = headingLevel(current);
        if (currentLevel != null && currentLevel <= level)
            return currentLevel === level;
        current = current.prev as Parent | null;
    }
    return false;
}

function hasNextPeerHeading(block: Parent): boolean {
    const level = headingLevel(block);
    let current = block.next as Parent | null;
    while (current && level != null) {
        const currentLevel = headingLevel(current);
        if (currentLevel != null && currentLevel <= level)
            return currentLevel === level;
        current = current.next as Parent | null;
    }
    return false;
}

export const FRONT_MENU = [
    {
        label: 'copy-plain-text',
        text: 'Copy Plain Text',
        shortCut: '',
        group: 1,
        visible: exceptBlocks('thematic-break'),
    },
    {
        label: 'copy-markdown',
        text: 'Copy Markdown',
        shortCut: '',
        group: 1,
    },
    {
        label: 'copy-section',
        text: 'Copy Section',
        shortCut: '',
        group: 1,
        visible: (block: Parent) => /^(?:atx|setext)-heading$/.test(block.blockName),
    },
    {
        label: 'duplicate',
        text: 'Duplicate',
        shortCut: `⇧${COMMAND_KEY}P`,
        group: 1,
        visible: (block: Parent) => exceptBlocks('frontmatter')(block) && exceptHeadings(block),
    },
    {
        label: 'duplicate-section',
        text: 'Duplicate Section',
        shortCut: '',
        group: 1,
        visible: isHeading,
    },
    {
        label: 'cut',
        text: 'Cut Block',
        shortCut: '',
        group: 1,
        visible: exceptHeadings,
    },
    {
        label: 'cut-section',
        text: 'Cut Section',
        shortCut: '',
        group: 1,
        visible: isHeading,
    },
    {
        label: 'insert-before',
        text: 'Insert Above',
        shortCut: '',
        group: 2,
        visible: exceptBlocks('frontmatter'),
    },
    {
        label: 'insert-after',
        text: 'Insert Below',
        shortCut: `⇧${COMMAND_KEY}N`,
        group: 2,
    },
    {
        label: 'promote-section',
        text: 'Promote Section Headings',
        shortCut: '',
        group: 2,
        visible: isHeading,
        disabled: (block: Parent) => sectionHeadings(block).some(heading => headingLevel(heading) === 1),
    },
    {
        label: 'demote-section',
        text: 'Demote Section Headings',
        shortCut: '',
        group: 2,
        visible: isHeading,
        disabled: (block: Parent) => sectionHeadings(block).some(heading => headingLevel(heading) === 6),
    },
    {
        label: 'move-up',
        text: 'Move Up',
        shortCut: '',
        group: 3,
        visible: (block: Parent) => exceptBlocks('frontmatter')(block) && exceptHeadings(block),
        disabled: (block: Parent) => !block.prev,
    },
    {
        label: 'move-down',
        text: 'Move Down',
        shortCut: '',
        group: 3,
        visible: (block: Parent) => exceptBlocks('frontmatter')(block) && exceptHeadings(block),
        disabled: (block: Parent) => !block.next,
    },
    {
        label: 'move-section-up',
        text: 'Move Section Up',
        shortCut: '',
        group: 3,
        visible: isHeading,
        disabled: (block: Parent) => !hasPreviousPeerHeading(block),
    },
    {
        label: 'move-section-down',
        text: 'Move Section Down',
        shortCut: '',
        group: 3,
        visible: isHeading,
        disabled: (block: Parent) => !hasNextPeerHeading(block),
    },
    {
        label: 'comment',
        text: 'Comment',
        shortCut: '',
        group: 4,
        visible: exceptBlocks('frontmatter', 'thematic-break'),
    },
    {
        label: 'delete',
        text: 'Delete',
        shortCut: `⇧${COMMAND_KEY}D`,
        group: 4,
        visible: exceptHeadings,
    },
    {
        label: 'delete-section',
        text: 'Delete Section',
        shortCut: '',
        group: 4,
        visible: isHeading,
    },
];

export type FrontMenuIcon = (typeof FRONT_MENU)[number];

export function canTurnIntoMenu(block: Parent) {
    return ALL_MENU_CONFIG.filter(item => item.label !== 'emoji-picker' && canTurnInto(block, item.label));
}
