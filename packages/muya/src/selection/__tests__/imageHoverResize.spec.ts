// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { BLOCK_DOM_PROPERTY } from '../../config';
import ImageSelection from '../ImageSelection';

describe('image hover resize affordance', () => {
    it('attaches the transformer to the visible image container on hover', () => {
        const emit = vi.fn();
        const attachDOMEvent = vi.fn((target, type, handler) => {
            target.addEventListener(type, handler);
            return `${type}`;
        });
        const domNode = document.createElement('div');
        const content = document.createElement('span');
        const wrapper = document.createElement('span');
        const container = document.createElement('span');
        const image = document.createElement('img');
        content.className = 'mu-content';
        wrapper.className = 'mu-inline-image';
        container.className = 'mu-image-container';
        wrapper.dataset.raw = '![alt](image.png)';
        Object.assign(content, { [BLOCK_DOM_PROPERTY]: {} });
        container.appendChild(image);
        wrapper.appendChild(container);
        content.appendChild(wrapper);
        domNode.appendChild(content);
        document.body.appendChild(domNode);

        const muya = {
            domNode,
            eventCenter: { attachDOMEvent, emit },
        } as any;
        const selection = { selectImage: vi.fn() } as any;
        new ImageSelection(muya, selection).attach();

        image.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        expect(emit).toHaveBeenCalledWith('muya-transformer', expect.objectContaining({
            reference: container,
        }));

        const transformer = document.createElement('div');
        const corner = document.createElement('div');
        transformer.className = 'mu-transformer';
        corner.className = 'bar top-left';
        transformer.appendChild(corner);
        document.body.appendChild(transformer);
        emit.mockClear();

        image.dispatchEvent(new MouseEvent('mouseout', {
            bubbles: true,
            relatedTarget: corner,
        }));
        expect(emit).not.toHaveBeenCalledWith('muya-transformer', { reference: null });

        image.dispatchEvent(new MouseEvent('mouseout', {
            bubbles: true,
            relatedTarget: document.body,
        }));
        expect(emit).toHaveBeenCalledWith('muya-transformer', { reference: null });
    });
});
