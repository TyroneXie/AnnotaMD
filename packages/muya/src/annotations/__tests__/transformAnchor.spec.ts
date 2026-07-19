import { describe, expect, it } from 'vitest';
import { editOp, insertOp, moveOp, removeOp } from 'ot-json1';
import {
    transformAnnotationPoint,
    transformAnnotationPointUtf16,
    mapAnnotationPointBetweenDocumentsUtf16,
} from '../transformAnchor';

describe('annotation anchor OT mapping', () => {
    it('moves an endpoint through an edit before repeated text', () => {
        const operation = editOp([0, 'text'], 'text-unicode', ['prefix ', 4, 'new ']);

        expect(transformAnnotationPoint({ path: [0, 'text'], offset: 11 }, operation))
            .toEqual({ path: [0, 'text'], offset: 22 });
    });

    it('does not move a point when another identical block changes', () => {
        const operation = editOp([0, 'text'], 'text-unicode', [2, 'changed']);

        expect(transformAnnotationPoint({ path: [1, 'text'], offset: 2 }, operation))
            .toEqual({ path: [1, 'text'], offset: 2 });
    });

    it('follows its block when the block is moved', () => {
        const operation = moveOp([2], [0]);

        expect(transformAnnotationPoint({ path: [2, 'text'], offset: 3 }, operation))
            .toEqual({ path: [0, 'text'], offset: 3 });
    });

    it('shifts a block path when a sibling is inserted before it', () => {
        const operation = insertOp([0], { name: 'paragraph', text: 'new' });

        expect(transformAnnotationPoint({ path: [1, 'text'], offset: 3 }, operation))
            .toEqual({ path: [2, 'text'], offset: 3 });
    });

    it('drops an endpoint when its block is removed', () => {
        const operation = removeOp([1], { name: 'paragraph', text: 'same' });

        expect(transformAnnotationPoint({ path: [1, 'text'], offset: 3 }, operation))
            .toBeNull();
    });

    it('keeps UTF-16 renderer offsets exact around emoji', () => {
        const previousDocument = [{ name: 'paragraph', text: '😀same' }];
        const nextDocument = [{ name: 'paragraph', text: '😀Xsame' }];
        const operation = editOp([0, 'text'], 'text-unicode', [1, 'X']);

        expect(transformAnnotationPointUtf16(
            { path: [0, 'text'], offset: 2 },
            operation,
            previousDocument,
            nextDocument,
            'right',
        )).toEqual({ path: [0, 'text'], offset: 3 });
    });

    it('keeps an end endpoint before text inserted at its boundary', () => {
        const previousDocument = [{ name: 'paragraph', text: 'same' }];
        const nextDocument = [{ name: 'paragraph', text: 'same!' }];
        const operation = editOp([0, 'text'], 'text-unicode', [4, '!']);

        expect(transformAnnotationPointUtf16(
            { path: [0, 'text'], offset: 4 },
            operation,
            previousDocument,
            nextDocument,
            'left',
        )).toEqual({ path: [0, 'text'], offset: 4 });
    });

    it('maps the selected repeated block across a full document replacement', () => {
        const previousDocument = [
            { name: 'paragraph', text: 'same' },
            { name: 'paragraph', text: 'same' },
        ];
        const nextDocument = [
            { name: 'paragraph', text: 'prefix' },
            { name: 'paragraph', text: 'same' },
            { name: 'paragraph', text: 'same' },
        ];

        expect(mapAnnotationPointBetweenDocumentsUtf16(
            { path: [1, 'text'], offset: 2 },
            previousDocument,
            nextDocument,
            'right',
        )).toEqual({ path: [2, 'text'], offset: 2 });
    });

    it('drops an ambiguous full replacement when an identical block is added', () => {
        const previousDocument = [
            { name: 'paragraph', text: 'same' },
            { name: 'paragraph', text: 'same' },
        ];
        const nextDocument = [
            { name: 'paragraph', text: 'same' },
            { name: 'paragraph', text: 'same' },
            { name: 'paragraph', text: 'same' },
        ];

        expect(mapAnnotationPointBetweenDocumentsUtf16(
            { path: [1, 'text'], offset: 2 },
            previousDocument,
            nextDocument,
            'right',
        )).toBeNull();
    });
});
