import type { Muya } from '../muya';
import type {
    IBulletListState,
    IListItemState,
    IOrderListState,
    ITaskListItemState,
    ITaskListState,
    TState,
} from '../state/types';
import type Parent from './base/parent';
import { deepClone } from '../utils';
import { ScrollPage } from './scrollPage';
import { convertTextStatesToLabel } from './blockTransforms';

type TListState = IOrderListState | IBulletListState | ITaskListState;
type TListItemState = IListItemState | ITaskListItemState;

export function isListItemBlock(block: Parent): boolean {
    return block.blockName === 'list-item' || block.blockName === 'task-list-item';
}

export function listContainerForItem(block: Parent): Parent | null {
    if (!isListItemBlock(block))
        return null;
    const parent = block.parent;
    return parent && /^(?:order|bullet|task)-list$/.test(parent.blockName) ? parent : null;
}

export function listStateWithItems(source: TListState, items: TListItemState[]): TListState {
    if (source.name === 'task-list') {
        return {
            name: 'task-list',
            meta: { ...source.meta },
            children: items.map((item) => {
                if (item.name === 'task-list-item')
                    return deepClone(item);
                return { name: 'task-list-item', meta: { checked: false }, children: deepClone(item.children) };
            }),
        };
    }

    const children: IListItemState[] = items.map(item => ({
        name: 'list-item',
        children: deepClone(item.children),
    }));
    return source.name === 'order-list'
        ? { name: 'order-list', meta: { ...source.meta }, children }
        : { name: 'bullet-list', meta: { ...source.meta }, children };
}

function singleItemListState(
    label: 'order-list' | 'bullet-list' | 'task-list',
    item: TListItemState,
    source: TListState,
    muya: Muya,
): TListState {
    const children = deepClone(item.children);
    if (label === 'order-list') {
        return {
            name: 'order-list',
            meta: {
                start: 1,
                loose: source.meta.loose,
                delimiter: source.name === 'order-list' ? source.meta.delimiter : muya.options.orderListDelimiter,
            },
            children: [{ name: 'list-item', children }],
        };
    }
    if (label === 'task-list') {
        return {
            name: 'task-list',
            meta: {
                marker: source.name === 'order-list' ? muya.options.bulletListMarker : source.meta.marker,
                loose: source.meta.loose,
            },
            children: [{
                name: 'task-list-item',
                meta: { checked: item.name === 'task-list-item' && item.meta.checked },
                children,
            }],
        };
    }
    return {
        name: 'bullet-list',
        meta: {
            marker: source.name === 'order-list' ? muya.options.bulletListMarker : source.meta.marker,
            loose: source.meta.loose,
        },
        children: [{ name: 'list-item', children }],
    };
}

export function listItemReplacementStates(
    item: TListItemState,
    source: TListState,
    label: string,
    muya: Muya,
): TState[] {
    if (label === 'order-list' || label === 'bullet-list' || label === 'task-list')
        return [singleItemListState(label, item, source, muya)];
    if (label === 'block-quote')
        return [{ name: 'block-quote', children: deepClone(item.children) }];
    return convertTextStatesToLabel(deepClone(item.children), label, muya);
}

export function compatibleListStates(leftState: TState, rightState: TState): boolean {
    if (leftState.name !== rightState.name)
        return false;
    if (leftState.name === 'order-list' && rightState.name === 'order-list')
        return leftState.meta.delimiter === rightState.meta.delimiter;
    if (leftState.name === 'bullet-list' && rightState.name === 'bullet-list')
        return leftState.meta.marker === rightState.meta.marker;
    if (leftState.name === 'task-list' && rightState.name === 'task-list')
        return leftState.meta.marker === rightState.meta.marker;
    return false;
}

function compatibleLists(left: Parent | null, right: Parent | null): boolean {
    if (!left || !right || left.blockName !== right.blockName)
        return false;
    const leftState = left.getState();
    const rightState = right.getState();
    return compatibleListStates(leftState, rightState);
}

function mergePair(left: Parent, right: Parent): Parent {
    const parent = left.parent!;
    const leftState = left.getState() as TListState;
    const rightState = right.getState() as TListState;
    const mergedState = listStateWithItems(
        leftState,
        [...leftState.children, ...rightState.children],
    );
    const merged = ScrollPage.loadBlock(mergedState.name).create(left.muya, mergedState);
    parent.insertBefore(merged, left);
    left.remove();
    right.remove();
    return merged;
}

export function mergeAdjacentCompatibleLists(listBlock: Parent, itemOffset = 0): {
    list: Parent;
    item: Parent;
} {
    let list = listBlock;
    let offset = itemOffset;
    const previous = list.prev as Parent | null;
    if (compatibleLists(previous, list)) {
        offset += previous!.length();
        list = mergePair(previous!, list);
    }

    const next = list.next as Parent | null;
    if (compatibleLists(list, next))
        list = mergePair(list, next!);

    return { list, item: list.find(offset) as Parent };
}

export function convertListItem(itemBlock: Parent, label: string): Parent[] {
    const sourceList = listContainerForItem(itemBlock);
    if (!sourceList)
        return [];

    if (sourceList.blockName === label)
        return [itemBlock];

    const sourceState = sourceList.getState() as TListState;
    const itemIndex = sourceList.offset(itemBlock);
    const sourceItem = sourceState.children[itemIndex];
    if (!sourceItem)
        return [];

    const targetStates = listItemReplacementStates(sourceItem, sourceState, label, itemBlock.muya);
    const states: TState[] = [];
    if (itemIndex > 0)
        states.push(listStateWithItems(sourceState, sourceState.children.slice(0, itemIndex)));

    const targetStart = states.length;
    states.push(...targetStates);

    if (itemIndex < sourceState.children.length - 1)
        states.push(listStateWithItems(sourceState, sourceState.children.slice(itemIndex + 1)));

    const parent = sourceList.parent!;
    let reference: Parent = sourceList;
    const inserted: Parent[] = [];
    for (const state of states) {
        const block = ScrollPage.loadBlock(state.name).create(itemBlock.muya, state);
        parent.insertAfter(block, reference);
        reference = block;
        inserted.push(block);
    }
    sourceList.remove();

    const target = inserted[targetStart];
    if (/^(?:order|bullet|task)-list$/.test(target.blockName)) {
        const merged = mergeAdjacentCompatibleLists(target);
        return [merged.item];
    }
    return inserted.slice(targetStart, targetStart + targetStates.length);
}
