import type { Muya } from '../muya';
import { getBlock } from '../utils/dom';

export function attachTableCellMouseHandlers(muya: Muya): void {
    const { domNode, eventCenter } = muya;

    eventCenter.attachDOMEvent(domNode, 'dblclick', (event) => {
        if (!(event instanceof MouseEvent) || event.button !== 0 || !(event.target instanceof HTMLElement))
            return;

        const cell = event.target.closest<HTMLElement>('.mu-table-cell');
        const content = cell?.querySelector<HTMLElement>('.mu-table-cell-content');
        // Text and image double clicks keep their usual selection/viewer action.
        if (!cell || !content || (event.target !== cell && event.target !== content))
            return;

        const bounds = cell.getBoundingClientRect();
        if (event.clientX <= bounds.left || event.clientX >= bounds.right
            || event.clientY <= bounds.top || event.clientY >= bounds.bottom) {
            return;
        }

        // A centered image has bottom margin inside the content block. Measure
        // its rendered children rather than treating that margin as content.
        const range = document.createRange();
        range.selectNodeContents(content);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        if (rects.some(rect => event.clientY <= rect.bottom))
            return;

        const block = getBlock(content);
        if (!block?.isContent())
            return;

        event.preventDefault();
        eventCenter.emit('muya-image-toolbar', { reference: null });
        eventCenter.emit('muya-transformer', { reference: null });
        eventCenter.emit('muya-format-picker', { reference: null });

        if (block.text && !/<br\s*\/?>\s*$/i.test(block.text)) {
            muya.editor.history.cutoff();
            block.text += '<br/>';
        }
        const offset = block.text.length;
        content.focus({ preventScroll: true });
        block.setCursor(offset, offset, true);
    });
}
