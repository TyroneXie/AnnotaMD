import { isValidAttribute } from './dompurify';

export function sanitizeHyperlink(rawLink: string) {
    if (
        rawLink
        && typeof rawLink === 'string'
        && isValidAttribute('a', 'href', rawLink)
    ) {
        return rawLink;
    }

    return '';
}

export function isUrlLikeLinkText(text: string, href: string): boolean {
    try {
        const host = new URL(href).hostname.replace(/^www\./i, '').toLowerCase();
        const normalized = decodeURIComponent(text)
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .trim()
            .toLowerCase();
        return normalized === host || normalized.startsWith(`${host}/`);
    }
    catch {
        return text === href;
    }
}

export function getDefaultLinkIcon(href: string): string {
    try {
        const url = new URL(href);
        return /https?:/.test(url.protocol) ? new URL('/favicon.ico', url).toString() : '';
    }
    catch {
        return '';
    }
}
