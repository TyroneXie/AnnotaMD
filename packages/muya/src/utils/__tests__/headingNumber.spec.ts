import { describe, expect, it } from 'vitest';
import {
    headingNumberValue,
    incrementHeadingNumber,
    normalizeHeadingNumber,
    parseAtxHeadingNumber,
    replaceHeadingNumberValue,
    restartedHeadingNumber,
    standardizedHeadingNumber,
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

    it('reads and replaces only the last value of a hierarchical number', () => {
        expect(headingNumberValue('2.4.')).toBe(4);
        expect(replaceHeadingNumberValue('2.4.', 7)).toBe('2.7.');
    });

    it('increments the nearest numbered heading at the same level', () => {
        expect(suggestedHeadingNumber(2, [
            { level: 3, marker: '1.1.1.' },
            { level: 2, marker: '1.1.' },
            { level: 1, marker: '1.' },
        ])).toBe('1.2.');
    });

    it('does not offer continuation when there is no previous sibling at that level', () => {
        expect(suggestedHeadingNumber(2, [
            { level: 1, marker: '2.' },
            { level: 2, marker: '1.1.' },
        ])).toBeNull();
    });

    it('does not offer continuation across a numbered parent', () => {
        expect(suggestedHeadingNumber(3, [
            { level: 1, marker: '4.' },
        ])).toBeNull();
    });

    it('ignores an unnumbered heading at the same level', () => {
        expect(suggestedHeadingNumber(2, [
            { level: 2, marker: null },
            { level: 2, marker: '1.1.' },
        ])).toBe('1.2.');
    });

    it('ignores an unnumbered parent heading', () => {
        expect(suggestedHeadingNumber(2, [
            { level: 1, marker: null },
            { level: 2, marker: '1.1.' },
            { level: 1, marker: '1.' },
        ])).toBe('1.2.');
    });

    it('continues a sibling number and ignores the typed value', () => {
        expect(standardizedHeadingNumber('2.3.', 2, [
            { level: 2, marker: '2.1.' },
            { level: 1, marker: '2.' },
        ])).toBe('2.2.');
    });

    it('preserves the final typed value for the first child of a numbered parent', () => {
        expect(standardizedHeadingNumber('8.8.', 2, [
            { level: 1, marker: '2.' },
        ])).toBe('2.8.');
    });

    it('expands a one-part restart marker under its numbered parent', () => {
        expect(standardizedHeadingNumber('1。', 2, [
            { level: 1, marker: '2.' },
        ])).toBe('2.1.');
    });

    it('preserves typed suffixes when heading levels are skipped', () => {
        expect(standardizedHeadingNumber('6.7.8.', 3, [
            { level: 1, marker: '4.' },
        ])).toBe('4.7.8.');
    });

    it('treats a final input value of 1 as an explicit restart', () => {
        expect(standardizedHeadingNumber('9.9.1。', 3, [
            { level: 3, marker: '3.4.6.' },
            { level: 2, marker: '3.4.' },
            { level: 1, marker: '3.' },
        ])).toBe('3.4.1.');
    });

    it('ignores unnumbered headings while standardizing input', () => {
        expect(standardizedHeadingNumber('9.9.', 2, [
            { level: 1, marker: null },
            { level: 2, marker: null },
            { level: 2, marker: '3.6.' },
            { level: 1, marker: '3.' },
        ])).toBe('3.7.');
    });

    it('keeps the normalized value when no numbered sequence exists', () => {
        expect(standardizedHeadingNumber('4。', 1, [
            { level: 1, marker: null },
        ])).toBe('4.');
    });

    it('restarts a top-level heading from 1', () => {
        expect(restartedHeadingNumber(1, [
            { level: 1, marker: '4.' },
        ])).toBe('1.');
    });

    it('restarts a child at 1 under its nearest numbered parent', () => {
        expect(restartedHeadingNumber(2, [
            { level: 2, marker: '3.7.' },
            { level: 1, marker: '3.' },
        ])).toBe('3.1.');
    });
});
