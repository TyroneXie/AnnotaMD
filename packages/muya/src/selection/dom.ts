// utils used in selection/index.js
import { CLASS_NAMES } from '../config';
import { isElement } from '../utils';

export function isContentDOM(element: HTMLElement) {
    return (
        element
        && element.tagName === 'SPAN'
        && element.classList.contains('mu-content')
    );
}

export function findContentDOM(node: Node | null | undefined) {
    if (!node)
        return null;

    do {
        if (node instanceof HTMLElement && isContentDOM(node))
            return node;

        node = node.parentNode;
    } while (node);

    return null;
}

export function compareParagraphsOrder(paragraph1: HTMLElement, paragraph2: HTMLElement) {
    return (
        paragraph1.compareDocumentPosition(paragraph2)
        & Node.DOCUMENT_POSITION_FOLLOWING
    );
}

function isTableCellLineEnd(node: Node): boolean {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.classList.contains('mu-table-cell-line-end') ?? false;
}

export function getTextContent(node: Node, blackList: string[] = []) {
    if (isTableCellLineEnd(node))
        return node.textContent!.replace(/\u200B/g, '');

    if (node.nodeType === Node.TEXT_NODE || (blackList.length === 0
        && !(node instanceof Element && node.querySelector('.mu-table-cell-line-end')))) {
        return node.textContent!;
    }

    let text = '';
    if (
        isElement(node)
        && blackList.some(
            className => node.classList && node.classList.contains(className),
        )
    ) {
        return text;
    }

    if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
    }
    else if (
        isElement(node)
        && node.classList.contains(`${CLASS_NAMES.MU_INLINE_IMAGE}`)
    ) {
    // handle inline image
        const raw = node.getAttribute('data-raw');
        const imageContainer = node.querySelector(
            `.${CLASS_NAMES.MU_IMAGE_CONTAINER}`,
        );
        const hasImg = imageContainer!.querySelector('img');
        const childNodes = imageContainer!.childNodes;
        if (childNodes.length && hasImg) {
            for (const child of childNodes) {
                if (child.nodeType === Node.ELEMENT_NODE && child.nodeName === 'IMG')
                    text += raw;
                else if (child.nodeType === Node.TEXT_NODE)
                    text += child.textContent;
            }
        }
        else {
            text += raw;
        }
    }
    else {
        const childNodes = node.childNodes;

        for (const n of childNodes)
            text += getTextContent(n, blackList);
    }

    return text;
}

// Rendered previews whose DOM glyphs have no counterpart in the source text.
const RENDER_BLACKLIST = [CLASS_NAMES.MU_MATH_RENDER, CLASS_NAMES.MU_RUBY_RENDER];

function getChildrenTextPrefix(node: Node, count: number): number {
    const { childNodes } = node;
    let total = 0;

    for (let i = 0; i < count && i < childNodes.length; i++)
        total += getTextContent(childNodes[i], RENDER_BLACKLIST).length;

    return total;
}

export function getOffsetOfParagraph(node: Node, paragraph: HTMLElement, nodeOffset = 0): number {
    let offset: number;

    if (node.nodeType === Node.TEXT_NODE) {
        offset = isTableCellLineEnd(node)
            ? node.textContent!.slice(0, nodeOffset).replace(/\u200B/g, '').length
            : nodeOffset;
    }
    else {
        // A non-text endpoint carries a CHILD INDEX, not a character count:
        // `(span.mu-content, 2)` sits before that element's third child.
        // Reading the index as an offset made a whole-block selection collapse
        // to its first few characters — copying `**Hermes 怎么修、怎么验收**`
        // yielded `**H`. Count the text of the children before it instead.
        offset = getChildrenTextPrefix(node, nodeOffset);
    }

    let preSibling: Node | null = node;

    if (node === paragraph)
        return offset;

    do {
        preSibling = preSibling.previousSibling;
        if (preSibling)
            offset += getTextContent(preSibling, RENDER_BLACKLIST).length;
    } while (preSibling);

    return node === paragraph || node.parentNode === paragraph
        ? offset
        : offset + getOffsetOfParagraph(node.parentNode!, paragraph);
}

export function getNodeAndOffset(
    node: Node,
    offset: number,
): { node: Node; offset: number } {
    if (node.nodeType === Node.TEXT_NODE) {
        return {
            node,
            offset,
        };
    }

    const childNodes = node.childNodes;
    const len = childNodes.length;
    let i;
    let count = 0;

    for (i = 0; i < len; i++) {
        const child = childNodes[i];
        const textContent = getTextContent(child, [
            CLASS_NAMES.MU_MATH_RENDER,
            CLASS_NAMES.MU_RUBY_RENDER,
        ]);
        const textLength = textContent.length;

        // Fix #1460 - put the cursor at the next text node or element if it can be put at the last of /^\n$/ or the next text node/element.
        if (
            /^\n$/.test(textContent) && i !== len - 1
                ? count + textLength > offset
                : count + textLength >= offset
        ) {
            // The cell's final <br> source marker is hidden. Its following
            // placeholder is the visible, editable end of the same text.
            if (count + textLength === offset
                && child instanceof HTMLElement
                && child.nextElementSibling?.classList.contains('mu-table-cell-line-end')) {
                return { node: child.nextElementSibling.firstChild!, offset: 0 };
            }
            if (
                isElement(child)
                && child.classList
                && child.classList.contains(`${CLASS_NAMES.MU_INLINE_IMAGE}`)
            ) {
                const imageContainer = child.querySelector(
                    `.${CLASS_NAMES.MU_IMAGE_CONTAINER}`,
                )!;
                const hasImg = imageContainer.querySelector('img');

                if (!hasImg) {
                    return {
                        node: child,
                        offset: 0,
                    };
                }

                if (count + textLength === offset) {
                    if (child.nextElementSibling) {
                        return {
                            node: child.nextElementSibling,
                            offset: 0,
                        };
                    }
                    else {
                        return {
                            node: imageContainer,
                            offset: 1,
                        };
                    }
                }
                else if (count === offset && count === 0) {
                    return {
                        node: imageContainer,
                        offset: 0,
                    };
                }
                else {
                    return {
                        node: child,
                        offset: 0,
                    };
                }
            }
            else {
                return getNodeAndOffset(child, offset - count);
            }
        }
        else {
            count += textLength;
        }
    }

    return { node, offset };
}

export function getLegalOffset(node: Node, offset: number): number {
    if (!node || typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0)
        return 0;

    const max = node.nodeType === Node.TEXT_NODE
        ? (node as Text).length
        : node.childNodes.length;

    return Math.min(offset, max);
}
