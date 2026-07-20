import type { VNode } from 'snabbdom';
import type Format from '../../block/base/format';
import type { Muya } from '../../muya';
import type { IBaseOptions } from '../types';
import { h, patch } from '../../utils/snabbdom';
import { getPageTitle } from '../../utils/paste';
import { isUrlLikeLinkText } from '../../utils/url';
import { renderActionIcon } from '../actionIcons';
import BaseFloat from '../baseFloat';
import iconsConfig from './config';

import '../actionIcons.css';
import './index.css';

type LinkToolIcon = typeof iconsConfig[number];

interface ILinkInfo {
    href?: string | null;
    text?: string;
    raw?: string;
    range?: { start: number; end: number } | null;
    [key: string]: unknown;
}

interface ILinkToolsOptions extends IBaseOptions {
    jumpClick?: (linkInfo: ILinkInfo | null) => void;
}

interface ILinkToolsEventPayload {
    reference: HTMLElement | null;
    linkInfo?: ILinkInfo | null;
    block?: Format | null;
}

const defaultOptions = {
    placement: 'bottom' as const,
    offsetOptions: {
        mainAxis: 5,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

class LinkTools extends BaseFloat {
    static pluginName = 'linkTools';

    public override options: ILinkToolsOptions;
    private _oldVNode: VNode | null = null;
    private _linkInfo: ILinkInfo | null = null;
    private _linkBlock: Format | null = null;
    private _icons: LinkToolIcon[] = iconsConfig;
    private _hideTimer: ReturnType<typeof setTimeout> | null = null;
    private _showTimer: ReturnType<typeof setTimeout> | null = null;
    private _activeReference: HTMLElement | null = null;
    private _linkContainer: HTMLElement;
    private _editing = false;
    private _draftText = '';
    private _draftHref = '';
    private _viewMenuOpen = false;
    private _moreMenuOpen = false;

    constructor(muya: Muya, options: Partial<ILinkToolsOptions> = {}) {
        const name = 'mu-link-tools';
        const opts: ILinkToolsOptions = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        this.options = opts;
        const linkContainer = (this._linkContainer = document.createElement('div'));
        this.container!.appendChild(linkContainer);
        // Add a per-instance class on the floatBox so the parent
        // `.mu-float-wrapper` is identifiable in DOM and reachable by
        // `.mu-float-wrapper.mu-link-tools-container { … }` selectors.
        this.floatBox!.classList.add('mu-link-tools-container');
        this.listen();
    }

    override listen() {
        const { eventCenter } = this.muya;
        super.listen();
        eventCenter.subscribe('muya-link-tools', ({ reference, linkInfo, block }: ILinkToolsEventPayload) => {
            if (reference) {
                this._cancelHide();
                if (this._showTimer)
                    clearTimeout(this._showTimer);

                this._activeReference = reference;
                this._linkInfo = linkInfo ?? null;
                this._linkBlock = block ?? null;
                this._editing = false;
                this._draftText = this._linkInfo?.text ?? '';
                this._draftHref = this._linkInfo?.href ?? '';
                this._viewMenuOpen = false;
                this._moreMenuOpen = false;
                this._showTimer = setTimeout(() => {
                    this._showTimer = null;
                    this.show(reference);
                    this.render();
                }, 0);
            }
            else this._scheduleHide();
        });

        const mouseOverHandler = () => {
            this._cancelHide();
        };

        const mouseOutHandler = () => {
            // Keep the same bridge delay in both directions. Moving from the
            // toolbar back to its link must not produce an immediate blink.
            this._scheduleHide();
        };

        eventCenter.attachDOMEvent(this.container!, 'mouseover', mouseOverHandler);
        eventCenter.attachDOMEvent(this.container!, 'mouseleave', mouseOutHandler);
    }

    private _cancelHide() {
        if (!this._hideTimer)
            return;

        clearTimeout(this._hideTimer);
        this._hideTimer = null;
    }

    private _scheduleHide() {
        this._cancelHide();
        this._hideTimer = setTimeout(() => {
            this._hideTimer = null;
            // Timers are only a bridge across the physical gap between the
            // link and its toolbar. They must never override the browser's
            // actual pointer state, even if an extra mouseout was dispatched
            // during an editor re-render or Floating UI reposition.
            if (
                this._activeReference?.matches(':hover')
                || this.container?.matches(':hover')
            ) {
                return;
            }
            if (this._showTimer) {
                clearTimeout(this._showTimer);
                this._showTimer = null;
            }
            this._activeReference = null;
            this.hide();
        }, 500);
    }

    override destroy() {
        this._cancelHide();
        this._activeReference = null;
        if (this._showTimer) {
            clearTimeout(this._showTimer);
            this._showTimer = null;
        }
        super.destroy();
    }

    render() {
        const { _oldVNode: oldVNode, _linkContainer: linkContainer } = this;
        const { i18n } = this.muya;
        const canChangeView = this._canChangeView();
        const viewMode = this._getViewMode();
        this.container?.classList.toggle('editing', this._editing);

        if (this._editing) {
            const canConfirm = Boolean(this._draftText.trim() && this._draftHref.trim());
            const vnode = h('div.link-edit-panel', [
                h('label.link-edit-row', [
                    h('span.link-edit-label', i18n.t('Text')),
                    h('input.link-edit-input.link-text-input', {
                        attrs: {
                            type: 'text',
                            'aria-label': i18n.t('Text'),
                        },
                        props: { value: this._draftText },
                        on: {
                            input: (event: Event) => this._updateEditDraft('text', event),
                            keydown: (event: KeyboardEvent) => this._handleEditKeydown(event),
                        },
                    }),
                ]),
                h('div.link-edit-row', [
                    h('label.link-edit-label', { attrs: { for: 'mu-link-edit-href' } }, i18n.t('Link Address')),
                    h('input#mu-link-edit-href.link-edit-input.link-href-input', {
                        attrs: {
                            type: 'url',
                            'aria-label': i18n.t('Link Address'),
                        },
                        props: { value: this._draftHref },
                        on: {
                            input: (event: Event) => this._updateEditDraft('href', event),
                            keydown: (event: KeyboardEvent) => this._handleEditKeydown(event),
                        },
                    }),
                    h('button.link-edit-confirm', {
                        attrs: {
                            type: 'button',
                            disabled: !canConfirm,
                        },
                        on: { click: (event: Event) => this._commitLink(event) },
                    }, i18n.t('Confirm')),
                ]),
            ]);

            if (oldVNode)
                patch(oldVNode, vnode);
            else
                patch(linkContainer, vnode);
            this._oldVNode = vnode;
            requestAnimationFrame(() => {
                const input = this.container?.querySelector<HTMLInputElement>('.link-text-input');
                input?.focus();
                input?.select();
            });
            return;
        }

        const address = this._linkInfo?.href || this._linkInfo?.text || '';
        const topActions = this._icons.map(item => h(
            `li.item.${item.type}`,
            h(
                'button.action-button',
                {
                    attrs: {
                        type: 'button',
                        title: i18n.t(item.tooltip),
                        'aria-label': i18n.t(item.tooltip),
                    },
                    on: { click: (event: Event) => this.selectItem(event, item) },
                },
                h('span.icon-wrapper', renderActionIcon(item.actionIcon)),
            ),
        ));

        const addressNode = h(
                    'button.link-address',
                    {
                        attrs: {
                            type: 'button',
                            title: address,
                            'aria-label': address,
                        },
                        on: {
                            click: (event: Event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (this._linkInfo?.href)
                                    this.options.jumpClick?.(this._linkInfo);
                            },
                        },
                    },
                    h('span.link-address-text', address),
                );

        const viewMenu = this._viewMenuOpen ? this._createViewMenu() : null;
        const moreMenu = this._moreMenuOpen ? this._createMoreMenu() : null;
        const vnode = h(
            'div.link-toolbar',
            [
                addressNode,
                h('ul.link-actions', [
                    ...topActions,
                    ...(canChangeView ? [
                        h('li.link-divider'),
                        h(
                        `li.item.view-selector${this._viewMenuOpen ? '.open' : ''}`,
                        [
                            h(
                                'button.view-selector-button',
                                {
                                    attrs: {
                                        type: 'button',
                                        'aria-label': i18n.t(viewMode === 'link' ? 'Link View' : 'Title View'),
                                        'aria-expanded': String(this._viewMenuOpen),
                                    },
                                    on: {
                                        click: (event: Event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            this._moreMenuOpen = false;
                                            this._viewMenuOpen = !this._viewMenuOpen;
                                            this.render();
                                        },
                                    },
                                },
                                [
                                    h('span.view-mode-mark', renderActionIcon(viewMode === 'link' ? 'link-view' : 'title-view')),
                                    h('span.view-mode-label', i18n.t(viewMode === 'link' ? 'Link View' : 'Title View')),
                                    h('span.view-mode-chevron'),
                                ],
                            ),
                            ...(viewMenu ? [viewMenu] : []),
                        ],
                        ),
                    ] : []),
                    h('li.link-divider'),
                    h(
                        `li.item.more${this._moreMenuOpen ? '.open' : ''}`,
                        [
                            h(
                                'button.action-button.more-button',
                                {
                                    attrs: {
                                        type: 'button',
                                        'aria-label': i18n.t('More'),
                                        'aria-expanded': String(this._moreMenuOpen),
                                    },
                                    on: {
                                        click: (event: Event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            this._viewMenuOpen = false;
                                            this._moreMenuOpen = !this._moreMenuOpen;
                                            this.render();
                                        },
                                    },
                                },
                                h('span.more-grid', renderActionIcon('more')),
                            ),
                            ...(moreMenu ? [moreMenu] : []),
                        ],
                    ),
                ]),
            ],
        );

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(linkContainer, vnode);

        this._oldVNode = vnode;

    }

    private _createViewMenu(): VNode {
        const { i18n } = this.muya;
        const current = this._getViewMode();
        const modes = [
            { type: 'link', label: 'Link View', icon: 'link' },
            { type: 'title', label: 'Title View', icon: 'title' },
        ] as const;

        return h('div.link-view-menu', modes.map(mode => h(
            `button.link-menu-item.${mode.icon}${mode.type === current ? '.selected' : ''}`,
            {
                attrs: { type: 'button' },
                on: {
                    click: (event: Event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this._viewMenuOpen = false;
                        if (mode.type === current) {
                            this.render();
                            return;
                        }
                        void this._setViewMode(mode.type);
                    },
                },
            },
                [
                    h('span.link-menu-icon', renderActionIcon(mode.type === 'link' ? 'link-view' : 'title-view')),
                    h('span.link-menu-label', i18n.t(mode.label)),
                    ...(mode.type === current ? [h('span.link-menu-check', '✓')] : []),
                ],
            ),
        ));
    }

    private _canChangeView(): boolean {
        const info = this._linkInfo;
        const href = info?.href ?? '';
        if (!href || !info?.range || !this._linkBlock)
            return false;

        return info.text === href
            || Boolean(info.text && isUrlLikeLinkText(info.text, href))
            || this._linkBlock.isSmartLink(info.range, href)
            || (
                /^https?:\/\//i.test(href)
                && typeof this._linkBlock.text === 'string'
                && this._linkBlock.text.trim() === info.raw?.trim()
            );
    }

    private _getViewMode(): 'link' | 'title' {
        const info = this._linkInfo;
        const href = info?.href ?? '';
        if (!href || !info?.range || !this._linkBlock)
            return 'title';
        if (info.text && isUrlLikeLinkText(info.text, href))
            return 'link';
        if (this._linkBlock.isSmartLink(info.range, href)) {
            return this._linkBlock.isLinkView(info.range, href)
                ? 'link'
                : 'title';
        }

        return info.text === href ? 'link' : 'title';
    }

    private async _setViewMode(mode: 'link' | 'title'): Promise<void> {
        const info = this._linkInfo;
        const block = this._linkBlock;
        const href = info?.href ?? '';
        const range = info?.range;
        if (!block || !range || !href)
            return;
        const blockPath = Array.isArray(block.path) ? [...block.path] : null;

        if (mode === 'link') {
            block.setLinkView(range, href, true);
            this.hide();
            return;
        }

        if (info.text && info.text !== href && !isUrlLikeLinkText(info.text, href)) {
            block.setLinkView(range, href, false);
            this.hide();
            return;
        }

        this.hide();
        let title = '';
        let icon = '';
        try {
            const metadata = await this.muya.options.resolveLinkMetadata?.(href);
            title = metadata?.title ?? '';
            icon = metadata?.icon ?? '';
        }
        catch {
            title = '';
        }
        if (!title)
            title = await getPageTitle(href);
        if (title) {
            const resolvedBlock = blockPath
                ? this.muya.editor.scrollPage?.queryBlock([...blockPath])
                : null;
            const targetBlock = resolvedBlock?.isContent()
                ? resolvedBlock as Format
                : block;
            this._replaceLinkFor(targetBlock, info, title, href, 'title', icon);
        }
    }

    private _createMoreMenu(): VNode {
        const { i18n } = this.muya;
        const items = [
            { type: 'copy-link', label: 'Copy Link', icon: 'copy-link', actionIcon: 'copy-link' },
            { type: 'copy-original', label: 'Copy Original Web Link', icon: 'web', actionIcon: 'web-link' },
        ] as const;

        return h('div.link-more-menu', items.map(item => h(
            `button.link-menu-item.${item.icon}`,
            {
                attrs: { type: 'button' },
                on: {
                    click: (event: Event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const text = item.type === 'copy-link'
                            ? (this._linkInfo?.raw ?? '')
                            : (this._linkInfo?.href ?? '');
                        this._writeClipboardText(text);
                        this._moreMenuOpen = false;
                        this.render();
                    },
                },
            },
            [
                h('span.link-menu-icon', renderActionIcon(item.actionIcon)),
                h('span.link-menu-label', i18n.t(item.label)),
            ],
        )));
    }

    private _writeClipboardText(text: string): void {
        if (!text)
            return;
        const result = this.muya.options.clipboardWriteText?.(text)
            ?? navigator.clipboard?.writeText?.(text);
        if (result instanceof Promise)
            result.catch(() => {});
    }

    private _updateEditDraft(field: 'text' | 'href', event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        if (field === 'text')
            this._draftText = value;
        else
            this._draftHref = value;
        const button = this.container?.querySelector<HTMLButtonElement>('.link-edit-confirm');
        if (button)
            button.disabled = !(this._draftText.trim() && this._draftHref.trim());
    }

    private _handleEditKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter')
            this._commitLink(event);
        else if (event.key === 'Escape') {
            event.preventDefault();
            this._editing = false;
            this.render();
        }
    }

    private _commitLink(event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        const block = this._linkBlock;
        const info = this._linkInfo;
        const text = this._draftText.trim();
        const href = this._draftHref.trim();
        if (!block || !info?.range || !info.raw || !text || !href)
            return;

        this._replaceLink(text, href);
    }

    private _replaceLink(text: string, href: string, smartView?: 'title'): void {
        const block = this._linkBlock;
        const info = this._linkInfo;
        if (!block || !info?.range || !info.raw)
            return;

        this._replaceLinkFor(block, info, text, href, smartView);
    }

    private _replaceLinkFor(
        block: Format,
        info: ILinkInfo,
        text: string,
        href: string,
        smartView?: 'title',
        icon?: string,
    ): void {
        if (!info.range || !info.raw)
            return;

        const nextRaw = `[${text}](${href})`;
        block.text = `${block.text.slice(0, info.range.start)}${nextRaw}${block.text.slice(info.range.end)}`;
        if (smartView) {
            block.setLinkView(
                { start: info.range.start, end: info.range.start + nextRaw.length },
                href,
                false,
                icon,
            );
        }
        block.setCursor(info.range.start + nextRaw.length, info.range.start + nextRaw.length, true);
        this.muya.flush?.();
        this.muya.eventCenter.emit('content-change', { block });
        this.hide();
    }

    selectItem(event: Event, item: LinkToolIcon) {
        event.preventDefault();
        event.stopPropagation();
        switch (item.type) {
            case 'edit':
                this._editing = true;
                this._draftText = this._linkInfo?.text ?? '';
                this._draftHref = this._linkInfo?.href ?? '';
                this._viewMenuOpen = false;
                this._moreMenuOpen = false;
                this.render();
                break;

            case 'unlink': {
                const block = this._linkBlock;
                const linkInfo = this._linkInfo;
                if (block && linkInfo && linkInfo.range) {
                    block.unlink({
                        range: linkInfo.range,
                        text: linkInfo.text ?? '',
                    });
                }
                this.hide();
                break;
            }

        }
    }
}

export default LinkTools;
