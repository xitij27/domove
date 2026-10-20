// A site named as "place · work": the street in the city's spelling, the work in the dashboard's language.
// The city's own title, slashes and all, stays one hover or tap away. The components are in SiteName.tsx.
import { getLanguage, strings } from '../i18n';
import { ownerInEnglish, workInEnglish } from '../i18n/feedTerms';
import { parseTitle, workKinds } from '../model/siteName';
import type { SiteTitle } from '../model/siteName';
import type { Site } from '../model/sites';

export type Named = Pick<Site, 'title' | 'hypothetical'>;
export type SiteNameParts = { place: string; work: string; /** the work as the feed wrote it, in German */ german: boolean };

// ~200 titles, parsed again on every render otherwise
const parsed = new Map<string, SiteTitle>();
const parse = (title: string): SiteTitle => {
  let p = parsed.get(title);
  if (!p) parsed.set(title, (p = parseTitle(title)));
  return p;
};

/** The place, then the work: translated in English, as the city wrote it in German. A proposed project keeps the planner's name. */
export function siteName(site: Named): SiteNameParts {
  if (site.hypothetical) return { place: site.title, work: '', german: false };
  const { place, work } = parse(site.title);
  if (!work || getLanguage() === 'de') return { place, work, german: false };
  const kinds = workKinds(work);
  return kinds.length ? { place, work: workInEnglish(kinds), german: false } : { place, work, german: true };
}

/** "Spissenagelstraße · Water pipes", for text that can't hold elements: the map's popups. */
export const siteLabel = (site: Named): string => {
  const n = siteName(site);
  return n.work ? `${n.place} · ${n.work}` : n.place;
};

/** The street alone, for sentences: "Start Spissenagelstraße 47 days later". */
export const placeOf = (title: string): string => parse(title).place;

/** The feed's own title, for a tooltip; nothing for a proposed project, whose name is already the planner's. */
export const publishedTitle = (site: Named): string | undefined =>
  site.hypothetical ? undefined : strings().siteName.asPublished(site.title);

/** Who orders the works, with the city's offices named in English. */
export const ownerName = (owner: string): string => (getLanguage() === 'en' ? ownerInEnglish(owner) : owner);

