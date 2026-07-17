import type { Muya } from '../../../muya';
import type { IDiagramMeta, IDiagramState } from '../../../state/types';
import type { TBlockPath } from '../../types';
import logger from '../../../utils/logger';
import { loadLanguage } from '../../../utils/prism';
import Parent from '../../base/parent';
import { ScrollPage } from '../../scrollPage';
import { createActionIconElement } from '../../../ui/actionIcons';
import '../../../ui/actionIcons.css';

const debug = logger('diagram:');

type DiagramView = 'chart' | 'code' | 'both';

const DIAGRAM_VIEW_CLASSES = [
    'mu-diagram-view-chart',
    'mu-diagram-view-code',
    'mu-diagram-view-both',
];

const DIAGRAM_BACKGROUNDS = [
    '#ffffff',
    '#f5f6f7',
    '#eef4ff',
    '#f0f9f1',
    '#fff7e6',
    '#f7f0ff',
];

function createButton(className: string, title: string, children: Array<Node | string>) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (title)
        button.setAttribute('aria-label', title);
    button.setAttribute('contenteditable', 'false');
    children.forEach(child => button.append(child));
    return button;
}

function attachBodyTooltip(target: HTMLElement) {
    let tooltip: HTMLElement | null = null;
    const hide = () => {
        tooltip?.remove();
        tooltip = null;
    };
    const show = () => {
        hide();
        const label = target.dataset.tooltip;
        if (!label)
            return;

        tooltip = document.createElement('div');
        tooltip.className = 'mu-diagram-tooltip';
        tooltip.textContent = label;
        document.body.appendChild(tooltip);

        const targetRect = target.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - tooltip.offsetWidth - 8);
        const left = Math.min(
            maxLeft,
            Math.max(8, targetRect.left + targetRect.width / 2 - tooltip.offsetWidth / 2),
        );
        const below = targetRect.bottom + 6;
        const top = below + tooltip.offsetHeight <= window.innerHeight - 8
            ? below
            : targetRect.top - tooltip.offsetHeight - 6;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
    };

    target.addEventListener('mouseenter', show);
    target.addEventListener('mouseleave', hide);
    target.addEventListener('mousedown', hide);
}

function createSpan(className: string, text: string) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
}

function createFullscreenIcon() {
    const icon = createActionIconElement('fullscreen');
    icon.classList.add('mu-diagram-fullscreen-icon');
    return icon;
}

function createPaletteIcon() {
    const icon = createActionIconElement('palette');
    icon.classList.add('mu-diagram-palette-icon');
    return icon;
}

function createCopyIcon() {
    return createActionIconElement('copy');
}

function createDownloadIcon() {
    return createActionIconElement('download');
}

