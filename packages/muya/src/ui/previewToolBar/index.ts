import type { VNode } from 'snabbdom';
import type HTMLBlock from '../../block/commonMark/html';
import type MathBlock from '../../block/extra/math';
import type { Muya } from '../../index';
import { ScrollPage } from '../../block/scrollPage';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isMouseEvent, throttle } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import { renderActionIcon } from '../actionIcons';
import BaseFloat from '../baseFloat';
import ICONS from './config';
import '../actionIcons.css';
import '../tooltip/index.css';

import './index.css';

const defaultOptions = {
    placement: 'right-start' as const,
    offsetOptions: {
        mainAxis: -95,
        crossAxis: 5,
        alignmentAxis: 0,
    },
    showArrow: false,
};

export class PreviewToolBar extends BaseFloat {
    static pluginName = 'previewTools';
    private _oldVNode: VNode | null = null;
    private _block: HTMLBlock | MathBlock | null = null;
    private _iconContainer: HTMLDivElement = document.createElement('div');

    constructor(muya: Muya, options = {}) {
        const name = 'mu-preview-tools';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        this.options = opts;
        this.container?.appendChild(this._iconContainer);
        this.floatBox?.classList.add('mu-preview-tools-container');
        this.listen();
    }

    override listen() {
        const { eventCenter } = this.muya;
        super.listen();

        const handler = throttle((event: Event) => {
            if (!isMouseEvent(event))
                return;

            const { x, y } = event;
            const eles = [...document.elementsFromPoint(x, y)];
            const container = [...eles].find(
                ele =>
                    ele[BLOCK_DOM_PROPERTY]
                    && /html-block|math-block/.test((ele[BLOCK_DOM_PROPERTY] as HTMLBlock).blockName),
            );
            if (container && !(container[BLOCK_DOM_PROPERTY] as HTMLBlock).active) {
                const block = container[BLOCK_DOM_PROPERTY] as HTMLBlock;
                if (block.blockName === 'html-block' && this.muya.options.disableHtml)
                    return this.hide();

                this._block = block;
                this.show(container);
                this.render();
            }
            else {
                this.hide();
            }
        }, 300);

        eventCenter.attachDOMEvent(document.body, 'mousemove', handler);
    }

    render() {
        const { _iconContainer: iconContainer, _oldVNode: oldVNode } = this;
        const { i18n } = this.muya;
        const children = ICONS.map((i) => {
            const iconWrapperSelector = 'div.icon-wrapper';
            const iconWrapper = h(
                iconWrapperSelector,
                renderActionIcon(i.type === 'delete' ? 'delete' : 'edit'),
            );

            const itemSelector = `li.item.${i.type}.mu-icon-tooltip`;

            return h(
                itemSelector,
                {
                    attrs: {
                        'aria-label': i18n.t(i.tooltip),
                        'data-tooltip': i18n.t(i.tooltip),
                    },
                    on: {
                        click: (event) => {
                            this.selectItem(event, i);
                        },
                    },
                },
                [iconWrapper],
            );
        });

        const vnode = h('ul', children);

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(iconContainer, vnode);

        this._oldVNode = vnode;
    }

    selectItem(event: Event, i: typeof ICONS[number]) {
        event.preventDefault();
        const { _block: block } = this;
        let cursorBlock = null;
        switch (i.type) {
            case 'edit': {
                cursorBlock = block!.firstContentInDescendant();
                break;
            }

            case 'delete': {
                const state = {
                    name: 'paragraph',
                    text: '',
                };

                const newBlock = ScrollPage.loadBlock('paragraph').create(
                    this.muya,
                    state,
                );
                block!.replaceWith(newBlock);
                cursorBlock = newBlock.firstContentInDescendant();
                break;
            }
        }

        if (cursorBlock)
            cursorBlock.setCursor(0, 0);

        this.hide();
    }
}
