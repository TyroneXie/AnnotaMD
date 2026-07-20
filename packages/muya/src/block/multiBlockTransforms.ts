import type { Muya } from '../muya';
import type { TState } from '../state/types';
import type Content from './base/content';
import type Parent from './base/parent';
import { isAnyListState } from '../state/types';
import { convertTextContainerState, convertTextStatesToLabel, isTextBlockTarget } from './blockTransforms';
import {
    compatibleListStates,
    isListItemBlock,
    listItemReplacementStates,
    listStateWithItems,
} from './listItemTransforms';

function targetForContent(content: Content): Parent | null {
    let block = content.parent;
    let textTarget: Parent | null = null;
    while (block && !block.isScrollPage) {
        if (isListItemBlock(block))
            return block;
        if (block.blockName === 'block-quote')
            return block;
        if (isTextBlockTarget(block))
            textTarget = block;
        block = block.parent;
    }
    return textTarget;
}

function contentRange(muya: Muya): Content[] {
    const result: Content[] = [];
    let content = muya.editor.scrollPage?.firstContentInDescendant() ?? null;
    while (content) {
        result.push(content);
        content = content.nextContentInContext() ?? null;
    }
    return result;
}

export function collectSelectedTextTargets(muya: Muya): Parent[] {
    const { anchorBlock, focusBlock, isSelectionInSameBlock } = muya.editor.selection;
    if (!anchorBlock || !focusBlock || isSelectionInSameBlock)
        return [];

    const contents = contentRange(muya);
    const anchorIndex = contents.indexOf(anchorBlock);
    const focusIndex = contents.indexOf(focusBlock);
    if (anchorIndex < 0 || focusIndex < 0)
        return [];

    const start = Math.min(anchorIndex, focusIndex);
    const end = Math.max(anchorIndex, focusIndex);
    const targets: Parent[] = [];
    const seen = new Set<Parent>();
    for (const content of contents.slice(start, end + 1)) {
        const target = targetForContent(content);
        if (!target)
            return [];
        if (!seen.has(target)) {
            seen.add(target);
            targets.push(target);
        }
    }
    return targets.length > 1 ? targets : [];
}

export function hasUnsupportedCrossBlockSelection(muya: Muya): boolean {
    const { anchorBlock, focusBlock } = muya.editor.selection;
    if (!anchorBlock || !focusBlock || anchorBlock === focusBlock)
        return false;

    const contents = contentRange(muya);
    const anchorIndex = contents.indexOf(anchorBlock);
    const focusIndex = contents.indexOf(focusBlock);
    if (anchorIndex < 0 || focusIndex < 0)
        return false;

    const start = Math.min(anchorIndex, focusIndex);
    const end = Math.max(anchorIndex, focusIndex);
    return contents.slice(start, end + 1).some(content => !targetForContent(content));
}

function mergeCompatibleStateLists(states: TState[]): TState[] {
    const result: TState[] = [];
    for (const state of states) {
        const previous = result[result.length - 1];
        if (previous && compatibleListStates(previous, state) && isAnyListState(previous) && isAnyListState(state)) {
            result[result.length - 1] = listStateWithItems(
                previous,
                [...previous.children, ...state.children],
            );
        }
        else {
            result.push(state);
        }
    }
    return result;
}

function mergeAdjacentHighlights(states: TState[]): TState[] {
    const result: TState[] = [];
    for (const state of states) {
        const previous = result[result.length - 1];
        if (previous?.name === 'highlight-block' && state.name === 'highlight-block') {
            previous.children.push(...state.children);
        }
        else {
            result.push(state);
        }
    }
    return result;
}

function convertTopLevelState(block: Parent, selected: Set<Parent>, label: string, muya: Muya): TState[] {
    const state = block.getState();
    if (selected.has(block)) {
        if (isAnyListState(state) || state.name === 'block-quote')
            return convertTextContainerState(state, label, muya);
        return convertTextStatesToLabel([state], label, muya);
    }

    if (isAnyListState(state)) {
        const replacements: TState[] = [];
        block.children.forEach((itemBlock, index) => {
            const itemState = state.children[index];
            if (!itemState)
                return;
            if (selected.has(itemBlock as Parent))
                replacements.push(...listItemReplacementStates(itemState, state, label, muya));
            else replacements.push(listStateWithItems(state, [itemState]));
        });
        return mergeCompatibleStateLists(replacements);
    }

    return [state];
}

function semanticText(text: string): string {
    return text.replace(/^ {0,3}#{1,6}(?:\s+|$)/, '');
}

function restoreConvertedSelection(muya: Muya, firstText: string, lastText: string): Parent | null {
    const contents = contentRange(muya);
    const firstIndex = contents.findIndex(content => semanticText(content.text) === firstText);
    if (firstIndex < 0)
        return null;
    let lastIndex = -1;
    for (let index = contents.length - 1; index >= firstIndex; index--) {
        if (semanticText(contents[index].text) === lastText) {
            lastIndex = index;
            break;
        }
    }
    if (lastIndex < 0)
        return null;

    const first = contents[firstIndex];
    const last = contents[lastIndex];
    muya.editor.selection.setSelection(
        { offset: 0, block: first, path: first.path },
        { offset: last.text.length, block: last, path: last.path },
    );
    return targetForContent(first);
}

export function convertSelectedTextTargets(muya: Muya, targets: Parent[], label: string): Parent | null {
    if (targets.length < 2)
        return null;

    const firstText = semanticText(targets[0].firstContentInDescendant()?.text ?? '');
    const lastText = semanticText(targets[targets.length - 1].lastContentInDescendant()?.text ?? '');
    const selected = new Set(targets);
    const nextState: TState[] = [];
    muya.editor.scrollPage!.children.forEach((block) => {
        nextState.push(...convertTopLevelState(block as Parent, selected, label, muya));
    });

    const convertedState = mergeCompatibleStateLists(
        label === 'highlight-block' ? mergeAdjacentHighlights(nextState) : nextState,
    );
    if (!muya.replaceContent(convertedState))
        return targets[0];
    return restoreConvertedSelection(muya, firstText, lastText);
}
