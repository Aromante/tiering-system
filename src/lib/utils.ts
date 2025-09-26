export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

// Normalize text for diacritic-insensitive, case-insensitive matching
export function normalizeText(input: string): string {
  try {
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  } catch {
    return String(input || '').toLowerCase();
  }
}
