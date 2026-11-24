import type { ITokenizerFacOptions, Token } from '../inlineRenderer/types';
import { tokenizer } from '../inlineRenderer/lexer';

// Inline formats whose source is one symmetric marker pair around visible
// content: `**bold**`, `_em_`, `~~del~~`, `` `code` ``, `$math$`, `^sup^`
// and `:emoji:`.
interface IMarkerRange {
    outerStart: number;
    outerEnd: number;
    innerStart: number;
    innerEnd: number;
}

// Marker characters of the formats handled below. A block holding none of
// them cannot contain one of those pairs, so the common plain-text copy skips
// the tokenizer entirely (it reaches for DOM APIs).
const MARKER_HINT = /[*_~`$^:]/;

// One marker's length, or null for a token that is not a symmetric pair.
function markerLengthOf(token: Token): number | null {
    switch (token.type) {
        case 'strong':
        case 'em':
        case 'del':
        case 'inline_code':
        case 'inline_math':
        case 'emoji':
        case 'super_sub_script':
            return token.marker.length;

        default:
            return null;
    }
}

function collectMarkerRanges(tokens: Token[], out: IMarkerRange[]): void {
    for (const token of tokens) {
        const markerLength = markerLengthOf(token);
        const { start, end } = token.range;

        if (markerLength && end - start > markerLength * 2) {
            out.push({
                outerStart: start,
                outerEnd: end,
                innerStart: start + markerLength,
                innerEnd: end - markerLength,
            });
        }

        if ('children' in token && Array.isArray(token.children))
            collectMarkerRanges(token.children, out);
    }
}

// Snap the slice outward onto marker pairs whose visible content it covers in
// full, and inward when a boundary only grazes a marker. Outermost pairs run
// first: an enclosing pair decides the slice and the nested ones refine what
// is left.
function snapToMarkerBounds(
    ranges: IMarkerRange[],
    begin: number,
    end: number,
): [number, number] {
    let [start, finish] = [begin, end];

    for (const range of ranges) {
        if (range.outerEnd <= start || range.outerStart >= finish)
            continue;

        if (start <= range.innerStart && finish >= range.innerEnd) {
            start = Math.min(start, range.outerStart);
            finish = Math.max(finish, range.outerEnd);

            continue;
        }

        if (start >= range.outerStart && start <= range.innerStart)
            start = range.innerStart;

        if (finish >= range.innerEnd && finish <= range.outerEnd)
            finish = range.innerEnd;
    }

    return [start, finish];
}

// Drop the marker characters of any pair the slice cuts in half. Without this
// a selection that starts before a bold run and ends inside it emits the
// opening `**` alone, which pastes back as literal asterisks.
function stripSplitMarkers(
    text: string,
    ranges: IMarkerRange[],
    start: number,
    finish: number,
): string {
    const removals: [number, number][] = [];

    for (const range of ranges) {
        if (range.outerEnd <= start || range.outerStart >= finish)
            continue;

        // A wholly selected pair keeps both of its markers.
        if (start <= range.outerStart && finish >= range.outerEnd)
            continue;

        for (const [from, to] of [
            [range.outerStart, range.innerStart],
            [range.innerEnd, range.outerEnd],
        ] as const) {
            const cutFrom = Math.max(from, start);
            const cutTo = Math.min(to, finish);

            if (cutTo > cutFrom)
                removals.push([cutFrom, cutTo]);
        }
    }

    if (removals.length === 0)
        return text.slice(start, finish);

    removals.sort((a, b) => a[0] - b[0]);

    let result = '';
    let cursor = start;

    for (const [from, to] of removals) {
        if (from > cursor)
            result += text.slice(cursor, from);

        cursor = Math.max(cursor, to);
    }

    return result + text.slice(cursor, finish);
}

/**
 * Slice one block's raw text to `[begin, end)` for the clipboard.
 *
 * The editor renders inline markers as zero-size `.mu-hide` spans, so a DOM
 * selection can take in the opening `**` of a bold run while its closing twin
 * stays unreachable — a mouse drag stops at the last visible character, and an
 * element-level endpoint at the block start resolves to child index 0, i.e.
 * before the opening marker. Slicing the raw text verbatim then copies
 * `**Hermes 怎么修、怎么验收` instead of `**Hermes 怎么修、怎么验收**`.
 *
 * The slice therefore follows the visible selection: a pair whose content is
 * selected in full keeps both markers, and a pair the slice cuts in half
 * contributes only its text.
 */
export function sliceInlineMarkdown(
    text: string,
    options: ITokenizerFacOptions | undefined,
    begin: number,
    end: number,
): string {
    const from = Math.max(0, Math.min(begin, text.length));
    const to = Math.max(from, Math.min(end, text.length));

    if (from >= to)
        return '';

    if (!MARKER_HINT.test(text))
        return text.slice(from, to);

    const ranges: IMarkerRange[] = [];
    collectMarkerRanges(tokenizer(text, { options }), ranges);
    ranges.sort(
        (a, b) => (b.outerEnd - b.outerStart) - (a.outerEnd - a.outerStart),
    );

    const [start, finish] = snapToMarkerBounds(ranges, from, to);

    return stripSplitMarkers(text, ranges, start, finish);
}
