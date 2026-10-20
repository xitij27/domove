import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { SiteLink } from './SiteName';
import { ownerName, siteLabel, siteName } from './siteNames';

const site = (title: string, hypothetical = false) => ({ id: 'x', title, hypothetical });
afterEach(() => setLanguage('en', false));

describe('site names', () => {
  it('names the place and the work in English, without the closure', () => {
    expect(siteLabel(site('Spissenagelstraße - Arbeiten an den Wasserleitungen // Vollsperrung'))).toBe('Spissenagelstraße · Water pipes');
    expect(siteLabel(site('Gronaustraße - Notmaßnahme Wasserrohrbruch // Vollsperrung'))).toBe('Gronaustraße · Emergency: burst water main');
    expect(siteLabel(site('Steinäckerstraße - KVP // Vollsperrung'))).toBe('Steinäckerstraße · Wartime bomb check');
    expect(siteLabel(site('Preinstraße - Arbeiten an Wasser-und Stromleitungen // Vollsperrung'))).toBe('Preinstraße · Power lines, water pipes');
  });

  it('keeps the city\'s words where there is no English for them, as plain text', () => {
    const n = siteName(site('Leopoldstraße // Quartier Burgtor -  Halbseitige Sperrung'));
    expect(n).toEqual({ place: 'Leopoldstraße', work: 'Quartier Burgtor', german: true });
    const html = renderToStaticMarkup(<SiteLink site={site('Leopoldstraße // Quartier Burgtor -  Halbseitige Sperrung')} onSelect={() => {}} />);
    expect(html).toContain('<span lang="de">Quartier Burgtor</span>');
  });

  it('shows the city\'s own work words in German', () => {
    setLanguage('de', false);
    expect(siteLabel(site('Spissenagelstraße - Arbeiten an den Wasserleitungen // Vollsperrung'))).toBe('Spissenagelstraße · Arbeiten an den Wasserleitungen');
    expect(ownerName('Privatmaßnahme')).toBe('Privatmaßnahme');
  });

  it('keeps the city\'s title one hover away, and a proposed project\'s name as typed', () => {
    const html = renderToStaticMarkup(<SiteLink site={site('Hallerey / Glasfaser // Vollsperrung')} onSelect={() => {}} />);
    expect(html).toContain('title="The city&#x27;s text: Hallerey / Glasfaser // Vollsperrung"');
    expect(html).not.toContain('//</span>');
    expect(siteLabel(site('School - phase 2', true))).toBe('School - phase 2');
  });

  it('names the city\'s offices in English', () => {
    expect(ownerName('StA 66 - Tiefbauamt')).toBe('Civil engineering office (StA 66)');
    expect(ownerName('Privatmaßnahme')).toBe('Private works');
    expect(ownerName('Dortmunder Netz')).toBe('Dortmunder Netz');
  });
});
