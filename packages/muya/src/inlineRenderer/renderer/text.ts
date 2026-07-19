import type { ISyntaxRenderOptions } from '../types';
import type Renderer from './index';
import { parseAtxHeadingNumber } from '../../utils/headingNumber';

// render token of text type to vnode.
export default function text(
    this: Renderer,
    { h, block, token }: ISyntaxRenderOptions,
) {
    const { start, end } = token.range;
    const headingNumber = block.blockName === 'atxheading.content'
        ? parseAtxHeadingNumber(block.text)
        : null;

    if (
        headingNumber
        && start <= headingNumber.markerStart
        && end >= headingNumber.gapEnd
    ) {
        const nodes = [];

        if (start < headingNumber.markerStart) {
            nodes.push(h(
                'span.mu-plain-text',
                this.highlight(h, block, start, headingNumber.markerStart, token),
            ));
        }

        nodes.push(h(
            'span.mu-heading-number',
            {
                attrs: {
                    'aria-label': this.muya.i18n.t('Set Number'),
                    'data-tooltip': this.muya.i18n.t('Set Number'),
                    'role': 'button',
                    'tabindex': '0',
                },
            },
            this.highlight(
                h,
                block,
                headingNumber.markerStart,
                headingNumber.markerEnd,
                token,
            ),
        ));
        nodes.push(h(
            'span.mu-heading-number-gap',
            this.highlight(
                h,
                block,
                headingNumber.markerEnd,
                headingNumber.gapEnd,
                token,
            ),
        ));

        if (headingNumber.gapEnd < end) {
            nodes.push(h(
                'span.mu-plain-text',
                this.highlight(h, block, headingNumber.gapEnd, end, token),
            ));
        }

        return nodes;
    }

    return [h('span.mu-plain-text', this.highlight(h, block, start, end, token))];
}
