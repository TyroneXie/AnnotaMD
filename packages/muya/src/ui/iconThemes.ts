import { OFFICIAL_ICON_THEMES } from './generatedOfficialIconThemes';

export type IconThemeName =
    | 'tabler' | 'lucide' | 'heroicons' | 'feather' | 'svg'
    | 'phosphor' | 'remix' | 'material' | 'hugeicons' | 'mdi' | 'bootstrap';

export interface OfficialIconGlyph {
    source: string;
    viewBox: string;
    body: string;
}

export type IconThemeIcon = string[] | OfficialIconGlyph;

export interface IconThemeConfig {
    label: string;
    viewBox: string;
    strokeWidth: number;
    strokeLinecap: 'round' | 'square' | 'butt';
    strokeLinejoin: 'round' | 'miter' | 'bevel';
    icons: Record<string, IconThemeIcon>;
}

/* ========== Tabler (24×24, 1.5px, square caps) ========== */
const TABLER_ICONS: Record<string, string[]> = {
    'strong': [
        'M7 5h6a3.5 3.5 0 0 1 0 7h-6z',
        'M7 12h7a3.5 3.5 0 0 1 0 7h-7z',
    ],
    'italic': [
        'M11 5h6',
        'M7 19h6',
        'M14 5l-4 14',
    ],
    'underline': [
        'M6 4v6a6 6 0 0 0 12 0V4',
        'M4 20h16',
    ],
    'strikethrough': [
        'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
        'M4 12h16',
    ],
    'inline-code': [
        'm7 8-4 4 4 4',
        'm17 8 4 4-4 4',
    ],
    'link': [
        'M9 17H7A5 5 0 0 1 7 7h2',
        'M15 7h2a5 5 0 1 1 0 10h-2',
        'M8 12h8',
    ],
    'unlink': [
        'M9 17H7A5 5 0 0 1 7 7h2',
        'M15 7h2a5 5 0 0 1 2.9 9',
        'M8 12h4',
        'M4 4l16 16',
    ],
    'comment': [
        'M21 15a2 2 0 0 1-2 2H7l-5 4V5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2z',
        'M8 9h8M8 13h5',
    ],
    'delete': [
        'M4 7h16',
        'M10 11v6',
        'M14 11v6',
        'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12',
        'M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
    ],
    'move-up': ['M12 19V5', 'm5 12 7-7 7 7'],
    'move-down': ['M12 5v14', 'm19 12-7 7-7-7'],
    'move-left': ['M19 12H5', 'm12 19-7-7 7-7'],
    'move-right': ['M5 12h14', 'm12 5 7 7-7 7'],
    'insert-left': ['M4 4v16', 'M14 12H8', 'm11 9-3 3 3 3', 'M20 8v8'],
    'insert-right': ['M20 4v16', 'M10 12h6', 'm13 9 3 3-3 3', 'M4 8v8'],
    'insert-above': ['M4 4h16', 'M12 8v6', 'm9 11 3-3 3 3', 'M8 20h8'],
    'insert-below': ['M4 20h16', 'M12 16v-6', 'm9 13 3 3 3-3', 'M8 4h8'],
    'align-left': ['M4 6h16', 'M4 12h10', 'M4 18h14'],
    'align-center': ['M4 6h16', 'M7 12h10', 'M5 18h14'],
    'align-right': ['M20 6H4', 'M20 12H10', 'M20 18H6'],
    'reset-width': ['M4 12h16', 'm7 8-4 4 4 4', 'm17 8 4 4-4 4'],
    'inline-image': [
        'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
        'm4 16 4-4 3 3 4-4 5 5',
        'M14 9h.01',
    ],
    'edit': [
        'M4 20h4L18.5 9.5a2.121 2.121 0 0 0-3-3L5.5 16.5 4 20z',
        'm13.5 6.5 3 3',
    ],
    'more': [
        'M5 12h.01',
        'M12 12h.01',
        'M19 12h.01',
    ],
    'copy-link': [
        'M9 15l6-6',
        'M11 6l.463-.536a5 5 0 0 1 7.071 7.072L18 13',
        'M13 18l-.397.534a5.068 5.068 0 0 1-7.127 0 4.972 4.972 0 0 1 0-7.071L6 10',
    ],
    'web-link': [
        'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
        'M3.6 9h16.8',
        'M3.6 15h16.8',
        'M11.5 3a17 17 0 0 0 0 18',
        'M12.5 3a17 17 0 0 1 0 18',
    ],
    'text-style': [
        'M4 7V5h16v2',
        'M9 20h6',
        'M12 5v15',
    ],
    'color': [
        'M5 3m0 2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
        'M9 7h6',
        'M9 11h6',
        'M9 15h4',
    ],
};

