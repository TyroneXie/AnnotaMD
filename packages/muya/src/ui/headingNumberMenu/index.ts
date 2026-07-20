import type { VNode } from 'snabbdom';
import type AtxHeadingContent from '../../block/content/atxHeadingContent';
import type { Muya } from '../../muya';
import type { IBaseOptions } from '../types';
import { isHTMLInputElement } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import { renderActionIcon, type ActionIconName } from '../actionIcons';
import BaseFloat from '../baseFloat';

import './index.css';

interface IHeadingNumberMenuPayload {
    block: AtxHeadingContent;
    reference: HTMLElement;
}

const defaultOptions: IBaseOptions = {
    placement: 'bottom-start',
    offsetOptions: {
        mainAxis: 6,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

export class HeadingNumberMenu extends BaseFloat {
    static pluginName = 'headingNumberMenu';

    private _block: AtxHeadingContent | null = null;
    private _reference: HTMLElement | null = null;
    private _editingValue = false;
    private _oldVNode: VNode | null = null;
    private _toolContainer: HTMLDivElement = document.createElement('div');
    private _valueText = '';
    private _valueError = false;

    constructor(muya: Muya, options: Partial<IBaseOptions> = {}) {
        super(muya, 'mu-heading-number-menu', Object.assign({}, defaultOptions, options));
        this.container!.appendChild(this._toolContainer);
        this.floatBox!.classList.add('mu-heading-number-menu-wrapper');
        this.listen();
    }

    override listen() {
        super.listen();
        this.muya.eventCenter.subscribe(
            'muya-heading-number-menu',
            ((payload: IHeadingNumberMenuPayload) => this._open(payload)) as (...args: unknown[]) => void,
        );
    }

    private _open({ block, reference }: IHeadingNumberMenuPayload) {
        const state = block.getHeadingNumberMenuState();
        if (!state) {
            this.hide();
            return;
        }

        if (this.status && this._block === block) {
            this.hide();
            return;
        }

        this._reference?.classList.remove('menu-open');
        this._block = block;
        this._reference = reference;
        reference.classList.add('menu-open');
        this._editingValue = false;
        this._valueError = false;
        this._valueText = String(state.value);
        this._render();
        super.show(reference);
    }

    private _render() {
        const vnode = h(
            'div.mu-heading-number-menu-panel',
            this._editingValue ? this._renderValueEditor() : this._renderCommands(),
        );
        patch(this._oldVNode || this._toolContainer, vnode);
        this._oldVNode = vnode;
    }

    private _renderCommands(): VNode[] {
        const state = this._block?.getHeadingNumberMenuState();
        if (!state)
            return [];

        return [
            this._command(
                'continue',
                this.muya.i18n.t('Continue Heading Numbering'),
                !state.canContinue,
                () => state.continuation && this._apply(state.continuation),
            ),
            this._command(
                'restart',
                this.muya.i18n.t('Restart Numbering'),
                !state.canRestart,
                () => this._apply(state.restart),
            ),
            this._command(
                'set-value',
                this.muya.i18n.t('Set Number Value'),
                false,
                () => this._showValueEditor(),
            ),
        ];
    }

    private _command(
        icon: 'continue' | 'restart' | 'set-value',
        label: string,
        disabled: boolean,
        select: () => void,
    ) {
        return h(
            `button.mu-heading-number-menu-item.${icon}`,
            {
                attrs: { type: 'button' },
                props: { disabled },
                on: {
                    click: (event: MouseEvent) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!disabled)
                            select();
                    },
                },
            },
            [
                h(
                    `span.mu-heading-number-command-icon.${icon}`,
                    { attrs: { 'aria-hidden': 'true' } },
                    renderActionIcon(`heading-number-${icon === 'set-value' ? 'set' : icon}` as ActionIconName),
                ),
                h('span.mu-heading-number-command-label', label),
            ],
        );
    }

    private _showValueEditor() {
        const state = this._block?.getHeadingNumberMenuState();
        if (!state)
            return;
        this._editingValue = true;
        this._valueError = false;
        this._valueText = String(state.value);
        this._render();
        requestAnimationFrame(() => {
            const input = this.container?.querySelector<HTMLInputElement>('.mu-heading-number-value-input');
            input?.focus();
            input?.select();
        });
    }

    private _renderValueEditor(): VNode[] {
        return [
            h('label.mu-heading-number-value-label', this.muya.i18n.t('Number Value')),
            h('input.mu-heading-number-value-input', {
                class: { error: this._valueError },
                attrs: {
                    'aria-label': this.muya.i18n.t('Number Value'),
                    'inputmode': 'numeric',
                    'type': 'text',
                },
                props: { value: this._valueText },
                on: {
                    input: (event: InputEvent) => {
                        if (isHTMLInputElement(event.target))
                            this._valueText = event.target.value;
                        this._valueError = false;
                    },
                    keydown: (event: KeyboardEvent) => {
                        if (event.key === 'Enter')
                            this._confirmValue();
                        else if (event.key === 'Escape') {
                            this._editingValue = false;
                            this._render();
                        }
                    },
                },
            }),
            h('div.mu-heading-number-value-actions', [
                h('button.cancel', {
                    attrs: { type: 'button' },
                    on: { click: () => {
                        this._editingValue = false;
                        this._render();
                    } },
                }, this.muya.i18n.t('Cancel')),
                h('button.confirm', {
                    attrs: { type: 'button' },
                    on: { click: () => this._confirmValue() },
                }, this.muya.i18n.t('Confirm')),
            ]),
        ];
    }

    private _confirmValue() {
        if (!/^[1-9]\d*$/.test(this._valueText)) {
            this._valueError = true;
            this._render();
            return;
        }

        this._block?.setHeadingNumberValue(Number(this._valueText));
        this.hide();
    }

    private _apply(marker: string) {
        this._block?.setHeadingNumber(marker);
        this.hide();
    }

    override hide() {
        super.hide();
        this._reference?.classList.remove('menu-open');
        this._reference = null;
        this._block = null;
        this._editingValue = false;
    }
}
