// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isInsideFloatLayer } from '../index';

describe('table column toolbar hover guard', () => {
    it('ignores pointer positions inside another floating menu', () => {
        const float = document.createElement('div');
        float.className = 'mu-float-wrapper';
        const footer = document.createElement('div');
        footer.className = 'mu-language-more-footer';
        float.appendChild(footer);

        expect(isInsideFloatLayer([footer, float, document.body])).toBe(true);
    });

    it('keeps normal editor positions eligible for table hover tools', () => {
        const cell = document.createElement('td');

        expect(isInsideFloatLayer([cell, document.body])).toBe(false);
    });

    it('uses the shared action icon set for every column action', () => {
        const source = readFileSync(
            resolve(process.cwd(), 'src/ui/tableColumnToolbar/index.ts'),
            'utf8',
        );
        expect(source).toContain('renderActionIcon(i.actionIcon)');
    });
});
