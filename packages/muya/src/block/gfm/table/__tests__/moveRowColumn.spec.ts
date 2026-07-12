// @vitest-environment happy-dom

import type Table from '../index';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../../../muya';

let muya: Muya;

beforeEach(() => {
    window.MUYA_VERSION = 'test';
    const host = document.createElement('div');
    document.body.appendChild(host);
    muya = new Muya(host, {
        markdown: '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n',
    } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
});

afterEach(() => muya.domNode.remove());

const table = () => muya.editor.scrollPage!.firstChild as Table;
const matrix = () => table().getState().children.map(row => row.children.map(cell => cell.text));

describe('table axis movement', () => {
    it('moves a whole row without changing its cells', () => {
        table().moveRow(2, 1);
        expect(matrix()).toEqual([
            ['A', 'B', 'C'],
            ['4', '5', '6'],
            ['1', '2', '3'],
        ]);
    });

    it('moves a whole column and preserves header alignment metadata', () => {
        table().alignColumn(2, 'right');
        table().moveColumn(2, 0);
        expect(matrix()).toEqual([
            ['C', 'A', 'B'],
            ['3', '1', '2'],
            ['6', '4', '5'],
        ]);
        expect(table().getState().children.every(row => row.children[0].meta.align === 'right')).toBe(true);
    });

    it('ignores out-of-range moves', () => {
        const before = matrix();
        table().moveRow(0, -1);
        table().moveColumn(0, 99);
        expect(matrix()).toEqual(before);
    });
});
