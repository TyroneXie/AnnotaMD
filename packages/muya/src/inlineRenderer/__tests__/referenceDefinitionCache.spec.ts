// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as json1 from 'ot-json1';
import { Muya } from '../../muya';

let host: HTMLElement;

beforeEach(() => {
    window.MUYA_VERSION = 'test';
    host = document.createElement('div');
    document.body.appendChild(host);
});

afterEach(() => {
    host.remove();
    document.getSelection()?.removeAllRanges();
});

describe('InlineRenderer reference-definition cache', () => {
    it('scans document definitions once while mounting many content leaves', () => {
        const markdown = [
            'A [reference][ref].',
            '',
            '| one | two | three |',
            '| --- | --- | --- |',
            '| four | five | six |',
            '',
            '[ref]: https://example.com',
            '',
        ].join('\n');
        const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
        const getState = vi.spyOn(muya.editor.jsonState, 'getState');

        muya.init();

        // Editor.init reads the state once to build the block tree; the first
        // inline leaf scans reference definitions once, and every later leaf
        // reuses the labels for the same JSON-state revision.
        expect(getState).toHaveBeenCalledTimes(2);
        expect(muya.editor.inlineRenderer.labels.get('ref')?.href)
            .toBe('https://example.com');
    });

    it('invalidates cached definitions when setContent advances the revision', () => {
        const muya = new Muya(host, {
            markdown: 'A [reference][old].\n\n[old]: https://old.example\n',
        } as ConstructorParameters<typeof Muya>[1]);
        muya.init();
        const previousRevision = muya.editor.jsonState.revision;
        const getState = vi.spyOn(muya.editor.jsonState, 'getState');

        muya.setContent('A [reference][next].\n\n[next]: https://next.example\n');

        expect(muya.editor.jsonState.revision).toBe(previousRevision + 1);
        // setContent reads the new state once for the block tree, then the
        // first inline leaf refreshes the definition cache once.
        expect(getState).toHaveBeenCalledTimes(2);
        expect(muya.editor.inlineRenderer.labels.has('old')).toBe(false);
        expect(muya.editor.inlineRenderer.labels.get('next')?.href)
            .toBe('https://next.example');
    });

    it('invalidates cached definitions after an OT dispatch', () => {
        const oldDefinition = '[old]: https://old.example';
        const nextDefinition = '[next]: https://next.example';
        const muya = new Muya(host, {
            markdown: `A [reference][old].\n\n${oldDefinition}\n`,
        } as ConstructorParameters<typeof Muya>[1]);
        muya.init();
        const previousRevision = muya.editor.jsonState.revision;
        const operation = json1.replaceOp([1, 'text'], oldDefinition, nextDefinition);

        muya.editor.jsonState.dispatch(operation);
        muya.editor.scrollPage!.firstContentInDescendant()!.update();

        expect(muya.editor.jsonState.revision).toBe(previousRevision + 1);
        expect(muya.editor.inlineRenderer.labels.has('old')).toBe(false);
        expect(muya.editor.inlineRenderer.labels.get('next')?.href)
            .toBe('https://next.example');
    });
});
