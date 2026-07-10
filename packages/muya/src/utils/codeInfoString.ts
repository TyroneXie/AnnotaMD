const TITLE_ATTRIBUTE = /(^|\s)title=(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)')/;

function unescapeAttribute(value: string) {
    return value.replace(/\\([\\"'])/g, '$1');
}

export function codeInfoTitle(info: string) {
    const match = info.match(TITLE_ATTRIBUTE);
    return match ? unescapeAttribute(match[2] ?? match[3] ?? '') : '';
}

export function withCodeInfoTitle(info: string, title: string) {
    const trimmedTitle = title.trim();
    const withoutTitle = info.replace(TITLE_ATTRIBUTE, '$1').trim();
    if (!trimmedTitle)
        return withoutTitle;

    const escapedTitle = trimmedTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${withoutTitle}${withoutTitle ? ' ' : ''}title="${escapedTitle}"`;
}

export function withCodeInfoLanguage(info: string, language: string) {
    const rest = info.trim().replace(/^\S+\s*/, '');
    const trimmedLanguage = language.trim();
    return `${trimmedLanguage}${trimmedLanguage && rest ? ' ' : ''}${rest}`;
}
