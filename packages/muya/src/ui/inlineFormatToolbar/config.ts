import { isOsx } from '../../config';

const COMMAND_KEY = isOsx ? '⌘' : 'Ctrl';

export const TEXT_STYLE_OPTIONS = [
    { type: 'paragraph', title: 'Paragraph', label: 'T', shortcut: `${COMMAND_KEY}+0` },
    { type: 'heading 1', title: 'Heading 1', label: 'H1', shortcut: `${COMMAND_KEY}+1` },
    { type: 'heading 2', title: 'Heading 2', label: 'H2', shortcut: `${COMMAND_KEY}+2` },
    { type: 'heading 3', title: 'Heading 3', label: 'H3', shortcut: `${COMMAND_KEY}+3` },
    { type: 'heading 4', title: 'Heading 4', label: 'H4', shortcut: `${COMMAND_KEY}+4` },
    { type: 'heading 5', title: 'Heading 5', label: 'H5', shortcut: `${COMMAND_KEY}+5` },
    { type: 'heading 6', title: 'Heading 6', label: 'H6', shortcut: `${COMMAND_KEY}+6` },
] as const;

export type TextStyleType = typeof TEXT_STYLE_OPTIONS[number]['type'];

export const COLOR_PALETTES = {
    text_color: ['', '#1f2329', '#646a73', '#d83931', '#e8590c', '#f59f00', '#2b8a3e', '#0b7285', '#3370ff', '#7048e8'],
    background_color: ['', '#f2f3f5', '#fde2e2', '#ffec99', '#d9f7be', '#b5f5ec', '#dbeafe', '#e5dbff', '#ffe8cc', '#fff2b8'],
} as const;

export type ColorFormatType = keyof typeof COLOR_PALETTES;

const icons = [
    {
        type: 'text_style',
        tooltip: 'Paragraph',
        shortcut: '',
        label: 'T',
    },
    {
        type: 'strong',
        tooltip: 'Emphasize',
        shortcut: `${COMMAND_KEY}+B`,
        label: 'B',
        groupBreakBefore: true,
    },
    {
        type: 'del',
        tooltip: 'Strikethrough',
        shortcut: `${COMMAND_KEY}+D`,
        label: 'S',
    },
    {
        type: 'em',
        tooltip: 'Italic',
        shortcut: `${COMMAND_KEY}+I`,
        label: 'I',
    },
    {
        type: 'u',
        tooltip: 'Underline',
        shortcut: `${COMMAND_KEY}+U`,
        label: 'U',
    },
    {
        type: 'link',
        tooltip: 'Link',
        shortcut: `${COMMAND_KEY}+L`,
        label: '',
    },
    {
        type: 'inline_code',
        tooltip: 'Inline Code',
        // Default keybinding is Cmd/Ctrl+` (Linux uses Ctrl+Y); was wrongly +E.
        shortcut: `${COMMAND_KEY}+\``,
        label: '</>',
    },
    {
        type: 'color_palette',
        tooltip: 'Text and Background Color',
        shortcut: '',
        label: 'A',
        palette: true,
    },
    {
        type: 'annotamd_comment',
        tooltip: 'Comment',
        shortcut: '',
        label: '',
        groupBreakBefore: true,
    },
    {
        type: 'annotamd_delete_selection',
        tooltip: 'Delete Selection',
        shortcut: '',
        label: '',
    },
];

export type FormatToolIcon = typeof icons[number];

export default icons;
