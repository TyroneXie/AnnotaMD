import type { Muya } from '../../../../muya';
import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../../../../state/markdownToState';
import ExportMarkdown from '../../../../state/stateToMarkdown';
import { convertTextStatesToLabel, TEXT_BLOCK_LABELS } from '../../../blockTransforms';

const parser = new MarkdownToState({
    footnote: false,
    math: true,
    isGitlabCompatibilityEnabled: true,
    trimUnnecessaryCodeBlockEmptyLines: false,
    frontMatter: true,
});

describe('highlight block markdown model', () => {
    it('is available in the shared text-block conversion targets', () => {
        expect(TEXT_BLOCK_LABELS).toContain('highlight-block');
    });

    it('parses the compatible blockquote marker as a highlight container', () => {
        const states = parser.generate(`> [!HIGHLIGHT]\n> ## Internal heading\n>\n> Body\n`);

        expect(states).toEqual([
            {
                name: 'highlight-block',
                meta: { collapsed: false },
                children: [
                    { name: 'atx-heading', meta: { level: 2 }, text: '## Internal heading' },
                    { name: 'paragraph', text: 'Body' },
                ],
            },
        ]);
    });

    it('persists collapsed state in markdown', () => {
        const states = parser.generate(`> [!HIGHLIGHT collapsed]\n> Body\n`);
        expect(states[0]).toMatchObject({
            name: 'highlight-block',
            meta: { collapsed: true },
        });

        const markdown = new ExportMarkdown({ listIndentation: 1 }).generate(states);
        expect(markdown).toBe(`> [!HIGHLIGHT collapsed]\n> Body\n`);
    });

    it('round-trips nested rich content without flattening it', () => {
        const markdown = `> [!HIGHLIGHT]\n> Intro\n>\n> - one\n> - two\n>\n> \`\`\`ts\n> const value = 1\n> \`\`\`\n`;
        const states = parser.generate(markdown);
        const serialized = new ExportMarkdown({ listIndentation: 1 }).generate(states);
        const reparsed = parser.generate(serialized);

        expect(reparsed).toEqual(states);
        expect(serialized.startsWith('> [!HIGHLIGHT]\n')).toBe(true);
    });

    it('does not create a nested highlight container', () => {
        const states = parser.generate(`> [!HIGHLIGHT]\n> Outer\n>\n> > [!HIGHLIGHT]\n> > Inner\n`);
        const highlight = states[0] as { name: string; children: Array<{ name: string }> };

        expect(highlight.name).toBe('highlight-block');
        expect(highlight.children.some(child => child.name === 'highlight-block')).toBe(false);
        expect(highlight.children.some(child => child.name === 'block-quote')).toBe(true);
    });

    it('wraps multiple selected text states in one highlight container', () => {
        const converted = convertTextStatesToLabel([
            { name: 'paragraph', text: 'One' },
            { name: 'atx-heading', meta: { level: 2 }, text: '## Two' },
        ], 'highlight-block', {} as Muya);

        expect(converted).toEqual([
            {
                name: 'highlight-block',
                meta: { collapsed: false },
                children: [
                    { name: 'paragraph', text: 'One' },
                    { name: 'atx-heading', meta: { level: 2 }, text: '## Two' },
                ],
            },
        ]);
    });
});
