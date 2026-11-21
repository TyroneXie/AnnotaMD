// @vitest-environment happy-dom

import type { Muya } from '../../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EventCenter from '../../../event';
import { ImageResizeBar } from '../index';

vi.mock('@floating-ui/dom', () => ({
    autoUpdate: vi.fn(() => () => {}),
}));

describe('image resize lifecycle', () => {
    let eventCenter: EventCenter;
    let host: HTMLDivElement;
    let resizeBar: ImageResizeBar;

    beforeEach(() => {
        vi.useFakeTimers();
        eventCenter = new EventCenter();
        host = document.createElement('div');
        document.body.appendChild(host);
        resizeBar = new ImageResizeBar({
            domNode: host,
            eventCenter,
        } as unknown as Muya);
    });

    afterEach(() => {
        resizeBar.destroy();
        eventCenter.detachAllDomEvents();
        host.remove();
        vi.useRealTimers();
    });

    it('ignores a delayed render after its image reference was cleared', () => {
        const reference = document.createElement('span');
        reference.appendChild(document.createElement('img'));
        host.appendChild(reference);

        eventCenter.emit('muya-transformer', {
            block: {},
            imageInfo: {},
            reference,
        });
        eventCenter.emit('muya-transformer', { reference: null });

        expect(() => vi.runAllTimers()).not.toThrow();
        expect(document.querySelector('.mu-transformer')?.childElementCount).toBe(0);
    });

    it('keeps the active pointer when hover changes and restores the width on cancel', () => {
        const reference = document.createElement('span');
        const image = document.createElement('img');
        image.setAttribute('width', '120');
        vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
            bottom: 160,
            height: 80,
            left: 100,
            right: 220,
            top: 80,
            width: 120,
            x: 100,
            y: 80,
            toJSON: () => ({}),
        });
        vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
        reference.appendChild(image);
        host.appendChild(reference);
        const updateImage = vi.fn();

        eventCenter.emit('muya-transformer', {
            block: { updateImage },
            imageInfo: {},
            reference,
        });
        vi.runAllTimers();

        const handle = document.querySelector<HTMLElement>('.mu-transformer .bottom-right')!;
        const setPointerCapture = vi.fn();
        const releasePointerCapture = vi.fn();
        Object.assign(handle, { setPointerCapture, hasPointerCapture: () => true, releasePointerCapture });
        handle.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            pointerId: 1,
            clientX: 220,
            clientY: 160,
        }));
        expect(setPointerCapture).toHaveBeenCalledWith(1);

        eventCenter.emit('muya-transformer', { reference: null });
        eventCenter.emit('muya-transformer', { reference, block: {}, imageInfo: {} });
        vi.runAllTimers();
        expect(handle.isConnected).toBe(true);
        handle.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            clientX: 190,
            clientY: 160,
        }));
        expect(image.getAttribute('width')).toBe('90');
        expect(updateImage).not.toHaveBeenCalled();

        handle.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));

        expect(releasePointerCapture).toHaveBeenCalledWith(1);
        expect(handle.isConnected).toBe(false);
        expect(image.getAttribute('width')).toBe('120');
        expect(updateImage).not.toHaveBeenCalled();
    });
});
