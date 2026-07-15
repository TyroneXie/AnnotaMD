import { describe, expect, it } from 'vitest';
import { MUYA_DEFAULT_OPTIONS } from '../../config';
import { MarkdownToState } from '../markdownToState';
import ExportMarkdown from '../stateToMarkdown';

// Loose accessor type used only in this spec — every state node the
// MarkdownToState pipeline emits has some subset of these fields, and the
// tests navigate the tree generically without re-implementing the
// discriminated TState union narrowing.
interface IStateLike {
    name: string;
    text?: string;
    meta?: Record<string, unknown> & { type?: string; lang?: string };
    children?: IStateLike[];
}

function generate(markdown: string): IStateLike[] {
    return new MarkdownToState({
        footnote: false,
        math: false,
        isGitlabCompatibilityEnabled: false,
        trimUnnecessaryCodeBlockEmptyLines: false,
        frontMatter: false,
    }).generate(markdown) as unknown as IStateLike[];
}

function toMarkdown(states: IStateLike[]): string {
    return new ExportMarkdown({ listIndentation: 1 }).generate(
        states as unknown as Parameters<ExportMarkdown['generate']>[0],
    );
}

// Parity restoration for flowchart + sequence diagrams. The legacy muyajs
// engine rendered ```flowchart``` (flowchart.js) and ```sequence```
// (js-sequence-diagrams) fenced blocks as diagram blocks; the TS rewrite
// dropped them. These specs lock the parse + round-trip behaviour so the
// two diagram types stay first-class alongside mermaid / plantuml /
// vega-lite.
describe('diagram blocks — flowchart & sequence parity', () => {
    it('accepts a closing fence attached to the final Mermaid statement', () => {
        const md = `\`\`\`mermaid
sequenceDiagram
  participant FE
  alt 编辑已有应用
    FE->>FE: 回填配置
  end\`\`\`

## 下一章节
`;
        const states = generate(md);

        expect(states).toHaveLength(2);
        expect(states[0]).toMatchObject({
            name: 'diagram',
            text: expect.stringContaining('  end'),
            meta: { type: 'mermaid' },
        });
        expect(states[1]).toMatchObject({
            name: 'atx-heading',
            text: '## 下一章节',
        });
    });

    it('accepts an attached closing fence after a Mermaid closing brace', () => {
        const md = `\`\`\`mermaid
erDiagram
  APP {
    string id
  }\`\`\`

正文
`;
        const states = generate(md);

        expect(states).toHaveLength(2);
        expect(states[0]).toMatchObject({
            name: 'diagram',
            text: expect.stringContaining('  }'),
            meta: { type: 'mermaid' },
        });
        expect(states[1]).toMatchObject({ name: 'paragraph', text: '正文' });
    });

    it('parses a ```flowchart``` fence as a diagram block of type flowchart', () => {
        const md = `\`\`\`flowchart
st=>start: Start
e=>end: End
st->e
\`\`\`
`;
        const states = generate(md);
        expect(states.length).toBe(1);
        expect(states[0].name).toBe('diagram');
        expect(states[0].meta!.type).toBe('flowchart');
        // flowchart is not vega-lite, so the inner code lang stays yaml.
        expect(states[0].meta!.lang).toBe('yaml');
        expect(states[0].text).toContain('st=>start: Start');
    });

    it('parses a ```sequence``` fence as a diagram block of type sequence', () => {
        const md = `\`\`\`sequence
Alice->Bob: Hello Bob
Bob-->Alice: Hi Alice
\`\`\`
`;
        const states = generate(md);
        expect(states.length).toBe(1);
        expect(states[0].name).toBe('diagram');
        expect(states[0].meta!.type).toBe('sequence');
        expect(states[0].meta!.lang).toBe('yaml');
        expect(states[0].text).toContain('Alice->Bob: Hello Bob');
    });

    it('round-trips a flowchart diagram block back to a ```flowchart``` fence', () => {
        const md = `\`\`\`flowchart
st=>start: Start
e=>end: End
st->e
\`\`\`
`;
        const out = toMarkdown(generate(md));
        expect(out).toContain('```flowchart');
        expect(out).toContain('st=>start: Start');
        expect(out).toContain('st->e');
    });

    it('round-trips a sequence diagram block back to a ```sequence``` fence', () => {
        const md = `\`\`\`sequence
Alice->Bob: Hello Bob
Bob-->Alice: Hi Alice
\`\`\`
`;
        const out = toMarkdown(generate(md));
        expect(out).toContain('```sequence');
        expect(out).toContain('Alice->Bob: Hello Bob');
        expect(out).toContain('Bob-->Alice: Hi Alice');
    });

    it('still parses mermaid / plantuml / vega-lite (no regression)', () => {
        for (const type of ['mermaid', 'plantuml', 'vega-lite'] as const) {
            const md = `\`\`\`${type}\nfoo\n\`\`\`\n`;
            const states = generate(md);
            expect(states[0].name).toBe('diagram');
            expect(states[0].meta!.type).toBe(type);
        }
    });
});

describe('sequenceTheme option', () => {
    it('defaults to `hand` in MUYA_DEFAULT_OPTIONS', () => {
        expect(MUYA_DEFAULT_OPTIONS.sequenceTheme).toBe('hand');
    });
});
