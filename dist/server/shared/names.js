export function normalizeNickname(value) {
    if (typeof value !== 'string' || value.length > 128)
        return null;
    const normalized = value.normalize('NFC').replace(/\p{Cc}/gu, '').replace(/\s+/gu, ' ').trim();
    const length = Array.from(normalized).length;
    return length >= 1 && length <= 16 ? normalized : null;
}
