import { describe, expect, it } from 'vitest';
import { getImageWidthSnap, redistributeImageWidths } from '../index';

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

describe('image row resizing', () => {
    it('trades width between two neighbors and keeps the rest of the row stable', () => {
        expect(redistributeImageWidths([250, 200, 150], 0, 1, 65)).toEqual([315, 135, 150]);
        expect(redistributeImageWidths([250, 200, 150], 1, 0, 300)).toEqual([50, 400, 150]);
    });

    it('keeps a narrow neighbor stable until the pointer actually moves it', () => {
        expect(redistributeImageWidths([20, 100], 0, 1, 0)).toEqual([20, 100]);
        expect(redistributeImageWidths([20, 100], 0, 1, 80)).toEqual([70, 50]);
    });
});
