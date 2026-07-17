import type Parent from '../../block/base/parent';
import type AtxHeading from '../../block/commonMark/atxHeading';
import type SetextHeading from '../../block/commonMark/setextHeading';
import type DiagramBlock from '../../block/extra/diagram';
import type { ActionIconName } from '../actionIcons';

const HEADING_ICONS: ActionIconName[] = [
    'heading-1',
    'heading-2',
    'heading-3',
    'heading-4',
    'heading-5',
    'heading-6',
];

const DIAGRAM_ICONS: Record<string, ActionIconName> = {
    'plantuml': 'plantuml',
    'mermaid': 'mermaid',
    'vega-lite': 'chart',
    'flowchart': 'flowchart',
    'sequence': 'sequence',
};

export function getIcon(block: Parent): ActionIconName {
    switch (block.blockName) {
        case 'frontmatter': return 'frontmatter';
        case 'paragraph': return 'paragraph';
        case 'block-quote': return 'quote';
        case 'highlight-block': return 'highlight';
        case 'bullet-list': return 'bullet-list';
        case 'order-list': return 'ordered-list';
        case 'task-list': return 'task-list';
        case 'code-block': return 'code';
        case 'atx-heading': return HEADING_ICONS[(block as AtxHeading).meta.level - 1];
        case 'setext-heading': return HEADING_ICONS[(block as SetextHeading).meta.level - 1];
        case 'thematic-break': return 'horizontal-line';
        case 'table': return 'table';
        case 'html-block': return 'html';
        case 'math-block': return 'math';
        case 'diagram': return DIAGRAM_ICONS[(block as DiagramBlock).meta.type] ?? 'chart';
        case 'footnote': return 'footnote';
        default: return 'paragraph';
    }
}
