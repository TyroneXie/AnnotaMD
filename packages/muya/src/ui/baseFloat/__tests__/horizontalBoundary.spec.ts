import { describe, expect, it } from 'vitest';
import { boundaryClipPath, clampFloatXToBoundary } from '../index';

describe('baseFloat horizontal scroll-container boundary', () => {
    const boundary = { left: 120, right: 920 };

    it('moves a float right when it would cross the left edge', () => {
        expect(clampFloatXToBoundary(40, 320, boundary)).toBe(128);
    });

    it('moves a float left when it would cross the right edge', () => {
        expect(clampFloatXToBoundary(760, 320, boundary)).toBe(592);
    });

    it('keeps an already-contained float in place', () => {
        expect(clampFloatXToBoundary(300, 320, boundary)).toBe(300);
    });

    it('does not clip menus or tooltips when the float is already inside the boundary', () => {
        expect(boundaryClipPath(0, 0, 0, 0)).toBe('inset(0px 0px 0px 0px)');
        expect(boundaryClipPath(4, 0, 0, 0)).toBe('inset(4px 0px 0px 0px)');
        expect(boundaryClipPath(4, -12, -80, -8)).toBe('inset(4px -12px -80px -8px)');
    });
});
