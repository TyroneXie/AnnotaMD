import type { Muya } from '../../../muya';
import type { IRenderCursor } from '../../../selection/types';
import type AtxHeading from '../../commonMark/atxHeading';
import { isKeyboardEvent } from '../../../utils';
import {
    headingNumberValue,
    normalizeHeadingNumber,
    parseAtxHeadingNumber,
    replaceHeadingNumberValue,
    restartedHeadingNumber,
    standardizedHeadingNumber,
    suggestedHeadingNumber,
    type PreviousHeadingNumber,
} from '../../../utils/headingNumber';
import Format from '../../base/format';
import { ScrollPage } from '../../scrollPage';

function previousHeadingNumbers(heading: AtxHeading): PreviousHeadingNumber[] {
    const headings: PreviousHeadingNumber[] = [];
    let block = heading.prev;

    while (block) {
        if (block.blockName === 'atx-heading') {
            const previousHeading = block as AtxHeading;
            const text = previousHeading.firstContentInDescendant()?.text ?? '';
            headings.push({
                level: previousHeading.meta.level,
                marker: parseAtxHeadingNumber(text)?.marker ?? null,
            });
        }
        block = block.prev;
    }

    return headings;
}

export interface HeadingNumberMenuState {
    canContinue: boolean;
    canRestart: boolean;
    continuation: string | null;
    current: string;
    restart: string;
    value: number;
}

class AtxHeadingContent extends Format {
    public override parent: AtxHeading | null = null;

    static override blockName = 'atxheading.content';

    static create(muya: Muya, text: string) {
        const content = new AtxHeadingContent(muya, text);

        return content;
    }

    constructor(muya: Muya, text: string) {
        super(muya, text);
        this.classList = [...this.classList, 'mu-atxheading-content'];
        this.createDomNode();
    }

    override getAnchor() {
        return this.parent;
    }

    override update(cursor?: IRenderCursor, highlights = []) {
        const result = this.inlineRenderer.patch(this, cursor, highlights);
        const number = this.domNode?.querySelector<HTMLElement>('.mu-heading-number');
        if (number) {
            number.addEventListener('mousedown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                number.focus({ preventScroll: true });
            });
            number.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.muya.eventCenter.emit('muya-heading-number-menu', {
                    block: this,
                    reference: number,
                });
            });
            number.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ')
                    return;
                event.preventDefault();
                event.stopPropagation();
                this.muya.eventCenter.emit('muya-heading-number-menu', {
                    block: this,
                    reference: number,
                });
            });
        }
        return result;
    }

    getHeadingNumberMenuState(): HeadingNumberMenuState | null {
        const headingNumber = parseAtxHeadingNumber(this.text);
        if (!headingNumber || !this.parent)
            return null;

        const current = normalizeHeadingNumber(headingNumber.marker);
        const previous = previousHeadingNumbers(this.parent);
        const continuation = suggestedHeadingNumber(this.parent.meta.level, previous);
        const restart = restartedHeadingNumber(this.parent.meta.level, previous);
        return {
            canContinue: continuation !== null && continuation !== current,
            canRestart: restart !== current,
            continuation,
            current,
            restart,
            value: headingNumberValue(current),
        };
    }

    setHeadingNumber(marker: string) {
        const headingNumber = parseAtxHeadingNumber(this.text);
        if (!headingNumber)
            return;

        const normalized = normalizeHeadingNumber(marker);
        const { markerStart, markerEnd } = headingNumber;
        this.text = this.text.slice(0, markerStart) + normalized + this.text.slice(markerEnd);
        // Menu commands are discrete actions. Commit their queued text edit
        // before the popup closes so an immediate mode/tab switch cannot drop it.
        this.muya.flush();
        const offset = headingNumber.gapEnd + normalized.length - headingNumber.marker.length;
        this.setCursor(offset, offset, true);
    }

    setHeadingNumberValue(value: number) {
        const headingNumber = parseAtxHeadingNumber(this.text);
        if (headingNumber)
            this.setHeadingNumber(replaceHeadingNumberValue(headingNumber.marker, value));
    }

    override inputHandler(event: Event) {
        super.inputHandler(event);

        const inputData = 'data' in event && typeof event.data === 'string'
            ? event.data
            : null;
        if (inputData !== ' ')
            return;

        const cursor = this.getCursor();
        const headingNumber = parseAtxHeadingNumber(this.text);
        if (
            !cursor
            || !headingNumber
            || cursor.start.offset !== headingNumber.gapEnd
            || cursor.end.offset !== headingNumber.gapEnd
        ) {
            return;
        }

        const suggested = standardizedHeadingNumber(
            headingNumber.marker,
            this.parent!.meta.level,
            previousHeadingNumbers(this.parent!),
        );
        if (suggested === headingNumber.marker) {
            this.setCursor(headingNumber.gapEnd, headingNumber.gapEnd, true);
            return;
        }

        const { markerStart, markerEnd } = headingNumber;
        this.text
            = this.text.slice(0, markerStart) + suggested + this.text.slice(markerEnd);
        const offset = headingNumber.gapEnd + suggested.length - headingNumber.marker.length;
        this.setCursor(offset, offset, true);
    }

    override enterHandler(event: Event) {
        const { start, end } = this.getCursor()!;
        const { level } = this.parent!.meta;

        if (start.offset === end.offset && start.offset <= level + 1) {
            // Without preventDefault the browser still runs its native
            // Enter behavior on the contenteditable after we insert the
            // new paragraph, which can split or clone the heading's
            // `mu-content` span. Orphaned spans lack BLOCK_DOM_PROPERTY,
            // so a later click crashes Selection.getSelection at
            // `anchorBlock.path`.
            event.preventDefault();
            event.stopPropagation();

            const newNodeState = {
                name: 'paragraph',
                text: '',
            };

            const newParagraphBlock = ScrollPage.loadBlock(newNodeState.name).create(
                this.muya,
                newNodeState,
            );
            this.parent!.parent!.insertBefore(newParagraphBlock, this.parent);
            this.setCursor(start.offset, end.offset, true);
        }
        else if (isKeyboardEvent(event)) {
            super.enterHandler(event);
        }
    }

    override backspaceHandler(event: Event) {
        const { start, end } = this.getCursor()!;
        if (start.offset === 0 && end.offset === 0) {
            event.preventDefault();
            this.text = this.text.replace(/^ {0,3}#{1,6} */, '');
            this.convertToParagraph();
        }
        else if (start.offset === 1 && end.offset === 1 && this.text === '#') {
            event.preventDefault();
            this.text = '';
            this.setCursor(0, 0);
            this.convertToParagraph();
        }
        else {
            super.backspaceHandler(event);
        }
    }
}

export default AtxHeadingContent;
