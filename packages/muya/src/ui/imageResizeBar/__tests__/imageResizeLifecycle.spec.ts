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
        } as Muya);
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

    it('cancels document drag listeners when the image controls are hidden', () => {
        const reference = document.createElement('span');
        const image = document.createElement('img');
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
        reference.appendChild(image);
        host.appendChild(reference);

        eventCenter.emit('muya-transformer', {
            block: {},
            imageInfo: {},
            reference,
        });
        vi.runAllTimers();

        const handle = document.querySelector<HTMLElement>('.mu-transformer .bottom-right');
        expect(handle).not.toBeNull();
        handle!.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            clientX: 220,
            clientY: 160,
        }));
        expect(eventCenter.events.filter(({ event }) =>
            event === 'mousemove' || event === 'mouseup')).toHaveLength(2);

        eventCenter.emit('muya-transformer', { reference: null });

        expect(eventCenter.events.filter(({ event }) =>
            event === 'mousemove' || event === 'mouseup')).toHaveLength(0);
        expect(() => document.body.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 240,
            clientY: 160,
        }))).not.toThrow();
    });
});
