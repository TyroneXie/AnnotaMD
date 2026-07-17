// @vitest-environment happy-dom

import type Parent from '../../../block/base/parent';
import type { Muya as MuyaType } from '../../../index';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canTurnInto } from '../../../block/blockTransforms';
import { BLOCK_DOM_PROPERTY } from '../../../config';
import { Muya } from '../../../muya';
import {
    frontButtonElementsForEditor,
    frontButtonBlockKind,
    frontButtonBlockLabel,
    frontButtonMainAxis,
    frontButtonTarget,
    imageFrontButtonWrapper,
    imageFrontButtonTarget,
    isImageBlockHoverRegion,
    isImageFloatingControlHit,
    isStandaloneImageBlock,
    ParagraphFrontButton,
} from '../index';

const buttons: ParagraphFrontButton[] = [];

afterEach(() => {
    while (buttons.length)
        buttons.pop()!.destroy();
    document.body.innerHTML = '';
});

describe('paragraph front button positioning', () => {
    it('identifies raw HTML blocks instead of presenting them as plain text', () => {
        const block = { blockName: 'html-block' } as unknown as Parent;
        expect(frontButtonBlockKind(block)).toBe('html');
        expect(frontButtonBlockLabel(block)).toBe('<>');
    });

    it('identifies thematic breaks so they use the shared horizontal-line icon instead of T', () => {
        const block = { blockName: 'thematic-break' } as unknown as Parent;
        expect(frontButtonBlockKind(block)).toBe('thematic-break');
    });

    it('keeps the code-block menu next to the block despite its tall header padding', () => {
        expect(frontButtonMainAxis('code-block', 40, false)).toBe(8);
    });

    it('preserves the existing padding-aware offset for other blocks', () => {
        expect(frontButtonMainAxis('paragraph', 0, false)).toBe(8);
        expect(frontButtonMainAxis('order-list', 12, true)).toBe(32);
    });

    it('reserves room for the disclosure triangle beside a heading', () => {
        expect(frontButtonMainAxis('atx-heading', 0, false, true)).toBe(26);
    });

    it.each(['order-list', 'bullet-list', 'task-list'])(
        'keeps the front button outside the %s item marker gutter',
        (blockName) => {
            expect(frontButtonMainAxis(blockName, 0, false, false, true)).toBe(30);
        },
    );

    it('replaces a stale front button owned by the same editor root', () => {
        const root = document.createElement('div');
        document.body.appendChild(root);
        const muya = {
            domNode: root,
            eventCenter: {
                attachDOMEvent: () => '',
                detachDOMEvent: () => {},
                emit: () => {},
                on: () => {},
            },
        } as unknown as MuyaType;

        buttons.push(new ParagraphFrontButton(muya));
        buttons.push(new ParagraphFrontButton(muya));

        expect(document.querySelectorAll('.mu-front-button-wrapper')).toHaveLength(1);
    });

    it('targets the hovered list item instead of the whole list container', () => {
        window.MUYA_VERSION = 'test';
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: '- first\n- second\n' });
        muya.init();
        const list = muya.editor.scrollPage!.firstChild as Parent;
        const secondItem = list.find(1) as Parent;
        expect(frontButtonTarget([secondItem.domNode!, list.domNode!])).toBe(secondItem);
    });

    it('targets an inner text block inside a highlight container and forbids nested highlights', () => {
        window.MUYA_VERSION = 'test';
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: '> [!HIGHLIGHT]\n> Inside\n' });
        muya.init();
        const highlight = muya.editor.scrollPage!.firstChild as Parent;
        const paragraph = highlight.firstChild as Parent;

        expect(frontButtonTarget([paragraph.domNode!, highlight.domNode!])).toBe(paragraph);
        expect(canTurnInto(paragraph, 'highlight-block')).toBe(false);
        expect(canTurnInto(paragraph, 'atx-heading 2')).toBe(true);
    });

    it('distinguishes an image from its floating controls', () => {
        const image = document.createElement('img');
        const imageContainer = document.createElement('span');
        const imageWrapper = document.createElement('span');
        imageContainer.className = 'mu-image-container';
        imageWrapper.className = 'mu-inline-image';
        imageContainer.appendChild(image);
        imageWrapper.appendChild(imageContainer);

        const toolbarItem = document.createElement('button');
        const toolbar = document.createElement('div');
        toolbar.className = 'mu-image-toolbar-container';
        toolbar.appendChild(toolbarItem);

        expect(imageFrontButtonWrapper([image])).toBe(imageWrapper);
        expect(imageFrontButtonWrapper([imageWrapper])).toBeNull();
        expect(isImageFloatingControlHit([toolbarItem])).toBe(true);
        expect(imageFrontButtonWrapper([document.createElement('p')])).toBeNull();
    });

    it('recognizes a standalone image paragraph so blank space does not become a T menu', () => {
        const wrapper = document.createElement('span');
        const domNode = document.createElement('span');
        wrapper.className = 'mu-inline-image';
        wrapper.dataset.raw = '![alt](image.png)';
        domNode.appendChild(wrapper);
        let text = '![alt](image.png)';
        const block = {
            blockName: 'paragraph',
            domNode,
            getState: () => ({ text }),
        } as unknown as Parent;

        expect(isStandaloneImageBlock(block)).toBe(true);
        text = `caption ${text}`;
        expect(isStandaloneImageBlock(block)).toBe(false);
    });

    it('keeps the image block menu reachable across the whole image row', () => {
        const blockRect = { top: 100, right: 900, bottom: 600, left: 300 } as DOMRect;
        const menuRect = { top: 110, right: 260, bottom: 150, left: 200 } as DOMRect;

        expect(isImageBlockHoverRegion(blockRect, menuRect, 450, 300)).toBe(true);
        expect(isImageBlockHoverRegion(blockRect, menuRect, 280, 130)).toBe(true);
        expect(isImageBlockHoverRegion(blockRect, menuRect, 230, 130)).toBe(true);
        expect(isImageBlockHoverRegion(blockRect, menuRect, 450, 80)).toBe(false);
        expect(isImageBlockHoverRegion(blockRect, menuRect, 920, 300)).toBe(false);
    });

    it('ignores blocks rendered by another editor tab', () => {
        const activeEditor = document.createElement('div');
        const inactiveEditor = document.createElement('div');
        const activeBlock = document.createElement('p');
        const inactiveBlock = document.createElement('p');
        activeEditor.appendChild(activeBlock);
        inactiveEditor.appendChild(inactiveBlock);

        expect(frontButtonElementsForEditor(activeEditor, [
            inactiveBlock,
            activeBlock,
        ])).toEqual([activeBlock]);
        expect(frontButtonElementsForEditor(inactiveEditor, [activeBlock])).toEqual([]);
    });

    it('anchors the image block icon to the paragraph block, not the resizable image', () => {
        let transformerHandler: ((payload: { block?: Parent; reference?: unknown }) => void) | undefined;
        const root = document.createElement('div');
        document.body.appendChild(root);
        const muya = {
            domNode: root,
            eventCenter: {
                attachDOMEvent: () => '',
                detachDOMEvent: () => {},
                emit: () => {},
                on: (name: string, handler: typeof transformerHandler) => {
                    if (name === 'muya-transformer')
                        transformerHandler = handler;
                },
            },
        } as unknown as MuyaType;
        const button = new ParagraphFrontButton(muya);
        buttons.push(button);
        const show = vi.spyOn(button, 'show');
        vi.spyOn(button, 'render').mockImplementation(() => {});
        const block = { domNode: document.createElement('span') } as unknown as Parent;
        const imageReference = document.createElement('span');

        transformerHandler?.({ block, reference: imageReference });

        expect(show).toHaveBeenCalledWith(block, 'image');
        expect(show).not.toHaveBeenCalledWith(imageReference, 'image');
    });

    it('normalizes a transformer content block to its owning paragraph', () => {
        const paragraphElement = document.createElement('p');
        const contentElement = document.createElement('span');
        const imageContainer = document.createElement('span');
        paragraphElement.appendChild(contentElement);
        contentElement.appendChild(imageContainer);

        const paragraph = {
            blockName: 'paragraph',
            isOutMostBlock: true,
        } as unknown as Parent;
        const format = {
            blockName: 'paragraph-content',
            parent: paragraph,
        } as unknown as Parent;
        Object.assign(paragraphElement, { [BLOCK_DOM_PROPERTY]: paragraph });
        Object.assign(contentElement, { [BLOCK_DOM_PROPERTY]: format });

        expect(imageFrontButtonTarget(imageContainer, format)).toBe(paragraph);
    });
});
