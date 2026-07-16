export function isPointInsideEditorViewport(
    point: { x: number; y: number },
    rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
): boolean {
    return point.x >= rect.left
        && point.x <= rect.right
        && point.y >= rect.top
        && point.y <= rect.bottom;
}
