import type { ReferenceElement } from '@floating-ui/dom';
import type { VNode } from 'snabbdom';
import type { Muya } from '../../index';
import type { Token } from '../../inlineRenderer/types';
import type { IBaseOptions } from '../types';

import type { ColorFormatType, FormatToolIcon, TextStyleType } from './config';
import Format, { isInlineStyleFormatToken } from '../../block/base/format';
import { SelectionDirection } from '../../selection/types';
import { isAtxHeadingState } from '../../state/types';
import { isKeyboardEvent } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import { formatActionIcon, renderActionIcon } from '../actionIcons';
import BaseFloat from '../baseFloat';
import icons, { COLOR_PALETTES, TEXT_STYLE_OPTIONS } from './config';
import '../actionIcons.css';
import './index.css';

/** Default float options for inline format toolbar */
const defaultOptions = {
    placement: 'top' as const,
    offsetOptions: {
        mainAxis: 5,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

/** Format keyboard shortcuts without shift modifier */
const FORMAT_SHORTCUTS = {
    b: 'strong',
    i: 'em',
    u: 'u',
    d: 'del',
    e: 'inline_code',
    l: 'link',
} as const;

/** Format keyboard shortcuts with shift modifier */
const FORMAT_SHORTCUTS_SHIFT = {
    e: 'inline_math',
    i: 'image',
    r: 'clear',
} as const;

/** Keys that should not trigger toolbar hiding */
const NON_EDITING_KEYS = new Set([
    'Shift',
    'Control',
    'Meta',
    'Alt',
    'Tab',
]);

type AnnotaMDSelectionAction = 'annotamd_comment' | 'annotamd_delete_selection';
const ANNOTAMD_SELECTION_ACTIONS = new Set<string>([
    'annotamd_comment',
    'annotamd_delete_selection',
]);

function pathPrecedesOrEquals(anchorPath: Array<number | string>, focusPath: Array<number | string>): boolean {
    const length = Math.max(anchorPath.length, focusPath.length);
    for (let index = 0; index < length; index++) {
        const anchorPart = anchorPath[index];
        const focusPart = focusPath[index];
        if (anchorPart === focusPart)
            continue;
        if (anchorPart == null)
            return true;
        if (focusPart == null)
            return false;
        return String(anchorPart).localeCompare(String(focusPart), undefined, { numeric: true }) < 0;
    }
    return true;
}

/**
 * Inline format toolbar for text formatting
 * Provides quick access to text formatting options like bold, italic, etc.
 * Appears when text is selected
 */
export class InlineFormatToolbar extends BaseFloat {
    static pluginName = 'formatPicker';
    // Passive float: must not capture nav keys, or Enter over a selection is
    // swallowed while it's shown (#3196).
    public override capturesContentKeydown = false;

    /** Previous virtual node for patching */
    private _oldVNode: VNode | null = null;

    /** The block containing the selected text */
    private _block: Format | null = null;

    /** Currently applied formats in the selection */
    private _formats: Token[] = [];

    /** Color panel currently expanded from the toolbar. */
    private _openPalette: 'combined' | null = null;

    /** Paragraph/heading menu expanded from the left-most style control. */
    private _textStyleOpen = false;

    /** Link creation form shown after the link action is chosen. */
    private _linkCreateOpen = false;
    private _draftLinkHref = '';
    private _linkSelection: { block: Format; start: number; end: number } | null = null;
    private _reference: ReferenceElement | null = null;

    /** Whether the active range spans more than one content block. */
    private _crossBlockSelection = false;

    /** Toolbar configuration options */
    public override options: IBaseOptions;

    /** Format tool icons configuration */
    private _icons: FormatToolIcon[] = icons;

    /** Container element for the format toolbar */
    private _formatContainer: HTMLDivElement = document.createElement('div');

    /**
     * Create inline format toolbar instance
     * @param muya - Muya editor instance
     * @param options - Toolbar options
     */
    constructor(muya: Muya, options = {}) {
        const name = 'mu-format-picker';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        this.options = opts;
        this.container!.appendChild(this._formatContainer);
        this.floatBox!.classList.add('mu-format-picker-container');
        this.listen();
    }

    /**
     * Listen to format picker events and keyboard shortcuts
     */
    override listen() {
        const { eventCenter, domNode, editor } = this.muya;
        super.listen();

        eventCenter.subscribe('muya-format-picker', ({ reference, block }) => {
            if (reference) {
                this._reference = reference;
                this._block = block;
                this._crossBlockSelection = false;
                this._formats = block.getFormatsInRange().formats;
                this._linkCreateOpen = false;
                this._draftLinkHref = '';
                this._linkSelection = null;
                this.options.placement = 'top';
                requestAnimationFrame(() => {
                    this.show(reference);
                    this._render();
                });
            }
            else {
                // Focusing the link input collapses the editor selection and
                // emits a transient picker-close event. Keep the captured
                // selection alive until the user confirms, cancels or clicks
                // outside the float (BaseFloat handles that final hide).
                if (this._linkCreateOpen)
                    return;
                this._openPalette = null;
                this._textStyleOpen = false;
                this._linkCreateOpen = false;
                this.hide();
            }
        });

        // While open, re-sync the highlight from the selection's current
        // formats — this is how formats applied outside the toolbar (menu /
        // command / shortcut) light up their buttons.
        eventCenter.subscribe('selection-change', ({
            formats,
            isCollapsed,
            isSelectionInSameBlock,
            anchorBlock,
            cursorCoords,
        }) => {
            if (this._linkCreateOpen)
                return;

            if (isCollapsed) {
                this._crossBlockSelection = false;
                this.hide();
                return;
            }

            if (!isSelectionInSameBlock) {
                if (!(anchorBlock instanceof Format) || !cursorCoords)
                    return;

                const reference: ReferenceElement = {
                    getBoundingClientRect: () => cursorCoords,
                    contextElement: anchorBlock.domNode ?? undefined,
                };
                this._reference = reference;
                this._block = anchorBlock;
                this._formats = [];
                this._crossBlockSelection = true;
                this._openPalette = null;
                this._textStyleOpen = false;
                this.options.placement = 'bottom';
                requestAnimationFrame(() => {
                    const current = editor.selection.getSelection();
                    if (!current || current.isSelectionInSameBlock)
                        return;
                    this.show(reference);
                    this._render();
                });
                return;
            }

            if (!this.status)
                return;

            this._crossBlockSelection = false;
            this._formats = formats;
            this._render();
        });

        eventCenter.attachDOMEvent(domNode, 'keydown', (event) => {
            this._handleKeydown(event, editor);
        });
    }

    /**
     * Handle keyboard events for format shortcuts and toolbar hiding
     * @param event - Keyboard event
     * @param editor - Editor instance
     */
    private _handleKeydown(event: Event, editor: typeof this.muya.editor) {
        if (!isKeyboardEvent(event))
            return;

        const { key, shiftKey, metaKey, ctrlKey } = event;
        const selection = editor.selection.getSelection();
        if (!selection)
            return;

        const { anchor, isSelectionInSameBlock } = selection;
        const anchorBlock = anchor.block;

        if (!isSelectionInSameBlock)
            return;

        // Hide toolbar on editing operations
        if (!(anchorBlock instanceof Format) || (!metaKey && !ctrlKey)) {
            this._hideOnEditingKey(key, metaKey, ctrlKey);
            return;
        }

        // Handle format shortcuts
        this._handleFormatShortcut(event, key, shiftKey, anchorBlock);
    }

    /**
     * Hide toolbar when an editing key is pressed
     * @param key - Key name
     * @param metaKey - Meta key state
     * @param ctrlKey - Control key state
     */
    private _hideOnEditingKey(key: string, metaKey: boolean, ctrlKey: boolean) {
        // Don't hide if it's a modifier/navigation key or if format shortcut is pressed
        if (NON_EDITING_KEYS.has(key) || metaKey || ctrlKey)
            return;

        if (this.status) {
            this.hide();
        }
    }

    /**
     * Handle format keyboard shortcuts
     * @param event - Keyboard event
     * @param key - Key name
     * @param shiftKey - Shift key state
     * @param anchorBlock - Anchor block
     */
    private _handleFormatShortcut(
        event: KeyboardEvent,
        key: string,
        shiftKey: boolean,
        anchorBlock: Format,
    ) {
        const shortcuts = shiftKey ? FORMAT_SHORTCUTS_SHIFT : FORMAT_SHORTCUTS;
        const formatType = shortcuts[key as keyof typeof shortcuts];

        if (formatType) {
            event.preventDefault();
            anchorBlock.format(formatType);
        }
    }

    /**
     * Render the format toolbar UI
     */
    private _render() {
        const { _icons: icons, _oldVNode: oldVNode, _formatContainer: formatContainer, _formats: formats } = this;
        const { i18n } = this.muya;

        this.container?.classList.toggle('link-create-open', this._linkCreateOpen);
        if (this._linkCreateOpen) {
            const vnode = h('div.mu-link-create-panel', [
                h('input.mu-link-create-input', {
                    attrs: {
                        type: 'url',
                        placeholder: i18n.t('Paste or enter link'),
                        'aria-label': i18n.t('Paste or enter link'),
                    },
                    props: { value: this._draftLinkHref },
                    on: {
                        input: (event: Event) => {
                            this._draftLinkHref = (event.target as HTMLInputElement).value;
                            const button = this.container?.querySelector<HTMLButtonElement>('.mu-link-create-confirm');
                            if (button)
                                button.disabled = !this._draftLinkHref.trim();
                        },
                        keydown: (event: KeyboardEvent) => {
                            if (event.key === 'Enter')
                                this._commitLink(event);
                            else if (event.key === 'Escape') {
                                event.preventDefault();
                                this.hide();
                            }
                        },
                    },
                }),
                h('button.mu-link-create-confirm', {
                    attrs: {
                        type: 'button',
                        disabled: !this._draftLinkHref.trim(),
                    },
                    on: { click: (event: Event) => this._commitLink(event) },
                }, i18n.t('Confirm')),
            ]);

            patch(oldVNode || formatContainer, vnode);
            this._oldVNode = vnode;
            requestAnimationFrame(() => this.container?.querySelector<HTMLInputElement>('.mu-link-create-input')?.focus());
            return;
        }

        const visibleIcons = this._crossBlockSelection
            ? icons.filter(icon => icon.type !== 'link')
            : icons;
        const children = visibleIcons.map(icon => this._createIconItem(icon, formats, i18n));
        const vnode = h('ul', children);

        patch(oldVNode || formatContainer, vnode);
        this._oldVNode = vnode;
    }

    /**
     * Create a format icon item
     * @param icon - Icon configuration
     * @param formats - Currently applied formats
     * @param i18n - Internationalization instance
     */
    private _createIconItem(icon: FormatToolIcon, formats: Token[], i18n: typeof this.muya.i18n) {
        const textStyle = this._currentTextStyle();
        const actionIcon = icon.type === 'text_style'
            ? renderActionIcon('text-style')
            : icon.type === 'color_palette'
                ? renderActionIcon('color')
                : icon.type === 'annotamd_comment'
                    ? renderActionIcon('comment')
                    : icon.type === 'annotamd_delete_selection'
                        ? renderActionIcon('delete')
                        : renderActionIcon(formatActionIcon(icon.type)!);

        const iconWrapper = h('div.icon-wrapper', icon.type === 'text_style'
            ? [actionIcon, h('span.mu-text-style-chevron', '⌄')]
            : actionIcon);

        const isColorPalette = icon.type === 'color_palette';
        const isActive = isColorPalette
            ? formats.some(f => isInlineStyleFormatToken(f, 'text_color') || isInlineStyleFormatToken(f, 'background_color'))
            : formats.some(f => f.type === icon.type || (f.type === 'html_tag' && f.tag === icon.type));
        const paletteOpen = isColorPalette && this._openPalette === 'combined';
        const textStyleOpen = icon.type === 'text_style' && this._textStyleOpen;
        const tooltip = [i18n.t(icon.tooltip), icon.shortcut].filter(Boolean).join('  ');

        const itemSelector = `li.item.${icon.type}${'groupBreakBefore' in icon && icon.groupBreakBefore ? '.group-break-before' : ''}${isActive ? '.active' : ''}${paletteOpen ? '.palette-open' : ''}${textStyleOpen ? '.text-style-open' : ''}`;
        const children: VNode[] = [iconWrapper];
        if (paletteOpen)
            children.push(this._createCombinedColorPalette(i18n));
        if (textStyleOpen)
            children.push(this._createTextStyleMenu(i18n));

        return h(
            itemSelector,
            {
                attrs: {
                    'data-tooltip': tooltip,
                    'aria-label': i18n.t(icon.tooltip),
                },
                on: {
                    mousedown: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    },
                    click: event => this._selectItem(event, icon),
                },
            },
            children,
        );
    }

    private _currentTextStyle(): TextStyleType {
        if (this._block?.closestBlock('code-block'))
            return 'pre';

        const parent = this._block?.parent;
        if (parent?.blockName === 'atx-heading') {
            const state = parent.getState();
            if (isAtxHeadingState(state))
                return `heading ${state.meta.level}` as TextStyleType;
        }
        return 'paragraph';
    }

    private _createTextStyleMenu(i18n: typeof this.muya.i18n): VNode {
        const current = this._currentTextStyle();
        const options = TEXT_STYLE_OPTIONS.map(option => h(
            `button.mu-text-style-option${option.type === current ? '.active' : ''}`,
            {
                attrs: {
                    'type': 'button',
                    'data-paragraph-type': option.type,
                    'aria-label': i18n.t(option.title),
                },
                on: {
                    mousedown: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    },
                    click: event => this._applyTextStyle(event, option.type),
                },
            },
            [
                h('span.mu-text-style-option-mark', option.label),
                h('span.mu-text-style-option-title', i18n.t(option.title)),
                h('span.mu-text-style-option-shortcut', option.shortcut),
            ],
        ));

        return h('div.mu-text-style-menu', options);
    }

    private _applyTextStyle(event: Event, type: TextStyleType) {
        event.preventDefault();
        event.stopPropagation();

        const { selection } = this.muya.editor;
        const { anchor, focus, anchorBlock, anchorPath, focusBlock, focusPath } = selection;
        if (!anchor || !focus || !anchorBlock || !focusBlock)
            return;

        this._textStyleOpen = false;
        if (!this._crossBlockSelection && this._currentTextStyle() === type) {
            this.hide();
            return;
        }

        selection.setSelection(
            { offset: anchor.offset, block: anchorBlock, path: anchorPath },
            { offset: focus.offset, block: focusBlock, path: focusPath },
        );
        this.muya.updateParagraph(type);
        this.hide();
    }

    private _createColorPalette(type: ColorFormatType, i18n: typeof this.muya.i18n): VNode {
        const swatches = COLOR_PALETTES[type].map((value) => {
            const selector = `button.mu-color-swatch${value ? '' : '.default'}`;
            return h(
                selector,
                {
                    attrs: {
                        'type': 'button',
                        'title': value || i18n.t('Default Color'),
                        'aria-label': value || i18n.t('Default Color'),
                    },
                    style: value ? { background: value } : {},
                    on: {
                        mousedown: (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        },
                        click: event => this._applyColor(event, type, value),
                    },
                },
                '',
            );
        });

        return h('section.mu-color-palette-section', [
            h('div.mu-color-palette-title', i18n.t(type === 'text_color' ? 'Font Color' : 'Background Color')),
            h('div.mu-color-grid', swatches),
        ]);
    }

    private _createCombinedColorPalette(i18n: typeof this.muya.i18n): VNode {
        return h('div.mu-color-palette.combined', [
            this._createColorPalette('text_color', i18n),
            this._createColorPalette('background_color', i18n),
        ]);
    }

    private _applyColor(event: Event, type: ColorFormatType, value: string) {
        event.preventDefault();
        event.stopPropagation();

        const { selection } = this.muya.editor;
        const { anchor, focus, anchorBlock, anchorPath, focusBlock, focusPath } = selection;
        if (!anchor || !focus || !anchorBlock || !focusBlock || !this._block)
            return;

        selection.setSelection(
            { offset: anchor.offset, block: anchorBlock, path: anchorPath },
            { offset: focus.offset, block: focusBlock, path: focusPath },
        );
        if (this._crossBlockSelection)
            this.muya.format(type, value);
        else
            this._block.format(type, value);
        this._openPalette = null;
        this._formats = this._crossBlockSelection ? [] : this._block.getFormatsInRange().formats;
        this._render();
    }

    /**
     * Handle format item selection
     * @param event - Click event
     * @param item - Selected format tool icon
     */
    private _selectItem(event: Event, item: FormatToolIcon) {
        event.preventDefault();
        event.stopPropagation();

        const { selection } = this.muya.editor;
        const { anchor, focus, anchorBlock, anchorPath, focusBlock, focusPath } = selection;

        if (!anchor || !focus || !anchorBlock || !focusBlock)
            return;

        if (item.type === 'text_style') {
            this._openPalette = null;
            this._textStyleOpen = !this._textStyleOpen;
            this._render();
            return;
        }

        if (item.type === 'color_palette') {
            this._textStyleOpen = false;
            this._openPalette = this._openPalette === 'combined' ? null : 'combined';
            this._render();
            return;
        }

        if (ANNOTAMD_SELECTION_ACTIONS.has(item.type)) {
            this._selectAnnotaMDAction(item.type as AnnotaMDSelectionAction);
            return;
        }

        if (item.type === 'link') {
            if (anchorBlock !== focusBlock || !(anchorBlock instanceof Format))
                return;
            this._linkSelection = {
                block: anchorBlock,
                start: Math.min(anchor.offset, focus.offset),
                end: Math.max(anchor.offset, focus.offset),
            };
            this._linkCreateOpen = true;
            this._draftLinkHref = '';
            this._openPalette = null;
            this._textStyleOpen = false;
            this.options.placement = 'bottom';
            this._render();
            if (this._reference)
                this.show(this._reference);
            return;
        }

        if (this._crossBlockSelection) {
            this.muya.format(item.type);
            this._formats = [];
            this._render();
            return;
        }

        // Restore selection before formatting
        selection.setSelection(
            { offset: anchor.offset, block: anchorBlock, path: anchorPath },
            { offset: focus.offset, block: focusBlock, path: focusPath },
        );

        this._block!.format(item.type);

        // Hide toolbar for link and image, re-render for other formats
        if (/link|image/.test(item.type)) {
            this.hide();
        }
        else {
            this._formats = this._block!.getFormatsInRange().formats;
            this._render();
        }
    }

    private _commitLink(event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        const selection = this._linkSelection;
        const href = this._draftLinkHref.trim();
        if (!selection || !href)
            return;

        const { block, start, end } = selection;
        const selectedText = block.text.slice(start, end);
        const link = `[${selectedText}](${href})`;
        block.text = `${block.text.slice(0, start)}${link}${block.text.slice(end)}`;
        const cursor = start + link.length;
        block.setCursor(cursor, cursor, true);
        this.muya.flush();
        this.muya.eventCenter.emit('content-change', { block });
        this._linkCreateOpen = false;
        this._linkSelection = null;
        this.hide();
    }

    private _selectAnnotaMDAction(type: AnnotaMDSelectionAction): void {
        const { selection } = this.muya.editor;
        const { anchor, focus, anchorBlock, anchorPath, focusBlock, focusPath } = selection;
        if (!anchor || !focus || !anchorBlock || !focusBlock)
            return;

        if (type === 'annotamd_comment') {
            const anchorKey = Array.isArray(anchorPath) ? anchorPath.join('/') : '';
            const focusKey = Array.isArray(focusPath) ? focusPath.join('/') : anchorKey;
            const anchorOffset = anchor.offset ?? 0;
            const focusOffset = focus.offset ?? 0;
            const isCrossBlock = anchorKey !== focusKey;
            let quote = window.getSelection()?.toString() ?? '';

            if (!quote && !isCrossBlock && typeof anchorBlock.text === 'string') {
                const start = Math.min(anchorOffset, focusOffset);
                const end = Math.max(anchorOffset, focusOffset);
                quote = anchorBlock.text.slice(start, end);
            }

            quote = quote.replace(/\s+/g, ' ').trim();
            this.muya.eventCenter.emit('annotamd-comment-selection', {
                quote,
                anchor: {
                    key: anchorKey,
                    offset: anchorOffset,
                },
                focus: {
                    key: focusKey,
                    offset: focusOffset,
                },
                isCrossBlock,
                capturedAt: Date.now(),
            });
            this.hide();
            return;
        }

        const anchorPrecedesFocus = anchorBlock === focusBlock
            ? anchor.offset <= focus.offset
            : pathPrecedesOrEquals(anchorPath, focusPath);
        selection.setSelection(
            { offset: anchor.offset, block: anchorBlock, path: anchorPath },
            { offset: focus.offset, block: focusBlock, path: focusPath },
        );
        this.muya.editor.clipboard.cutHandler({
            anchor: { offset: anchor.offset, block: anchorBlock, path: anchorPath },
            focus: { offset: focus.offset, block: focusBlock, path: focusPath },
            isSelectionInSameBlock: anchorBlock === focusBlock,
            direction: anchorPrecedesFocus
                ? SelectionDirection.FORWARD
                : SelectionDirection.BACKWARD,
        });
        this.hide();
    }
}
