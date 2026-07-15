import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const inlineSyntaxCss = readFileSync(
    resolve(__dirname, '../../../assets/styles/inlineSyntax.css'),
    'utf8',
);

describe('strikethrough alignment', () => {
    it('keeps inline code at the surrounding text size with compact padding', () => {
        expect(inlineSyntaxCss).toMatch(
            /code\.mu-inline-rule\s*\{[^}]*padding:\s*0\.1em 0\.35em;[^}]*font-size:\s*1em;/s,
        );
    });

    it('uses one painted rule across prose and compensates for inline code padding', () => {
        expect(inlineSyntaxCss).toMatch(
            /del\.mu-inline-rule\s*\{[^}]*text-decoration:\s*none;[^}]*background-position:\s*0 48%;[^}]*background-size:\s*100% 1px;/s,
        );
        expect(inlineSyntaxCss).toMatch(
            /del\.mu-inline-rule code\.mu-inline-rule\s*\{[^}]*background-position:\s*0 46%;[^}]*background-size:\s*100% 1px;/s,
        );
    });
});
