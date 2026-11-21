const icons = [
    { type: 'edit', tooltip: 'Edit Image' },
    { type: 'copy', tooltip: 'Copy Image' },
    { type: 'preview', tooltip: 'View Full Image' },
    { type: 'inline', tooltip: 'Inline Image' },
    { type: 'side-by-side', tooltip: 'Place Next to Adjacent Image' },
    { type: 'left', tooltip: 'Align Left' },
    { type: 'center', tooltip: 'Align Center' },
    { type: 'right', tooltip: 'Align Right' },
    { type: 'delete', tooltip: 'Remove Image' },
] as const;

export default icons;
export type Icon = typeof icons[number];
