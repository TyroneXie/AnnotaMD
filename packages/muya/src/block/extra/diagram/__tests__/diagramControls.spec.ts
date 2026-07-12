// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../../muya';
import type { IMuyaOptions } from '../../../../types';

const loadRendererMock = vi.fn();
vi.mock('../../../../utils/diagram', () => ({
    default: (...args: unknown[]) => loadRendererMock(...args),
}));

const hosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
    loadRendererMock.mockResolvedValue({
        initialize: vi.fn(),
        parse: vi.fn(),
        run: vi.fn(async ({ nodes }: { nodes: HTMLElement[] }) => {
            nodes[0].innerHTML = '<svg viewBox="0 0 120 80"><rect width="120" height="80" /></svg>';
        }),
    });
});

afterEach(() => {
    while (hosts.length) hosts.pop()!.remove();
    loadRendererMock.mockReset();
    vi.restoreAllMocks();
});

function bootDiagram(options: Partial<IMuyaOptions> = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, {
        markdown: '```mermaid\ngraph TD; A-->B\n```\n',
        ...options,
    });
    muya.init();
    hosts.push(muya.domNode);
    const figure = muya.domNode.querySelector<HTMLElement>('figure.mu-diagram-block')!;
    return { muya, figure };
}

describe('diagram block controls', () => {
    it('renders a Feishu-style toolbar and defaults to chart-only view', () => {
        const { figure } = bootDiagram();

        expect(figure.classList.contains('mu-diagram-view-chart')).toBe(true);
        expect(figure.querySelector('.mu-diagram-toolbar')).not.toBeNull();
        expect(figure.querySelector('.mu-diagram-view-toggle')).not.toBeNull();
        expect(figure.querySelector('.mu-diagram-fullscreen')).not.toBeNull();
        expect(figure.querySelector('.mu-diagram-color-toggle')).not.toBeNull();
        expect(figure.querySelector('.mu-diagram-fullscreen-icon')).not.toBeNull();
        expect(figure.querySelector('.mu-diagram-palette-icon')).not.toBeNull();
        expect(figure.querySelector('.mu-diagram-copy')).not.toBeNull();
        expect(figure.querySelector('.mu-diagram-download')).not.toBeNull();
        // The view control already has a visible label, so unlike icon-only
        // controls it should not show a redundant hover tooltip.
        expect(figure.querySelector('.mu-diagram-view-toggle')?.getAttribute('data-tooltip')).toBeNull();
        expect(figure.querySelector('.mu-diagram-fullscreen')?.getAttribute('data-tooltip')).toBeTruthy();
        expect(figure.querySelector('.mu-diagram-color-toggle')?.getAttribute('data-tooltip')).toBeTruthy();
        expect(figure.querySelector('.mu-diagram-copy')?.getAttribute('data-tooltip')).toBeTruthy();
        expect(figure.querySelector('.mu-diagram-download')?.getAttribute('data-tooltip')).toBeTruthy();
        expect(figure.querySelectorAll('[data-diagram-view]')).toHaveLength(3);
    });

    it('switches independently between chart, code, and code-plus-chart views', () => {
        const { figure } = bootDiagram();
        const choose = (view: string) => {
            figure.querySelector<HTMLElement>('.mu-diagram-view-toggle')!.click();
            figure.querySelector<HTMLElement>(`[data-diagram-view="${view}"]`)!.click();
        };

        choose('code');
        expect(figure.classList.contains('mu-diagram-view-code')).toBe(true);

        choose('both');
        expect(figure.classList.contains('mu-diagram-view-both')).toBe(true);

        choose('chart');
        expect(figure.classList.contains('mu-diagram-view-chart')).toBe(true);
    });

    it('opens the rendered chart in the image viewer even from code-only view', async () => {
        const { muya, figure } = bootDiagram();
        await vi.waitFor(() => {
            expect(figure.querySelector('.mu-diagram-preview svg')).not.toBeNull();
        });
        figure.querySelector<HTMLElement>('[data-diagram-view="code"]')!.click();
        const payloads: Array<{ data: string; background: string }> = [];
        muya.on('preview-image', payload => payloads.push(payload));

        figure.querySelector<HTMLElement>('.mu-diagram-fullscreen')!.click();

        expect(payloads).toHaveLength(1);
        expect(payloads[0].data).toMatch(/^data:image\/svg\+xml/);
        expect(payloads[0].background).toBe('#ffffff');
    });

    it('changes only this diagram background from the palette', () => {
        const { figure } = bootDiagram();

        figure.querySelector<HTMLElement>('.mu-diagram-color-toggle')!.click();
        figure.querySelector<HTMLElement>('[data-diagram-background="#eef4ff"]')!.click();

        expect(figure.style.getPropertyValue('--mu-diagram-background')).toBe('#eef4ff');
        expect(figure.dataset.diagramBackground).toBe('#eef4ff');
    });

    it('copies the rendered diagram through the host image clipboard bridge', async () => {
        const clipboardWriteImage = vi.fn();
        const { figure } = bootDiagram({ clipboardWriteImage });
        await vi.waitFor(() => expect(figure.querySelector('.mu-diagram-preview svg')).not.toBeNull());

        figure.querySelector<HTMLElement>('.mu-diagram-copy')!.click();

        expect(clipboardWriteImage).toHaveBeenCalledOnce();
        expect(clipboardWriteImage.mock.calls[0][0]).toMatch(/^data:image\/svg\+xml/);
    });

    it('downloads the rendered diagram with a meaningful SVG filename', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const { figure } = bootDiagram();
        await vi.waitFor(() => expect(figure.querySelector('.mu-diagram-preview svg')).not.toBeNull());

        figure.querySelector<HTMLElement>('.mu-diagram-download')!.click();

        expect(click).toHaveBeenCalledOnce();
        const anchor = click.mock.instances[0] as HTMLAnchorElement;
        expect(anchor.download).toBe('mermaid-diagram.svg');
        expect(anchor.href).toMatch(/^data:image\/svg\+xml/);
    });
});
