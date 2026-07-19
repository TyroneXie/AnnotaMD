export interface HeadingNumberMatch {
    gapEnd: number;
    marker: string;
    markerEnd: number;
    markerStart: number;
}

export interface PreviousHeadingNumber {
    level: number;
    marker: string | null;
}

const ATX_HEADING_NUMBER = /^( {0,3}#{1,6}[ \t]+)(\d+(?:[.。．]\d+)*[.。．])([ \t]+)/;

export function normalizeHeadingNumber(marker: string): string {
    return `${marker.match(/\d+/g)?.join('.') ?? ''}.`;
}

export function parseAtxHeadingNumber(text: string): HeadingNumberMatch | null {
    const match = ATX_HEADING_NUMBER.exec(text);
    if (!match)
        return null;

    const markerStart = match[1].length;
    const markerEnd = markerStart + match[2].length;

    return {
        marker: match[2],
        markerStart,
        markerEnd,
        gapEnd: match[0].length,
    };
}

export function incrementHeadingNumber(marker: string): string {
    const parts = normalizeHeadingNumber(marker).slice(0, -1).split('.');
    const last = Number(parts.at(-1));
    parts[parts.length - 1] = String(last + 1);
    return `${parts.join('.')}.`;
}

function firstChildHeadingNumber(marker: string, levelDifference: number): string {
    const parent = normalizeHeadingNumber(marker).slice(0, -1);
    const children = Array.from({ length: levelDifference }, () => '1');
    return `${[parent, ...children].join('.')}.`;
}

export function suggestedHeadingNumber(
    level: number,
    previousHeadings: PreviousHeadingNumber[],
): string | null {
    for (const heading of previousHeadings) {
        if (heading.level > level)
            continue;

        if (!heading.marker)
            return null;

        if (heading.level === level)
            return incrementHeadingNumber(heading.marker);

        return firstChildHeadingNumber(heading.marker, level - heading.level);
    }

    return null;
}
