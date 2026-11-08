/**
 * The bot's keyword matching, mirrored from the Worker (src/match.ts) so the
 * editor can preview a draft automation before it's saved. Same normalisation:
 * accents folded, emoji and punctuation dropped, case ignored.
 */
const FOLD: Record<string, string> = { 'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D', 'ł': 'l', 'Ł': 'L', 'ø': 'o', 'Ø': 'O', 'ß': 'ss', 'ẞ': 'SS', 'þ': 'th', 'Þ': 'TH' };
const FOLD_RE = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g');

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(FOLD_RE, (c) => FOLD[c] ?? c)
    .replace(/([A-Za-z])\p{Diacritic}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[️‍]/g, ' ')
    .replace(/\p{P}/gu, ' ')
    .replace(/\p{S}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEP = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Thai}\\p{Script=Lao}\\p{Script=Khmer}\\p{Script=Myanmar}]';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function keywordHit(comment: string, keyword: string, mode: 'word' | 'contains'): boolean {
  const c = normalize(comment);
  const k = normalize(keyword);
  if (!k) return false;
  if (mode === 'contains') return c.includes(k);
  return new RegExp(`(?<=^|[^\\p{L}\\p{N}]|${SEP})${esc(k)}(?=$|[^\\p{L}\\p{N}]|${SEP})`, 'u').test(c);
}

export function previewMatch(comment: string, keywords: string[], excludes: string[], mode: 'word' | 'contains'): { hit: string | null; blockedBy: string | null } {
  const hit = keywords.find((k) => keywordHit(comment, k, mode)) ?? null;
  const blockedBy = hit ? (excludes.find((x) => keywordHit(comment, x, 'word')) ?? null) : null;
  return { hit, blockedBy };
}
