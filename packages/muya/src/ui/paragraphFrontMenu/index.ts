import type { VNode } from 'snabbdom';
import type Content from '../../block/base/content';
import type Parent from '../../block/base/parent';
import type AtxHeading from '../../block/commonMark/atxHeading';
import type { Muya } from '../../index';
import type {
    IBulletListState,
    IOrderListState,
    ITaskListState,
    TState,
} from '../../state/types';
import type { IQuickInsertMenuItem } from '../paragraphQuickInsertMenu/config';
import type { ActionIconName } from '../actionIcons';
import { replaceBlockByLabel, replaceTextContainerByLabel } from '../../block/blockTransforms';
import { convertListItem, isListItemBlock, mergeAdjacentCompatibleLists } from '../../block/listItemTransforms';
import { collectSelectedTextTargets, convertSelectedTextTargets } from '../../block/multiBlockTransforms';
import { ScrollPage } from '../../block/scrollPage';
import emptyStates from '../../config/emptyStates';
import { tokenizer, tokensToPlainText } from '../../inlineRenderer/lexer';

import { isAnyListState, isAtxHeadingState } from '../../state/types';
import { deepClone, isHTMLElement } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import { renderActionIcon } from '../actionIcons';
import BaseFloat from '../baseFloat';
import { canTurnIntoMenu, FRONT_MENU } from './config';
import '../actionIcons.css';
import '../tooltip/index.css';
import './index.css';