/* ========== Lucide (24×24, 2px, round caps) ========== */
const LUCIDE_ICONS: Record<string, string[]> = {
    'strong': [
        'M6 4h7a4 4 0 0 1 0 8H6V4z',
        'M6 12h8a4 4 0 0 1 0 8H6v-8z',
    ],
    'italic': ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'],
    'underline': ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'],
    'strikethrough': [
        'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
        'M4 12h16',
    ],
    'inline-code': ['m8 6-6 6 6 6', 'm16 6 6 6-6 6'],
    'link': [
        'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
        'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
    'unlink': [
        'm18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71',
        'm5.17 11.75-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71',
        'M8 2v3',
        'M2 8h3',
        'M16 19v3',
        'M19 16h3',
    ],
    'comment': ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'],
    'delete': [
        'M3 6h18',
        'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
        'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
    ],
    'move-up': ['M12 19V5', 'm5 12 7-7 7 7'],
    'move-down': ['M12 5v14', 'm19 12-7 7-7-7'],
    'move-left': ['M19 12H5', 'm12 19-7-7 7-7'],
    'move-right': ['M5 12h14', 'm12 5 7 7-7 7'],
    'insert-left': ['M4 4v16', 'M14 12H8', 'm11 9-3 3 3 3', 'M20 8v8'],
    'insert-right': ['M20 4v16', 'M10 12h6', 'm13 9 3 3-3 3', 'M4 8v8'],
    'insert-above': ['M4 4h16', 'M12 8v6', 'm9 11 3-3 3 3', 'M8 20h8'],
    'insert-below': ['M4 20h16', 'M12 16v-6', 'm9 13 3 3 3-3', 'M8 4h8'],
    'align-left': ['M3 6h18', 'M3 12h9', 'M3 18h13'],
    'align-center': ['M3 6h18', 'M8 12h8', 'M6 18h12'],
    'align-right': ['M21 6H3', 'M21 12h-9', 'M21 18h-7'],
    'reset-width': ['M4 12h16', 'm7 8-4 4 4 4', 'm17 8 4 4-4 4'],
    'inline-image': [
        'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
        'm4 16 4-4 3 3 4-4 5 5',
        'M14 9h.01',
    ],
    'edit': [
        'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
        'm15 5 4 4',
    ],
    'more': [
        'M5 12h.01',
        'M12 12h.01',
        'M19 12h.01',
    ],
    'copy-link': [
        'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
        'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
    'web-link': [
        'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
        'M3.6 9h16.8',
        'M3.6 15h16.8',
        'M11.5 3a17 17 0 0 0 0 18',
        'M12.5 3a17 17 0 0 1 0 18',
    ],
    'text-style': [
        'M4 7V5h16v2',
        'M9 20h6',
        'M12 5v15',
    ],
    'color': [
        'M5 3m0 2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
        'M9 7h6',
        'M9 11h6',
        'M9 15h4',
    ],
};

/* ========== Heroicons (24×24, 1.5px, round caps) ========== */
const HEROICONS_ICONS: Record<string, string[]> = {
    'strong': [
        'M6.75 3.75h4.5a3.75 3.75 0 1 1 0 7.5h-4.5v-7.5z',
        'M6.75 11.25h5.25a3.75 3.75 0 1 1 0 7.5H6.75v-7.5z',
    ],
    'italic': ['M5.25 3.75h13.5', 'M9.75 20.25h4.5', 'M12 3.75l-4.5 16.5'],
    'underline': ['M4.5 20.25h15', 'M6 3.75v7.5a6 6 0 0 0 12 0v-7.5'],
    'strikethrough': [
        'M3 12h18',
        'M9 5.25h6a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6',
    ],
    'inline-code': ['M17.25 6.75 22.5 12l-5.25 5.25', 'M6.75 17.25 1.5 12l5.25-5.25'],
    'link': [
        'M13.19 8.688a4.5 4.5 0 0 1 6.364 6.364l-3 3a4.5 4.5 0 0 1-6.364-6.364l1.5-1.5',
        'M10.81 15.312a4.5 4.5 0 0 1-6.364-6.364l3-3a4.5 4.5 0 0 1 6.364 6.364l-1.5 1.5',
    ],
    'unlink': [
        'M13.19 8.688a4.5 4.5 0 0 1 6.364 6.364l-3 3a4.5 4.5 0 0 1-6.364-6.364l1.5-1.5',
        'M10.81 15.312a4.5 4.5 0 0 1-6.364-6.364l3-3a4.5 4.5 0 0 1 6.364 6.364l-1.5 1.5',
        'M3 3l18 18',
    ],
    'comment': [
        'M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z',
    ],
    'delete': [
        'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
    ],
    'move-up': ['M12 19.5V4.5', 'm5.25 11.25 6.75-6.75 6.75 6.75'],
    'move-down': ['M12 4.5v15', 'm18.75 12.75-6.75 6.75-6.75-6.75'],
    'move-left': ['M19.5 12h-15', 'm11.25 18.75-6.75-6.75 6.75-6.75'],
    'move-right': ['M4.5 12h15', 'm12.75 5.25 6.75 6.75-6.75 6.75'],
    'insert-left': ['M4.5 3.75v16.5', 'M14.25 12h-6', 'm11.25 9-3 3 3 3', 'M19.5 8.25v7.5'],
    'insert-right': ['M19.5 3.75v16.5', 'M9.75 12h6', 'm12.75 9 3 3-3 3', 'M4.5 8.25v7.5'],
    'insert-above': ['M3.75 4.5h16.5', 'M12 8.25v6', 'm9 11.25 3-3 3 3', 'M8.25 20.25h7.5'],
    'insert-below': ['M3.75 19.5h16.5', 'M12 15.75v-6', 'm9 12.75 3 3 3-3', 'M8.25 3.75h7.5'],
    'align-left': ['M3.75 6h16.5', 'M3.75 12h9', 'M3.75 18h12'],
    'align-center': ['M3.75 6h16.5', 'M7.5 12h9', 'M6 18h12'],
    'align-right': ['M20.25 6H3.75', 'M20.25 12h-9', 'M20.25 18h-12'],
    'reset-width': ['M3.75 12h16.5', 'm7.5 8.25-4.5 4.5 4.5 4.5', 'm16.5 8.25 4.5 4.5-4.5 4.5'],
    'inline-image': [
        'm2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    ],
    'edit': [
        'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125',
    ],
    'more': [
        'M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
        'M12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
        'M18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
    ],
    'copy-link': [
        'M13.19 8.688a4.5 4.5 0 0 1 6.364 6.364l-3 3a4.5 4.5 0 0 1-6.364-6.364l1.5-1.5',
        'M10.81 15.312a4.5 4.5 0 0 1-6.364-6.364l3-3a4.5 4.5 0 0 1 6.364 6.364l-1.5 1.5',
    ],
    'web-link': [
        'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
        'M3.6 9h16.8',
        'M3.6 15h16.8',
        'M11.5 3a17 17 0 0 0 0 18',
        'M12.5 3a17 17 0 0 1 0 18',
    ],
    'text-style': [
        'M4 7V5h16v2',
        'M9 20h6',
        'M12 5v15',
    ],
    'color': [
        'M5 3m0 2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
        'M9 7h6',
        'M9 11h6',
        'M9 15h4',
    ],
};

/* ========== Feather (24×24, 2px, round caps) ========== */
const FEATHER_ICONS: Record<string, string[]> = {
    'strong': [
        'M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z',
        'M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z',
    ],
    'italic': ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'],
    'underline': ['M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3', 'M4 21h16'],
    'strikethrough': [
        'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
        'M4 12h16',
    ],
    'inline-code': ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
    'link': [
        'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
        'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
    'unlink': [
        'm18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71',
        'm5.17 11.75-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71',
        'M8 2v3',
        'M2 8h3',
        'M16 19v3',
        'M19 16h3',
    ],
    'comment': ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    'delete': [
        'M3 6h18',
        'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
        'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    ],
    'move-up': ['M12 19V5', 'm5 12 7-7 7 7'],
    'move-down': ['M12 5v14', 'm19 12-7 7-7-7'],
    'move-left': ['M19 12H5', 'm12 19-7-7 7-7'],
    'move-right': ['M5 12h14', 'm12 5 7 7-7 7'],
    'insert-left': ['M4 4v16', 'M14 12H8', 'm11 9-3 3 3 3', 'M20 8v8'],
    'insert-right': ['M20 4v16', 'M10 12h6', 'm13 9 3 3-3 3', 'M4 8v8'],
    'insert-above': ['M4 4h16', 'M12 8v6', 'm9 11 3-3 3 3', 'M8 20h8'],
    'insert-below': ['M4 20h16', 'M12 16v-6', 'm9 13 3 3 3-3', 'M8 4h8'],
    'align-left': ['M3 6h18', 'M3 12h9', 'M3 18h13'],
    'align-center': ['M3 6h18', 'M8 12h8', 'M6 18h12'],
    'align-right': ['M21 6H3', 'M21 12h-9', 'M21 18h-7'],
    'reset-width': ['M4 12h16', 'm7 8-4 4 4 4', 'm17 8 4 4-4 4'],
    'inline-image': [
        'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
        'm4 16 4-4 3 3 4-4 5 5',
        'M14 9h.01',
    ],
    'edit': [
        'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
        'm15 5 4 4',
    ],
    'more': [
        'M5 12h.01',
        'M12 12h.01',
        'M19 12h.01',
    ],
    'copy-link': [
        'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
        'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
    'web-link': [
        'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
        'M3.6 9h16.8',
        'M3.6 15h16.8',
        'M11.5 3a17 17 0 0 0 0 18',
        'M12.5 3a17 17 0 0 1 0 18',
    ],
    'text-style': [
        'M4 7V5h16v2',
        'M9 20h6',
        'M12 5v15',
    ],
    'color': [
        'M5 3m0 2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
        'M9 7h6',
        'M9 11h6',
        'M9 15h4',
    ],
};

/*
 * Block and utility icons are semantic menu roles shared by every theme. Their
 * geometry remains recognisable across the slash menu, block menu and compact
 * toolbars; each theme still applies its own stroke weight, caps and joins.
 */
const COMPLETE_MENU_ICONS: Record<string, string[]> = {
    'copy': ['M9 3h6v4H9z', 'M6 5h12v16H6z'],
    'wrap': ['M4 7h11a4 4 0 0 1 0 8H9', 'm12 12-3 3 3 3'],
    'heading-link': ['M9 15l6-6', 'M7 5H4v14h3', 'M17 5h3v14h-3'],
    'diagram-view': ['M4 5h16v14H4z', 'M4 10h16', 'M9 10v9'],
    'fullscreen': ['M8 3H3v5', 'M16 3h5v5', 'M8 21H3v-5', 'M16 21h5v-5'],
    'palette': ['M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 2 2 0 0 1 1.5-3.3H18A3 3 0 0 0 21 11a8 8 0 0 0-9-8z', 'M7 10h.01', 'M10 7h.01', 'M14 7h.01'],
    'download': ['M12 3v12', 'm7 10 5 5 5-5', 'M4 21h16'],
    'link-view': ['M8 12h8', 'M9 17H7A5 5 0 0 1 7 7h2', 'M15 7h2a5 5 0 1 1 0 10h-2'],
    'title-view': ['M4 7h16', 'M7 12h10', 'M9 17h6'],
    'paragraph': ['M7 5h10', 'M12 5v14', 'M9 19h6'],
    'horizontal-line': ['M5 12h14', 'M8 8h8', 'M8 16h8'],
    'frontmatter': ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h5'],
    'heading-1': ['M5 5v14', 'M5 12h8', 'M13 5v14', 'M18 10l2-2v10', 'M18 18h4'],
    'heading-2': ['M5 5v14', 'M5 12h8', 'M13 5v14', 'M17 10a2 2 0 1 1 4 0c0 2-4 4-4 8h4'],
    'heading-3': ['M5 5v14', 'M5 12h8', 'M13 5v14', 'M17 9c.5-.7 1.2-1 2-1a2 2 0 0 1 0 4 2 2 0 0 1 0 4c-.8 0-1.5-.3-2-1'],
    'heading-4': ['M5 5v14', 'M5 12h8', 'M13 5v14', 'M21 18V8l-4 6h5'],
    'heading-5': ['M5 5v14', 'M5 12h8', 'M13 5v14', 'M21 8h-4v4h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2c-.8 0-1.5-.3-2-1'],
    'heading-6': ['M5 5v14', 'M5 12h8', 'M13 5v14', 'M21 8h-2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0v-1a2 2 0 0 0-4 0'],
    'table': ['M4 5h16v14H4z', 'M4 10h16', 'M9 5v14', 'M15 5v14'],
    'math': ['M18 5H7l5 7-5 7h11', 'M15 9h4', 'M17 7v4'],
    'html': ['M3 5h18v14H3z', 'M3 9h18', 'M6 7h.01', 'M9 7h.01', 'M6 13h5', 'M6 16h9'],
    'code': ['M8 5H5v14h3', 'M16 5h3v14h-3', 'M10 9h.01', 'M14 9h.01', 'M10 15h4'],
    'quote': ['M5 10h5v5H5z', 'M14 10h5v5h-5z', 'M10 10c0-3-1-4-3-5', 'M19 10c0-3-1-4-3-5'],
    'highlight': ['M5 19h14', 'M8 15 15 8l3 3-7 7z', 'M6 18l3-3'],
    'emoji': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8.5 9h.01', 'M15.5 9h.01', 'M8 14c1 2 3 3 4 3s3-1 4-3'],
    'ordered-list': ['M4 6h1v4', 'M4 14h2l-2 3h2', 'M9 7h11', 'M9 12h11', 'M9 17h11'],
    'bullet-list': ['M5 7h.01', 'M5 12h.01', 'M5 17h.01', 'M9 7h11', 'M9 12h11', 'M9 17h11'],
    'task-list': ['M4 5h4v4H4z', 'M4 15h4v4H4z', 'm5 7 1 1 3-3', 'M11 7h9', 'M11 17h9'],
    'chart': ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M3 19h18'],
    'mermaid': ['M12 4v5', 'M6 15v5', 'M18 15v5', 'M6 9h12v6', 'M4 20h4', 'M10 4h4', 'M16 20h4'],
    'plantuml': ['M4 5h7v5H4z', 'M13 14h7v5h-7z', 'M11 7h4v9h-2'],
    'flowchart': ['M4 4h6v5H4z', 'M14 15h6v5h-6z', 'M7 9v4h10v2'],
    'sequence': ['M5 4v16', 'M19 4v16', 'M7 8h10', 'm14 6 3 2-3 2', 'M17 16H7', 'm10 14-3 2 3 2'],
    'footnote': ['M5 5h14v14H5z', 'M8 9h8', 'M8 13h5', 'M16 16h.01'],
    'copy-plain-text': ['M7 5h10', 'M12 5v14', 'M9 19h6'],
    'copy-markdown': ['M4 6h16v12H4z', 'M7 15V9l3 3 3-3v6', 'm15 12 2 2 2-2', 'M17 9v5'],
    'duplicate': ['M8 8h11v11H8z', 'M5 16V5h11', 'M13 14h4', 'M15 12v4'],
    'cut': ['M4 7l16 10', 'M4 17 20 7', 'M6 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0z', 'M6 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0z'],
    'promote': ['m6 14 6-6 6 6', 'm6 19 6-6 6 6'],
    'demote': ['m6 5 6 6 6-6', 'm6 10 6 6 6-6'],
};

const SVG_ICONS: Record<string, string[]> = {
    ...LUCIDE_ICONS,
    'strong': ['M7 4h6a4 4 0 0 1 0 8H7z', 'M7 12h7a4 4 0 0 1 0 8H7z'],
    'inline-code': ['m8 7-5 5 5 5', 'm16 7 5 5-5 5', 'M14 4 10 20'],
    'comment': ['M4 4h16v12H8l-4 4z', 'M8 8h8', 'M8 12h5'],
    'more': ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
};

const HEADING_NUMBER_ICONS = {
    'heading-number-continue': OFFICIAL_ICON_THEMES.lucide.icons['heading-number-continue'],
    'heading-number-restart': OFFICIAL_ICON_THEMES.lucide.icons['heading-number-restart'],
    'heading-number-set': OFFICIAL_ICON_THEMES.lucide.icons['heading-number-set'],
};

for (const icons of [TABLER_ICONS, LUCIDE_ICONS, HEROICONS_ICONS, FEATHER_ICONS, SVG_ICONS])
    Object.assign(icons, COMPLETE_MENU_ICONS, HEADING_NUMBER_ICONS);

/* ========== Theme configs ========== */
const ICON_THEMES: Record<IconThemeName, IconThemeConfig> = {
    tabler: {
        label: 'Tabler',
        viewBox: '0 0 24 24',
        strokeWidth: 1.5,
        strokeLinecap: 'square',
        strokeLinejoin: 'miter',
        icons: { ...TABLER_ICONS, ...OFFICIAL_ICON_THEMES.tabler.icons, ...HEADING_NUMBER_ICONS },
    },
    lucide: {
        label: 'Lucide',
        viewBox: '0 0 24 24',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: { ...LUCIDE_ICONS, ...OFFICIAL_ICON_THEMES.lucide.icons },
    },
    heroicons: {
        label: 'Heroicons',
        viewBox: '0 0 24 24',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: HEROICONS_ICONS,
    },
    feather: {
        label: 'Feather',
        viewBox: '0 0 24 24',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: FEATHER_ICONS,
    },
    svg: {
        label: 'SVG',
        viewBox: '0 0 24 24',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: SVG_ICONS,
    },
    phosphor: {
        label: OFFICIAL_ICON_THEMES.phosphor.label,
        viewBox: '0 0 256 256',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: OFFICIAL_ICON_THEMES.phosphor.icons,
    },
    remix: {
        label: OFFICIAL_ICON_THEMES.remix.label,
        viewBox: '0 0 24 24',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: OFFICIAL_ICON_THEMES.remix.icons,
    },
    material: {
        label: OFFICIAL_ICON_THEMES.material.label,
        viewBox: '0 0 24 24',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: OFFICIAL_ICON_THEMES.material.icons,
    },
    hugeicons: {
        label: OFFICIAL_ICON_THEMES.hugeicons.label,
        viewBox: '0 0 24 24',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: OFFICIAL_ICON_THEMES.hugeicons.icons,
    },
    mdi: {
        label: OFFICIAL_ICON_THEMES.mdi.label,
        viewBox: '0 0 24 24',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: OFFICIAL_ICON_THEMES.mdi.icons,
    },
    bootstrap: {
        label: OFFICIAL_ICON_THEMES.bootstrap.label,
        viewBox: '0 0 16 16',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        icons: OFFICIAL_ICON_THEMES.bootstrap.icons,
    },
};

/* ========== Runtime theme state ========== */
let currentTheme: IconThemeName = 'tabler';

export function getIconTheme(): IconThemeName {
    return currentTheme;
}

export function setIconTheme(theme: IconThemeName): void {
    if (ICON_THEMES[theme]) {
        currentTheme = theme;
    }
}

export function getIconThemeConfig(): IconThemeConfig {
    return ICON_THEMES[currentTheme];
}

export function getIconPaths(iconName: string): string[] | null {
    const config = ICON_THEMES[currentTheme];
    const icon = config.icons[iconName];
    return Array.isArray(icon) ? icon : null;
}

export function getIconDefinition(iconName: string): IconThemeIcon | null {
    return ICON_THEMES[currentTheme].icons[iconName] ?? null;
}

export function getAllThemeNames(): IconThemeName[] {
    return Object.keys(ICON_THEMES) as IconThemeName[];
}

export function getThemeLabel(theme: IconThemeName): string {
    return ICON_THEMES[theme]?.label ?? theme;
}
