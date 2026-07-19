import { describe, expect, it } from 'vitest';
import {
    incrementHeadingNumber,
    normalizeHeadingNumber,
    parseAtxHeadingNumber,
    suggestedHeadingNumber,
} from '../headingNumber';

describe('smart heading numbers', () => {
    it.each([
        ['# 1. Title', '1.'],
        ['## 1.1. Title', '1.1.'],
        ['## 1.1。 Title', '1.1。'],
        ['## 1。1。 Title', '1。1。'],
        ['## 1．1． Title', '1．1．'],
        ['   #### 3.12. Title', '3.12.'],
    ])('parses %s', (text, marker) => {
        expect(parseAtxHeadingNumber(text)?.marker).toBe(marker);
    });

    it.each([
        ['1。', '1.'],
        ['1.1。', '1.1.'],
        ['1。1。', '1.1.'],
        ['1．1．', '1.1.'],
    ])('normalizes %s to %s', (marker, expected) => {
        expect(normalizeHeadingNumber(marker)).toBe(expected);
    });

    it.each([
        ['1.', '2.'],
        ['1.1.', '1.2.'],
        ['1.1。', '1.2.'],
        ['3.9.', '3.10.'],
    ])('increments %s to %s', (marker, expected) => {
        expect(incrementHeadingNumber(marker)).toBe(expected);
    });

    it('increments the nearest numbered heading at the same level', () => {
        expect(suggestedHeadingNumber(2, [
            { level: 3, marker: '1.1.1.' },
            { level: 2, marker: '1.1.' },
            { level: 1, marker: '1.' },
        ])).toBe('1.2.');
    });

    it('starts the first child from its numbered parent', () => {
        expect(suggestedHeadingNumber(2, [
            { level: 1, marker: '2.' },
            { level: 2, marker: '1.1.' },
        ])).toBe('2.1.');
    });

    it('fills skipped heading levels with first-child segments', () => {
        expect(suggestedHeadingNumber(3, [
            { level: 1, marker: '4.' },
        ])).toBe('4.1.1.');
    });

    it('does not inherit across an unnumbered heading at the same level', () => {
        expect(suggestedHeadingNumber(2, [
            { level: 2, marker: null },
            { level: 2, marker: '1.1.' },
        ])).toBeNull();
    });

    it('does not inherit across an unnumbered parent heading', () => {
        expect(suggestedHeadingNumber(2, [
            { level: 1, marker: null },
            { level: 1, marker: '1.' },
        ])).toBeNull();
    });
});