function renderQuoteTurnIntoIcon() {
    const pathAttrs = {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.7',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    };

    return h(
        'i.icon.mu-quote-turn-into-icon',
        h(
            'svg',
            {
                attrs: {
                    viewBox: '0 0 20 20',
                    'aria-hidden': 'true',
                },
            },
            [
                h('path', { attrs: { ...pathAttrs, d: 'M4.5 5.5h3v4.2c0 2.4-1.1 3.8-3.4 4.8' } }),
                h('path', { attrs: { ...pathAttrs, d: 'M11.5 5.5h3v4.2c0 2.4-1.1 3.8-3.4 4.8' } }),
            ],
        ),
    );
}

function renderIcon({ label, icon }: { label: string; icon: string }) {
    if (label === 'block-quote')
        return renderQuoteTurnIntoIcon();
    if (label === 'highlight-block')
        return h('i.icon.mu-highlight-turn-into-icon', '✦');

    return h(
        'i.icon',
        h(
            `i.icon-${label.replace(/\s/g, '-')}`,
            {
                style: {
                    'background': `url(${icon}) no-repeat`,
                    'background-size': '100%',
                },
            },
            '',
        ),
    );
}

function renderMenuIcon({ label, icon }: { label: string; icon?: string }) {
    if (icon)
        return renderIcon({ label, icon });

    const sharedActions: Partial<Record<string, ActionIconName>> = {
        'comment': 'comment',
        'delete': 'delete',
        'delete-section': 'delete',
        'move-up': 'move-up',
        'move-section-up': 'move-up',
        'move-down': 'move-down',
        'move-section-down': 'move-down',
    };
    const actionIcon = sharedActions[label];
    return actionIcon
        ? renderActionIcon(actionIcon)
        : h(`span.menu-symbol.${label}`);
}

const META_ACTIONS = new Set([
    'copy-plain-text',
    'copy-markdown',
    'copy-section',
    'duplicate',
    'duplicate-section',
    'cut',
    'cut-section',
    'insert-before',
    'insert-after',
    'promote-section',
    'demote-section',
    'move-up',
    'move-down',
    'move-section-up',
    'move-section-down',
    'comment',
    'delete',
    'delete-section',
]);

const defaultOptions = {
    placement: 'bottom' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

export class ParagraphFrontMenu extends BaseFloat {
    static pluginName = 'frontMenu';
    public override capturesContentKeydown = true;
    private _oldVNode: VNode | null = null;
    private _block: Parent | null = null;
    private _frontMenuContainer: HTMLDivElement = document.createElement('div');
    private _collapsedSections = new WeakMap<Parent, Map<Parent, boolean>>();
    private _pendingSectionDelete: Parent | null = null;
    private _headingObserver: MutationObserver | null = null;
    private _typeTooltip: HTMLDivElement | null = null;
    private _conversionLocked = false;
    private _convertedBlock: Parent | null = null;

    constructor(muya: Muya, options = {}) {
        const name = 'mu-front-menu';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        const parent = this.container!.parentNode;
        if (isHTMLElement(parent)) {
            Object.assign(parent.style, {
                overflow: 'visible',
            });
        }
        this.container!.appendChild(this._frontMenuContainer);
        this.listen();
        this._syncHeadingDisclosures();

        const scrollPage = this.muya.editor.scrollPage?.domNode;
        if (scrollPage) {
            this._headingObserver = new MutationObserver(() => this._syncHeadingDisclosures());
            this._headingObserver.observe(scrollPage, { childList: true });
        }
    }

    override listen() {
        const { container } = this;
        const { eventCenter } = this.muya;
        super.listen();

        eventCenter.subscribe('muya-front-menu', ({ reference, block }) => {
            if (reference) {
                this._block = block;

                setTimeout(() => {
                    // Render first so Floating UI measures the real menu size
                    // on its initial positioning pass. Showing an empty 2px
                    // shell and filling it afterwards caused a visible jump,
                    // a second layout pass, and sluggish hover feedback.
                    this.render();
                    if (this.floatBox && this.container) {
                        Object.assign(this.floatBox.style, {
                            width: `${this.container.offsetWidth}px`,
                            height: `${this.container.offsetHeight}px`,
                        });
                    }
                    this.show(reference);
                }, 0);
            }
        });

        const enterLeaveHandler = () => {
            this._hideTypeTooltip();
            this.hide();
            this._block = null;
            this._pendingSectionDelete = null;
        };

        eventCenter.attachDOMEvent(container!, 'mouseleave', enterLeaveHandler);
    }

    private _renderSubMenu(subMenu: IQuickInsertMenuItem['children']) {
        const { _block: block } = this;
        const { i18n } = this.muya;
        const children = subMenu.map((menuItem) => {
            const { title, label } = menuItem;
            const tooltip = i18n.t(title);
            const iconWrapperSelector = 'div.icon-wrapper';
            const iconWrapper = h(
                iconWrapperSelector,
                {
                    attrs: {
                        'aria-label': tooltip,
                        'data-tooltip': tooltip,
                    },
                    on: {
                        mouseenter: event => this._showTypeTooltip(event, tooltip),
                        mouseleave: () => this._hideTypeTooltip(),
                    },
                },
                renderIcon(menuItem),
            );

            let itemSelector = `div.turn-into-item.${label}`;
            const activeBlockName = isListItemBlock(block!) ? block?.parent?.blockName : block?.blockName;
            if (activeBlockName === 'atx-heading') {
                if (
                    label.startsWith(activeBlockName)
                    && label.endsWith(String((block as AtxHeading).meta.level))
                ) {
                    itemSelector += '.active';
                }
            }
            else if (label === activeBlockName) {
                itemSelector += '.active';
            }

            return h(
                itemSelector,
                {
                    on: {
                        click: (event) => {
                            this.selectItem(event, { label });
                        },
                    },
                },
                [iconWrapper],
            );
        });
        const subMenuSelector = 'li.turn-into-menu';

        return h(subMenuSelector, children);
    }

    private _showTypeTooltip(event: Event, text: string): void {
        this._hideTypeTooltip();
        if (!(event.currentTarget instanceof HTMLElement))
            return;

        const tooltip = document.createElement('div');
        tooltip.className = 'mu-front-menu-type-tooltip';
        tooltip.textContent = text;
        document.body.appendChild(tooltip);

        const rect = event.currentTarget.getBoundingClientRect();
        const left = Math.min(
            window.innerWidth - tooltip.offsetWidth - 8,
            Math.max(8, rect.left + rect.width / 2 - tooltip.offsetWidth / 2),
        );
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${rect.bottom + 6}px`;
        this._typeTooltip = tooltip;
    }

    private _hideTypeTooltip(): void {
        this._typeTooltip?.remove();
        this._typeTooltip = null;
    }

    render() {
        const { _oldVNode: oldVNode, _frontMenuContainer: frontMenuContainer, _block: block } = this;
        const { i18n } = this.muya;
        let previousGroup: number | null = null;
        const children: VNode[] = [];
        FRONT_MENU.forEach((menuItem) => {
            const { label, text, shortCut, group, disabled, visible } = menuItem;
            const icon = 'icon' in menuItem && typeof menuItem.icon === 'string'
                ? menuItem.icon
                : undefined;
            if (visible && !visible(block!))
                return;
            if (previousGroup !== null && previousGroup !== group)
                children.push(h('li.divider'));
            previousGroup = group;

            const isDisabled = disabled?.(block!) ?? false;
            const iconWrapperSelector = 'div.icon-wrapper';
            const iconWrapper = h(iconWrapperSelector, renderMenuIcon({ icon, label }));
            const actionText = label === 'delete-section' && this._pendingSectionDelete === block
                ? 'Confirm Delete Section'
                : text;
            const textWrapper = h('span.text', i18n.t(actionText));
            const shortCutWrapper = shortCut
                ? h('div.short-cut', [h('span', shortCut)])
                : null;
            const isConfirmingDelete = label === 'delete-section' && this._pendingSectionDelete === block;
            const itemSelector = `li.item.${label}${isDisabled ? '.disabled' : ''}${isConfirmingDelete ? '.confirming' : ''}`;
            const itemChildren = [iconWrapper, textWrapper, shortCutWrapper];

            children.push(h(
                itemSelector,
                {
                    attrs: {
                        'aria-disabled': String(isDisabled),
                    },
                    on: {
                        click: (event) => {
                            if (isDisabled)
                                return;
                            this.selectItem(event, { label });
                        },
                    },
                },
                itemChildren,
            ));
        });

        const subMenu = canTurnIntoMenu(block!);
        if (subMenu.length) {
            const line = h('li.divider');
            children.unshift(line);
            children.unshift(this._renderSubMenu(subMenu));
        }

        const vnode = h('ul', children);

        if (oldVNode)
            patch(oldVNode, vnode);
        else patch(frontMenuContainer, vnode);

        this._oldVNode = vnode;
    }

    selectItem(event: Event, { label }: { label: string }) {
        event.preventDefault();
        event.stopPropagation();
        this._hideTypeTooltip();

        const isMetaAction = META_ACTIONS.has(label);
        if (!isMetaAction && this._conversionLocked)
            return;

        // A single menu open performs at most one action: consume the target
        // synchronously, then bail unless it is still in the document. This
        // covers both a rapid second click (a real double-click before the
        // deferred hide()) and an external command — e.g. the app menu bar —
        // that unwrapped the block while this menu stayed open. Every action
        // below assumes `block.parent` (#4686).
        const block = this._block;
        if (!block?.parent)
            return;

        if (label === 'delete-section' && this._pendingSectionDelete !== block) {
            this._pendingSectionDelete = block;
            this.render();
            return;
        }

        this._pendingSectionDelete = null;

        const oldState = block.getState();
        const parent = block.parent;
        const previous = block.prev as Parent | null;
        this._convertedBlock = null;

        if (isMetaAction)
            this._block = null;

        const selectedTargets = isMetaAction ? [] : collectSelectedTextTargets(this.muya);
        const isBatchConversion = selectedTargets.length > 1 && selectedTargets.includes(block);
        const cursorBlock = isMetaAction
            ? this._applyMetaAction(label, block, oldState)
            : isBatchConversion
                ? null
                : this._turnIntoBlock(label, block, oldState);
        if (isBatchConversion)
            this._convertedBlock = convertSelectedTextTargets(this.muya, selectedTargets, label);

        if (cursorBlock) {
            // mock cursorBlock focus
            cursorBlock.setCursor(0, 0, true);
        }
        if (isMetaAction) {
            // Delay hide to avoid dispatch enter handler.
            setTimeout(this.hide.bind(this));
            return;
        }

        // Keep the type chooser open, but retarget it to the replacement block
        // immediately. List/quote unwrapping can create several paragraphs; in
        // that case the first replacement occupies the original block's slot.
        const replacement = this._convertedBlock ?? (block.parent
            ? block
            : (previous?.next as Parent | null) ?? (parent.firstChild as Parent | null));
        if (!replacement?.parent) {
            this._block = null;
            this.hide();
            return;
        }

        this._block = replacement;
        this._conversionLocked = true;
        this.render();
        if (this.floatBox && this.container) {
            Object.assign(this.floatBox.style, {
                width: `${this.container.offsetWidth}px`,
                height: `${this.container.offsetHeight}px`,
            });
        }
        setTimeout(() => {
            this._conversionLocked = false;
        }, 120);
    }

    private _applyMetaAction(label: string, block: Parent, oldState: TState): Content | null {
        const { muya } = this;
        switch (label) {
            case 'copy-plain-text':
                this._writeClipboardText(this._plainText(block, oldState));
                return null;

            case 'copy-markdown':
                this._writeClipboardText(this._markdown(oldState));
                return null;

            case 'copy-section':
                this._writeClipboardText(this._markdownStates(this._headingSection(block)));
                return null;

            case 'duplicate': {
                const state = deepClone(oldState);
                const dupBlock = ScrollPage.loadBlock(state.name).create(muya, state);
                block.parent!.insertAfter(dupBlock, block);
                return dupBlock.lastContentInDescendant();
            }

            case 'duplicate-section': {
                const section = this._headingSectionBlocks(block);
                let anchor = section.at(-1)!;
                for (const state of section.map(item => deepClone(item.getState()))) {
                    const duplicate = ScrollPage.loadBlock(state.name).create(muya, state);
                    anchor.parent!.insertAfter(duplicate, anchor);
                    anchor = duplicate;
                }
                return anchor.lastContentInDescendant();
            }

            case 'insert-before':
            case 'insert-after': {
                const state = deepClone(emptyStates.paragraph);
                const newBlock = ScrollPage.loadBlock('paragraph').create(
                    muya,
                    state,
                );
                if (label === 'insert-before')
                    block.parent!.insertBefore(newBlock, block);
                else
                    block.parent!.insertAfter(newBlock, block);
                return newBlock.lastContentInDescendant();
            }

            case 'move-up':
            case 'move-down': {
                const parent = block.parent!;
                if (label === 'move-up') {
                    if (!block.prev)
                        return null;
                    block.insertInto(parent, block.prev);
                }
                else {
                    if (!block.next)
                        return null;
                    block.insertInto(parent, block.next.next);
                }
                return block.lastContentInDescendant();
            }

            case 'move-section-up':
            case 'move-section-down':
                return this._moveHeadingSection(block, label === 'move-section-up' ? 'up' : 'down');

            case 'cut':
                this._writeClipboardText(this._markdown(oldState));
                return this._applyMetaAction('delete', block, oldState);

            case 'cut-section':
                this._writeClipboardText(this._markdownStates(this._headingSection(block)));
                return this._removeHeadingSection(block);

            case 'promote-section':
                return this._shiftHeadingSection(block, -1);

            case 'demote-section':
                return this._shiftHeadingSection(block, 1);

            case 'comment': {
                const first = block.firstContentInDescendant();
                const last = block.lastContentInDescendant();
                if (!first || !last)
                    return null;

                const anchorKey = first.path.join('/');
                const focusKey = last.path.join('/');
                const quote = Array.from(
                    block.domNode?.querySelectorAll<HTMLElement>('[contenteditable="true"]') ?? [],
                )
                    .map(node => node.innerText || node.textContent || '')
                    .join('\n')
                    .replace(/\s+/g, ' ')
                    .trim() || (first.text ?? '').trim();

                if (!quote)
                    return null;

                muya.eventCenter.emit('annotamd-comment-selection', {
                    quote,
                    anchor: {
                        key: anchorKey,
                        offset: 0,
                    },
                    focus: {
                        key: focusKey,
                        offset: last.text?.length ?? 0,
                    },
                    isCrossBlock: anchorKey !== focusKey,
                    capturedAt: Date.now(),
                });
                return null;
            }

            case 'delete': {
                let cursorBlock = null;
                if (block.prev) {
                    cursorBlock = block.prev.lastContentInDescendant();
                }
                else if (block.next) {
                    cursorBlock = block.next.firstContentInDescendant();
                }
                else {
                    const state = deepClone(emptyStates.paragraph);
                    const newBlock = ScrollPage.loadBlock('paragraph').create(
                        muya,
                        state,
                    );
                    block.parent!.insertAfter(newBlock, block);
                    cursorBlock = newBlock.lastContentInDescendant();
                }
                block.remove();

                return cursorBlock;
            }

            case 'delete-section': {
                return this._removeHeadingSection(block);
            }

            default:
                return null;
        }
    }

    private _markdown(state: TState): string {
        return this._markdownStates([state]);
    }

    private _markdownStates(states: TState[]): string {
        return this.muya.editor.jsonState
            .getMarkdownFromState(states)
            .replace(/\n+$/, '');
    }

    private _headingSection(block: Parent): TState[] {
        return this._headingSectionBlocks(block).map(item => item.getState());
    }

    private _headingSectionBlocks(block: Parent): Parent[] {
        const level = (block as Parent & { meta?: { level?: number } }).meta?.level;
        if (level == null)
            return [block];

        const section: Parent[] = [block];
        let current = block.next as Parent | null;
        while (current) {
            const currentLevel = /^(?:atx|setext)-heading$/.test(current.blockName)
                ? (current as Parent & { meta?: { level?: number } }).meta?.level
                : null;
            if (currentLevel != null && currentLevel <= level)
                break;
            section.push(current);
            current = current.next as Parent | null;
        }
        return section;
    }

    private _headingLevel(block: Parent | null): number | null {
        if (!block || !/^(?:atx|setext)-heading$/.test(block.blockName))
            return null;
        return (block as Parent & { meta?: { level?: number } }).meta?.level ?? null;
    }

    private _removeHeadingSection(block: Parent): Content | null {
        const section = this._headingSectionBlocks(block);
        const parent = block.parent!;
        const previous = block.prev as Parent | null;
        const next = section.at(-1)!.next as Parent | null;
        let cursor = previous?.lastContentInDescendant() ?? next?.firstContentInDescendant() ?? null;

        if (!cursor) {
            const newBlock = ScrollPage.loadBlock('paragraph').create(
                this.muya,
                deepClone(emptyStates.paragraph),
            );
            parent.insertAfter(newBlock, section.at(-1)!);
            cursor = newBlock.lastContentInDescendant();
        }

        section.forEach(item => item.remove());
        return cursor;
    }

    private _shiftHeadingSection(block: Parent, delta: -1 | 1): Content | null {
        const headings = this._headingSectionBlocks(block)
            .filter(item => this._headingLevel(item) != null);
        if (headings.some(item => {
            const level = this._headingLevel(item)!;
            return level + delta < 1 || level + delta > 6;
        }))
            return null;

        let firstReplacement: Parent | null = null;
        for (const heading of headings) {
            const oldState = heading.getState();
            if (!('text' in oldState))
                continue;

            const level = this._headingLevel(heading)! + delta;
            let state: TState;
            if (oldState.name === 'setext-heading' && level <= 2) {
                state = {
                    ...deepClone(oldState),
                    meta: {
                        level,
                        underline: level === 1 ? '===' : '---',
                    },
                };
            }
            else {
                const text = oldState.name === 'atx-heading'
                    ? oldState.text.replace(/^ {0,3}#{1,6}(?:\s+|$)/, '')
                    : oldState.text;
                state = {
                    name: 'atx-heading',
                    meta: { level },
                    text: `${'#'.repeat(level)} ${text}`,
                };
            }

            const replacement = ScrollPage.loadBlock(state.name).create(this.muya, state);
            heading.replaceWith(replacement);
            firstReplacement ??= replacement;
        }

        return firstReplacement?.lastContentInDescendant() ?? null;
    }

    private _toggleHeadingSection(block: Parent): void {
        const collapsed = this._collapsedSections.get(block);
        if (collapsed) {
            collapsed.forEach((wasHidden, item) => {
                if (item.domNode)
                    item.domNode.hidden = wasHidden;
            });
            this._collapsedSections.delete(block);
            this._syncSectionCollapseIndicator(block, false);
            return;
        }

        const visibility = new Map<Parent, boolean>();
        this._headingSectionBlocks(block).slice(1).forEach((item) => {
            if (!item.domNode)
                return;
            visibility.set(item, item.domNode.hidden === true);
            item.domNode.hidden = true;
        });
        this._collapsedSections.set(block, visibility);
        this._syncSectionCollapseIndicator(block, true);
    }

    private _syncSectionCollapseIndicator(block: Parent, collapsed: boolean): void {
        const heading = block.domNode;
        if (!heading)
            return;

        const existing = heading.querySelector<HTMLButtonElement>('.mu-section-collapse-indicator');
        if (this._headingSectionBlocks(block).length <= 1) {
            existing?.remove();
            heading.classList.remove('mu-section-has-disclosure');
            heading.classList.remove('mu-section-collapsed');
            return;
        }

        heading.classList.add('mu-section-has-disclosure');
        heading.classList.toggle('mu-section-collapsed', collapsed);
        const text = this.muya.i18n.t(collapsed ? 'Expand Section' : 'Collapse Section');
        const indicator = existing ?? document.createElement('button');
        indicator.type = 'button';
        indicator.className = 'mu-section-collapse-indicator';
        indicator.contentEditable = 'false';
        indicator.setAttribute('aria-label', text);
        indicator.dataset.tooltip = text;

        if (!existing) {
            indicator.addEventListener('mousedown', event => event.preventDefault());
            indicator.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this._toggleHeadingSection(block);
                if (this._block === block)
                    this.render();
            });
            heading.insertBefore(indicator, heading.firstChild);
        }
    }

    private _syncHeadingDisclosures(): void {
        this.muya.editor.scrollPage?.children.forEach((item) => {
            const block = item as Parent;
            if (/^(?:atx|setext)-heading$/.test(block.blockName))
                this._syncSectionCollapseIndicator(block, this._collapsedSections.has(block));
        });
    }

    override destroy(): void {
        this._headingObserver?.disconnect();
        this._headingObserver = null;
        super.destroy();
    }

    private _moveHeadingSection(block: Parent, direction: 'up' | 'down'): Content | null {
        const level = this._headingLevel(block);
        if (level == null)
            return null;

        const section = this._headingSectionBlocks(block);
        const parent = block.parent!;
        if (direction === 'up') {
            let peer = block.prev as Parent | null;
            while (peer) {
                const peerLevel = this._headingLevel(peer);
                if (peerLevel != null && peerLevel <= level)
                    break;
                peer = peer.prev as Parent | null;
            }
            if (!peer || this._headingLevel(peer) !== level)
                return null;
            section.forEach(item => item.insertInto(parent, peer));
        }
        else {
            const peer = section.at(-1)!.next as Parent | null;
            if (!peer || this._headingLevel(peer) !== level)
                return null;
            const reference = this._headingSectionBlocks(peer).at(-1)!.next as Parent | null;
            section.forEach(item => item.insertInto(parent, reference));
        }
        return block.lastContentInDescendant();
    }

    private _plainText(block: Parent, state: TState): string {
        if (
            /^(?:frontmatter|code-block|diagram|math-block|html-block)$/.test(block.blockName)
            && 'text' in state
        )
            return state.text.trimEnd();

        if (state.name === 'table') {
            return state.children
                .map(row => row.children
                    .map(cell => this._inlinePlainText(cell.text))
                    .join('\t'))
                .join('\n');
        }

        return this._markdown(state)
            .split('\n')
            .filter(line => !/^\s*(?:(?:>\s*)?\[!HIGHLIGHT(?:\s+collapsed)?\]|```|~~~)/.test(line))
            .map(line => line
                .replace(/^\s{0,3}#{1,6}\s+/, '')
                .replace(/^\s*(?:>\s*)+/, '')
                .replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ''))
            .map(line => this._inlinePlainText(line))
            .join('\n')
            .trim();
    }

    private _inlinePlainText(text: string): string {
        const { superSubScript, footnote } = this.muya.options;
        return tokensToPlainText(tokenizer(text, {
            hasBeginRules: false,
            options: { superSubScript, footnote },
        }));
    }

    private _writeClipboardText(text: string): void {
        if (!text)
            return;

        const result = this.muya.options.clipboardWriteText?.(text)
            ?? navigator.clipboard?.writeText?.(text);
        if (result instanceof Promise)
            result.catch(() => {});
    }

    private _turnIntoBlock(label: string, block: Parent, oldState: TState) {
        const { muya } = this;
        switch (block.blockName) {
            case 'paragraph':
                // fall through
            case 'atx-heading':
                // fall through
            case 'setext-heading': {
                if (block.blockName === 'paragraph' && block.blockName === label)
                    return null;

                const headingLevel
                    = isAtxHeadingState(oldState) || oldState.name === 'setext-heading'
                        ? oldState.meta.level
                        : null;
                if (
                    block.blockName === 'atx-heading'
                    && headingLevel !== null
                    && label.split(' ')[1] === String(headingLevel)
                ) {
                    return null;
                }

                const rawText = 'text' in oldState ? oldState.text : '';
                const text = block.blockName === 'atx-heading'
                    ? rawText.replace(/^ {0,3}#{1,6}(?:\s+|$)/, '')
                    : rawText;
                const replacement = replaceBlockByLabel({
                    block,
                    label,
                    muya,
                    text,
                });

                if (replacement) {
                    if (/^(?:order|bullet|task)-list$/.test(replacement.blockName))
                        this._convertedBlock = mergeAdjacentCompatibleLists(replacement).item;
                    else this._convertedBlock = replacement;
                }

                return this._convertedBlock?.firstContentInDescendant() ?? null;
            }

            case 'block-quote':
                if (label === 'paragraph')
                    muya.resetToParagraph(block);
                else
                    this._convertedBlock = replaceTextContainerByLabel({ block, muya, label });
                return this._convertedBlock?.firstContentInDescendant() ?? null;

            case 'highlight-block':
                if (label === 'highlight-block')
                    return null;
                this._convertedBlock = replaceTextContainerByLabel({ block, muya, label });
                return this._convertedBlock?.firstContentInDescendant() ?? null;

            case 'order-list':
                // fall through
            case 'bullet-list':
                // fall through
            case 'task-list':
                if (label === 'block-quote' || label === 'highlight-block' || label.startsWith('atx-heading ')) {
                    this._convertedBlock = replaceTextContainerByLabel({ block, muya, label });
                    return this._convertedBlock?.firstContentInDescendant() ?? null;
                }
                return this._turnIntoList(label, block, oldState);

            case 'list-item':
                // fall through
            case 'task-list-item': {
                const replacements = convertListItem(block, label);
                this._convertedBlock = replacements[0] ?? null;
                return this._convertedBlock?.firstContentInDescendant() ?? null;
            }

            default:
                return null;
        }
    }

    private _turnIntoList(label: string, block: Parent, oldState: TState) {
        const { muya } = this;
        const { editor } = muya;
        const { bulletListMarker, orderListDelimiter } = muya.options;

        if (!isAnyListState(oldState))
            return null;

        if (label === 'paragraph') {
            muya.resetToParagraph(block);
            return null;
        }

        // Clicking the active list type toggles the list off,
        // unwrapping every item back into plain paragraphs (matches
        // the command-palette/menu `reset-to-paragraph` behaviour).
        if (block.blockName === label) {
            muya.resetToParagraph(block);

            return null;
        }

        // The conversion between order/bullet/task lists re-shapes both
        // the parent `meta` and each item's `meta` (only task-list-items
        // carry meta). Rebuild a fresh state of the target shape rather
        // than mutating the old one in place — the in-place form requires
        // discriminant-changing casts that TS can't track.
        const sourceMeta = oldState.meta;
        const loose = sourceMeta.loose;
        const delimiter = 'delimiter' in sourceMeta
            ? sourceMeta.delimiter
            : orderListDelimiter;
        const marker = 'marker' in sourceMeta
            ? sourceMeta.marker
            : bulletListMarker;

        const childContents: TState[][] = oldState.children.map(
            li => deepClone(li.children),
        );

        let state: ITaskListState | IOrderListState | IBulletListState;
        if (label === 'task-list') {
            state = {
                name: 'task-list',
                meta: { marker: marker ?? bulletListMarker, loose: !!loose },
                children: childContents.map(children => ({
                    name: 'task-list-item',
                    meta: { checked: false },
                    children,
                })),
            };
        }
        else if (label === 'order-list') {
            state = {
                name: 'order-list',
                meta: { delimiter, loose: !!loose, start: 1 },
                children: childContents.map(children => ({
                    name: 'list-item',
                    children,
                })),
            };
        }
        else {
            state = {
                name: 'bullet-list',
                meta: { marker: marker ?? bulletListMarker, loose: !!loose },
                children: childContents.map(children => ({
                    name: 'list-item',
                    children,
                })),
            };
        }
        // TODO: @JOCS, remove use this.selection directly.
        const { anchorPath, anchor, focus, isSelectionInSameBlock }
            = editor.selection;
        const listBlock = ScrollPage.loadBlock(label).create(muya, state);
        block.replaceWith(listBlock);
        const guessCursorBlock
            = muya.editor.scrollPage?.queryBlock(anchorPath);
        if (guessCursorBlock && isSelectionInSameBlock) {
            const begin = Math.min(anchor!.offset, focus!.offset);
            const end = Math.max(anchor!.offset, focus!.offset);
            // Make guessCursorBlock active. queryBlock returns the
            // closest block at the given path; for an inline path
            // it's a Content leaf (which has setCursor).
            (guessCursorBlock as Content).setCursor(begin, end, true);

            return null;
        }

        return listBlock.firstContentInDescendant();
    }
}
