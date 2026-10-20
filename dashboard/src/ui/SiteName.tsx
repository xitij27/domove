// A site's name as an element: the place, then the work, quieter. Worked out in siteNames.ts.
import { useLanguage } from '../i18n';
import type { Site } from '../model/sites';
import { publishedTitle, siteName } from './siteNames';
import type { Named } from './siteNames';

export function SiteName({ site }: { site: Named }) {
  useLanguage();
  const n = siteName(site);
  return (
    <span className="site-name">
      <span className="site-place">{n.place}</span>
      {n.work && <span className="site-work"><span aria-hidden="true"> · </span><span lang={n.german ? 'de' : undefined}>{n.work}</span></span>}
    </span>
  );
}

/** A site's name as a link to its panel. */
export function SiteLink({ site, onSelect }: { site: Named & Pick<Site, 'id'>; onSelect: (id: string) => void }) {
  useLanguage();
  return (
    <button className="link-button" title={publishedTitle(site)} onClick={() => onSelect(site.id)}>
      <SiteName site={site} />
    </button>
  );
}
