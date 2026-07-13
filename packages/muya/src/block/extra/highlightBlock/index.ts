import type { Muya } from '../../../muya';
import type { IHighlightBlockState } from '../../../state/types';
import { isMouseEvent, mixins } from '../../../utils';
import Parent from '../../base/parent';
import IContainerQueryBlock from '../../mixins/containerQueryBlock';
import { ScrollPage } from '../../scrollPage';

@mixins(IContainerQueryBlock)
class HighlightBlock extends Parent {
    static override blockName = 'highlight-block';

    meta: IHighlightBlockState['meta'];
    private _disclosure: HTMLButtonElement;
    private _title: HTMLSpanElement;

    static create(muya: Muya, state: IHighlightBlockState) {
        const block = new HighlightBlock(muya, state);
        block.append(
            ...state.children.map(child => ScrollPage.loadBlock(child.name).create(muya, child)),
        );
        return block;
    }

    override get path() {
        const { path: parentPath } = this.parent!;
        return [...parentPath, this.parent!.offset(this), 'children'];
    }

    constructor(muya: Muya, state: IHighlightBlockState) {
        super(muya);
        this.meta = { ...state.meta };
        this.tagName = 'div';
        this.classList = ['mu-highlight-block'];
        if (this.meta.collapsed)
            this.classList.push('mu-highlight-collapsed');
        this.createDomNode();

        this._disclosure = document.createElement('button');
        this._disclosure.type = 'button';
        this._disclosure.className = 'mu-highlight-disclosure';
        this._disclosure.contentEditable = 'false';
        this.domNode!.appendChild(this._disclosure);

        this._title = document.createElement('span');
        this._title.className = 'mu-highlight-title';
        this._title.contentEditable = 'false';
        this._title.textContent = muya.i18n.t('Highlight Block');
        this.domNode!.appendChild(this._title);
        this._syncDisclosure();

        muya.eventCenter.attachDOMEvent(this._disclosure, 'click', (event: Event) => {
            if (!isMouseEvent(event))
                return;
            event.preventDefault();
            event.stopPropagation();
            this.collapsed = !this.collapsed;
        });
    }

    get collapsed() {
        return this.meta.collapsed;
    }

    set collapsed(value: boolean) {
        if (value === this.meta.collapsed)
            return;
        const previous = this.meta.collapsed;
        this.meta.collapsed = value;
        const path = this.path;
        path.pop();
        path.push('meta', 'collapsed');
        this.jsonState.replaceOperation(path, previous, value);
        this._syncDisclosure();
    }

    private _syncDisclosure() {
        this.domNode?.classList.toggle('mu-highlight-collapsed', this.meta.collapsed);
        this._disclosure.textContent = this.meta.collapsed ? '▸' : '▾';
        const label = this.muya.i18n.t(this.meta.collapsed ? 'Expand Section' : 'Collapse Section');
        this._disclosure.title = label;
        this._disclosure.setAttribute('aria-label', label);
    }

    override getState(): IHighlightBlockState {
        return {
            name: 'highlight-block',
            meta: { ...this.meta },
            children: this.children.map(child => (child as Parent).getState()),
        };
    }
}

export default HighlightBlock;
