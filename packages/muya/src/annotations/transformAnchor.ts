import type { JSONOp, Path } from 'ot-json1';
import { type as json1 } from 'ot-json1';
import diff from 'fast-diff';

export interface IAnnotationPoint {
    path: Path;
    offset: number;
}

const readTextAtPath = (doc: unknown, path: Path): string | null => {
    let value = doc;
    for (const segment of path) {
        if (value == null || (typeof value !== 'object' && !Array.isArray(value)))
            return null;
        value = (value as Record<string | number, unknown>)[segment];
    }
    return typeof value === 'string' ? value : null;
};

interface TextLeaf {
    path: Path;
    text: string;
    start: number;
    end: number;
}

const flattenTextLeaves = (doc: unknown): { text: string; leaves: TextLeaf[] } => {
    const leaves: TextLeaf[] = [];
    const parts: string[] = [];
    let position = 0;

    const visit = (value: unknown, path: Path): void => {
        if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, [...path, index]));
            return;
        }
        if (value == null || typeof value !== 'object')
            return;
        for (const [key, child] of Object.entries(value)) {
            const childPath = [...path, key];
            if (key === 'text' && typeof child === 'string') {
                if (parts.length) {
                    parts.push('\n');
                    position += 1;
                }
                leaves.push({
                    path: childPath,
                    text: child,
                    start: position,
                    end: position + child.length,
                });
                parts.push(child);
                position += child.length;
            }
            else visit(child, childPath);
        }
    };

    visit(doc, []);
    return { text: parts.join(''), leaves };
};

const pathsEqual = (first: Path, second: Path): boolean =>
    first.length === second.length && first.every((segment, index) => segment === second[index]);

export type AnnotationAffinity = 'left' | 'right';

const mapUtf16Offset = (
    previousText: string,
    nextText: string,
    offset: number,
    affinity: AnnotationAffinity,
): number => {
    let previousOffset = 0;
    let nextOffset = 0;

    for (const [kind, text] of diff(previousText, nextText)) {
        if (kind === diff.INSERT) {
            if (previousOffset === offset && affinity === 'left')
                return nextOffset;
            nextOffset += text.length;
            continue;
        }

        if (kind === diff.DELETE) {
            if (offset <= previousOffset + text.length)
                return nextOffset;
            previousOffset += text.length;
            continue;
        }

        const equalEnd = previousOffset + text.length;
        if (offset < equalEnd || (offset === equalEnd && affinity === 'left'))
            return nextOffset + offset - previousOffset;
        previousOffset += text.length;
        nextOffset += text.length;
    }

    return nextOffset;
};

/**
 * Move an annotation endpoint through the same JSON OT operation that updates
 * the Muya document. The point path addresses a text leaf (for example
 * `[3, 'text']`) and the offset addresses a Unicode code point inside it.
 *
 * `ot-json1.transformPosition` is deliberately used here instead of searching
 * for the selected quote. It follows list insertions, removals and moves as
 * well as the embedded `text-unicode` edit, so repeated text is irrelevant.
 */
export function transformAnnotationPoint(
    point: IAnnotationPoint,
    operation: JSONOp,
): IAnnotationPoint | null {
    if (operation == null)
        return { path: [...point.path], offset: point.offset };

    const transformed = json1.transformPosition(
        [...point.path, point.offset],
        operation,
    );
    if (!transformed?.length)
        return null;

    const offset = transformed.at(-1);
    if (typeof offset !== 'number')
        return null;

    return {
        path: transformed.slice(0, -1),
        offset,
    };
}

/**
 * Renderer DOM selections expose UTF-16 offsets, while `text-unicode` and
 * `transformPosition` use Unicode code-point offsets. Convert on both sides of
 * the OT operation so anchors remain exact around emoji and astral symbols.
 */
export function transformAnnotationPointUtf16(
    point: IAnnotationPoint,
    operation: JSONOp,
    previousDocument: unknown,
    nextDocument: unknown,
    affinity: AnnotationAffinity = 'left',
): IAnnotationPoint | null {
    const previousText = readTextAtPath(previousDocument, point.path);
    if (previousText == null)
        return null;

    const transformedPath = json1.transformPosition(point.path, operation);
    if (!transformedPath)
        return null;

    const nextText = readTextAtPath(nextDocument, transformedPath);
    if (nextText == null)
        return null;

    return {
        path: transformedPath,
        offset: mapUtf16Offset(previousText, nextText, point.offset, affinity),
    };
}

/**
 * Map an endpoint across a full document replacement (source mode or an
 * external file reload). This uses the ordered text-leaf stream rather than a
 * quote search, so equal quotes in different blocks are not interchangeable.
 */
export function mapAnnotationPointBetweenDocumentsUtf16(
    point: IAnnotationPoint,
    previousDocument: unknown,
    nextDocument: unknown,
    affinity: AnnotationAffinity = 'left',
): IAnnotationPoint | null {
    const previous = flattenTextLeaves(previousDocument);
    const next = flattenTextLeaves(nextDocument);
    const previousLeaf = previous.leaves.find((leaf) => pathsEqual(leaf.path, point.path));
    if (!previousLeaf || point.offset < 0 || point.offset > previousLeaf.text.length)
        return null;

    // A full replacement has no persistent block ids. If an identical text
    // leaf was added or removed, a diff can choose either occurrence and still
    // round-trip numerically. Refuse that ambiguous mapping instead of moving a
    // comment to the wrong duplicate. In-editor moves do not take this path;
    // they are tracked exactly by JSON OT above.
    if (previousLeaf.text) {
        const previousOccurrences = previous.leaves.filter(
            leaf => leaf.text === previousLeaf.text,
        ).length;
        const nextOccurrences = next.leaves.filter(
            leaf => leaf.text === previousLeaf.text,
        ).length;
        if (previousOccurrences !== nextOccurrences
            && (previousOccurrences > 1 || nextOccurrences > 1))
            return null;
    }

    const absoluteOffset = previousLeaf.start + point.offset;
    const nextAbsoluteOffset = mapUtf16Offset(
        previous.text,
        next.text,
        absoluteOffset,
        affinity,
    );
    const nextLeaf = next.leaves.find((leaf) => (
        nextAbsoluteOffset > leaf.start && nextAbsoluteOffset < leaf.end
    ) || (
        nextAbsoluteOffset === leaf.start && affinity === 'right'
    ) || (
        nextAbsoluteOffset === leaf.end
    ));
    if (!nextLeaf)
        return null;

    return {
        path: nextLeaf.path,
        offset: nextAbsoluteOffset - nextLeaf.start,
    };
}
