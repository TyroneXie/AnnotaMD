import { describe, expect, it } from 'vitest';
import { getImageWidthSnap } from '../index';

describe('image resize full-width snap', () => {
    it('shows a guide before the image reaches the content edge', () => {
        expect(getImageWidthSnap(770, 800)).toEqual({
            showGuide: true,
            width: 770,
        });
        expect(getImageWidthSnap(760, 800)).toEqual({
            showGuide: false,
            width: 760,
        });
    });

    it('snaps to content width and never grows beyond it', () => {
        expect(getImageWidthSnap(790, 800)).toEqual({
            showGuide: true,
            width: 800,
        });
        expect(getImageWidthSnap(840, 800)).toEqual({
            showGuide: true,
            width: 800,
        });
    });
});
