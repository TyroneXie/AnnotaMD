import { describe, expect, it } from 'vitest';
import { sliceInlineMarkdown } from '../inlineSlice';

// Copying a selection must never emit half of an inline marker pair. The
// editor hides `**`/`*`/`~~` markers in zero-size `.mu-hide` spans, so DOM
// selection endpoints routinely land on one side of a pair only: a drag stops
// at the last visible character (closing marker outside), and an element-level
// endpoint at the block start sits before the opening marker.

const BOLD = '**Hermes 怎么修、怎么验收**';

describe('sliceInlineMarkdown — marker balance', () => {
    it('keeps both markers when the visible content is covered in full', () => {
        // The reported case: select the whole bold line, ending at its last
        // visible character — the closing `**` is unreachable by dragging.
        expect(sliceInlineMarkdown(BOLD, undefined, 0, BOLD.length - 2)).toBe(BOLD);
    });

    it('keeps both markers when only the content nodes are selected', () => {
        expect(sliceInlineMarkdown(BOLD, undefined, 2, BOLD.length - 2)).toBe(BOLD);
    });

    it('returns the whole block for a full-block range', () => {
        expect(sliceInlineMarkdown(BOLD, undefined, 0, BOLD.length)).toBe(BOLD);
    });

    it('drops a lone opening marker when the selection ends inside the content', () => {
        // `**Her` — the closing twin is outside the selection, so the opening
        // `**` must go rather than be copied alone.
        expect(sliceInlineMarkdown(BOLD, undefined, 0, 5)).toBe('Her');
    });

    it('drops a lone closing marker when the selection starts inside the content', () => {
        expect(sliceInlineMarkdown(BOLD, undefined, 5, BOLD.length - 2)).toBe('mes 怎么修、怎么验收');
    });

    it('keeps a partial content slice plain', () => {
        expect(sliceInlineMarkdown(BOLD, undefined, 5, 9)).toBe('mes ');
    });

    it('strips a marker pair the slice cuts in half mid-sentence', () => {
        const text = 'foo **bold** bar';
        // Starts before the run, ends inside its content: the opening `**` is
        // inside the slice while its twin is not.
        expect(sliceInlineMarkdown(text, undefined, 0, 9)).toBe('foo bol');
        // Symmetric: starts inside the content, ends past the run.
        expect(sliceInlineMarkdown(text, undefined, 7, text.length)).toBe('old bar');
    });

    it('handles emphasis, deletion and inline code', () => {
        expect(sliceInlineMarkdown('a *b* c', undefined, 2, 5)).toBe('*b*');
        expect(sliceInlineMarkdown('a ~~b~~ c', undefined, 2, 5)).toBe('~~b~~');
        expect(sliceInlineMarkdown('a `b` c', undefined, 2, 5)).toBe('`b`');
    });

    it('drops a marker pair when the selection holds only its delimiter', () => {
        // `*` with no content character selected carries no text.
        expect(sliceInlineMarkdown('a *b* c', undefined, 2, 3)).toBe('');
    });

    it('keeps the inner pair when a nested run is fully inside the slice', () => {
        expect(sliceInlineMarkdown('**a *b* c**', undefined, 0, 7)).toBe('a *b*');
    });

    it('returns an empty string for a collapsed or inverted range', () => {
        expect(sliceInlineMarkdown(BOLD, undefined, 5, 5)).toBe('');
        expect(sliceInlineMarkdown(BOLD, undefined, 9, 4)).toBe('');
    });

    it('clamps out-of-range offsets to the block text', () => {
        expect(sliceInlineMarkdown('plain', undefined, -3, 99)).toBe('plain');
    });
});