export function diagramPreviewDataUrl(preview: HTMLElement, background: string): string | null {
    const image = preview.querySelector<HTMLImageElement>('img');
    if (image?.currentSrc || image?.src)
        return image.currentSrc || image.src;

    const svg = preview.querySelector<SVGSVGElement>('svg');
    if (!svg)
        return null;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backgroundRect.setAttribute('x', '0');
    backgroundRect.setAttribute('y', '0');
    backgroundRect.setAttribute('width', '100%');
    backgroundRect.setAttribute('height', '100%');
    backgroundRect.setAttribute('fill', background);
    clone.insertBefore(backgroundRect, clone.firstChild);

    const source = new XMLSerializer().serializeToString(clone);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

class DiagramBlock extends Parent {
    public meta: IDiagramMeta;
    static override blockName = 'diagram';

    static create(muya: Muya, state: IDiagramState) {
        const diagramBlock = new DiagramBlock(muya, state);
        const { lang } = state.meta;
        const diagramPreview = ScrollPage.loadBlock('diagram-preview').create(
            muya,
            state,
        );
        const diagramContainer = ScrollPage.loadBlock('diagram-container').create(
            muya,
            state,
        );

        diagramBlock.appendAttachment(diagramPreview);
        diagramBlock.append(diagramContainer);

        !!lang
        && loadLanguage(lang)
            .then((infoList) => {
                if (!Array.isArray(infoList))
                    return;
                // There are three status `loaded`, `noexist` and `cached`.
                // if the status is `loaded`, indicated that it's a new loaded language
                const needRender = infoList.some(
                    ({ status }) => status === 'loaded' || status === 'cached',
                );
                if (needRender)
                    diagramBlock.lastContentInDescendant()?.update();
            })
            .catch((err) => {
                // if no parameter provided, will cause error.
                debug.warn(err);
            });

        return diagramBlock;
    }

    override get path() {
        const { path: pPath } = this.parent!;
        const offset = this.parent!.offset(this);

        return [...pPath, offset];
    }

    constructor(muya: Muya, { meta }: IDiagramState) {
        super(muya);
        this.tagName = 'figure';
        this.meta = meta;
        this.classList = ['mu-diagram-block', 'mu-diagram-view-chart'];
        this.createDomNode();
        this._createToolbar();
        this._listenToolbar();
    }

    private _createToolbar() {
        const { i18n } = this.muya;
        const toolbar = document.createElement('div');
        toolbar.className = 'mu-diagram-toolbar';
        toolbar.setAttribute('contenteditable', 'false');

        const viewControl = document.createElement('div');
        viewControl.className = 'mu-diagram-control mu-diagram-view-control';
        const viewToggle = createButton('mu-diagram-view-toggle', '', [
            createActionIconElement('diagram-view'),
            createSpan('mu-diagram-control-label', i18n.t('Diagram View')),
            createSpan('mu-diagram-control-chevron', '⌄'),
        ]);
        const viewMenu = document.createElement('div');
        viewMenu.className = 'mu-diagram-popover mu-diagram-view-menu';
        const views: Array<[DiagramView, string]> = [
            ['both', i18n.t('Code and Chart')],
            ['code', i18n.t('Code Only')],
            ['chart', i18n.t('Chart Only')],
        ];
        views.forEach(([view, label]) => {
            const option = createButton('mu-diagram-menu-item', label, [
                createSpan('mu-diagram-menu-label', label),
                createSpan('mu-diagram-menu-check', '✓'),
            ]);
            option.dataset.diagramView = view;
            if (view === 'chart')
                option.classList.add('active');
            viewMenu.appendChild(option);
        });
        viewControl.append(viewToggle, viewMenu);

        const fullscreen = createButton('mu-diagram-fullscreen', i18n.t('Fullscreen'), [
            createFullscreenIcon(),
        ]);
        fullscreen.dataset.tooltip = i18n.t('Fullscreen');
        attachBodyTooltip(fullscreen);

        const colorControl = document.createElement('div');
        colorControl.className = 'mu-diagram-control mu-diagram-color-control';
        const colorToggle = createButton('mu-diagram-color-toggle', i18n.t('Diagram Background'), [
            createPaletteIcon(),
        ]);
        colorToggle.dataset.tooltip = i18n.t('Diagram Background');
        attachBodyTooltip(colorToggle);
        const colorMenu = document.createElement('div');
        colorMenu.className = 'mu-diagram-popover mu-diagram-color-menu';
        colorMenu.appendChild(createSpan('mu-diagram-color-title', i18n.t('Diagram Background')));
        const colorGrid = document.createElement('div');
        colorGrid.className = 'mu-diagram-color-grid';
        DIAGRAM_BACKGROUNDS.forEach((color) => {
            const swatch = createButton('mu-diagram-color-swatch', color, []);
            swatch.dataset.diagramBackground = color;
            swatch.style.backgroundColor = color;
            if (color === '#ffffff')
                swatch.classList.add('active');
            colorGrid.appendChild(swatch);
        });
        colorMenu.appendChild(colorGrid);
        colorControl.append(colorToggle, colorMenu);

        const copy = createButton('mu-diagram-copy', i18n.t('Copy Diagram'), [
            createCopyIcon(),
        ]);
        copy.dataset.tooltip = i18n.t('Copy Diagram');
        attachBodyTooltip(copy);

        const download = createButton('mu-diagram-download', i18n.t('Download Diagram'), [
            createDownloadIcon(),
        ]);
        download.dataset.tooltip = i18n.t('Download Diagram');
        attachBodyTooltip(download);

        toolbar.append(viewControl, fullscreen, colorControl, copy, download);
        this.domNode!.appendChild(toolbar);
        this.domNode!.dataset.diagramBackground = '#ffffff';
        this.domNode!.style.setProperty('--mu-diagram-background', '#ffffff');
    }

    private _listenToolbar() {
        const { eventCenter } = this.muya;
        const root = this.domNode!;
        const toolbar = root.querySelector<HTMLElement>('.mu-diagram-toolbar')!;
        const viewControl = root.querySelector<HTMLElement>('.mu-diagram-view-control')!;
        const colorControl = root.querySelector<HTMLElement>('.mu-diagram-color-control')!;

        const closeMenus = () => {
            viewControl.classList.remove('open');
            colorControl.classList.remove('open');
            toolbar.classList.remove('menu-open');
        };
        const openMenu = (control: HTMLElement) => {
            const willOpen = !control.classList.contains('open');
            closeMenus();
            if (willOpen) {
                control.classList.add('open');
                toolbar.classList.add('menu-open');
            }
        };

        eventCenter.attachDOMEvent(toolbar, 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        eventCenter.attachDOMEvent(
            root.querySelector<HTMLElement>('.mu-diagram-view-toggle')!,
            'click',
            () => openMenu(viewControl),
        );
        eventCenter.attachDOMEvent(
            root.querySelector<HTMLElement>('.mu-diagram-color-toggle')!,
            'click',
            () => openMenu(colorControl),
        );

        root.querySelectorAll<HTMLElement>('[data-diagram-view]').forEach((option) => {
            eventCenter.attachDOMEvent(option, 'click', () => {
                const view = option.dataset.diagramView as DiagramView;
                root.classList.remove(...DIAGRAM_VIEW_CLASSES);
                root.classList.add(`mu-diagram-view-${view}`);
                root.querySelectorAll('[data-diagram-view]').forEach(item => item.classList.remove('active'));
                option.classList.add('active');
                closeMenus();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-diagram-background]').forEach((swatch) => {
            eventCenter.attachDOMEvent(swatch, 'click', () => {
                const background = swatch.dataset.diagramBackground!;
                root.dataset.diagramBackground = background;
                root.style.setProperty('--mu-diagram-background', background);
                root.querySelectorAll('[data-diagram-background]').forEach(item => item.classList.remove('active'));
                swatch.classList.add('active');
                closeMenus();
            });
        });

        eventCenter.attachDOMEvent(
            root.querySelector<HTMLElement>('.mu-diagram-fullscreen')!,
            'click',
            () => {
                const preview = root.querySelector<HTMLElement>('.mu-diagram-preview');
                if (!preview)
                    return;
                const background = root.dataset.diagramBackground ?? '#ffffff';
                const data = diagramPreviewDataUrl(preview, background);
                if (data)
                    eventCenter.emit('preview-image', { data, background });
                closeMenus();
            },
        );

        eventCenter.attachDOMEvent(
            root.querySelector<HTMLElement>('.mu-diagram-copy')!,
            'click',
            () => {
                const preview = root.querySelector<HTMLElement>('.mu-diagram-preview');
                if (!preview)
                    return;
                const data = diagramPreviewDataUrl(
                    preview,
                    root.dataset.diagramBackground ?? '#ffffff',
                );
                if (!data)
                    return;
                const result = this.muya.options.clipboardWriteImage?.(data);
                if (result instanceof Promise)
                    result.catch(() => {});
            },
        );

        eventCenter.attachDOMEvent(
            root.querySelector<HTMLElement>('.mu-diagram-download')!,
            'click',
            () => {
                const preview = root.querySelector<HTMLElement>('.mu-diagram-preview');
                if (!preview)
                    return;
                const data = diagramPreviewDataUrl(
                    preview,
                    root.dataset.diagramBackground ?? '#ffffff',
                );
                if (!data)
                    return;
                const extension = data.startsWith('data:image/svg+xml') ? 'svg' : 'png';
                const anchor = document.createElement('a');
                anchor.href = data;
                anchor.download = `${this.meta.type || 'diagram'}-diagram.${extension}`;
                anchor.click();
            },
        );

        eventCenter.attachDOMEvent(document, 'click', closeMenus);
    }

    queryBlock(path: TBlockPath) {
        return path.length && path[0] === 'text'
            ? this.firstContentInDescendant()
            : this;
    }

    override getState(): IDiagramState {
        const { meta } = this;
        const text = this.firstContentInDescendant()?.text;

        if (text == null)
            throw new Error('text is null when getState in diagram block.');

        return {
            name: 'diagram',
            text,
            meta,
        };
    }
}

export default DiagramBlock;
