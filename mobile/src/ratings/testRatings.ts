// Rows as public.site_ratings() returned them for the half closure on Kaiserstraße, from the live data on 17 Oct 2026.

const closure = {
  factor: 'closure', points: 3.6, impact: 'slowed', penalty_s: 120, closures: ['half', 'narrowing'],
  road_class: 'main', road_name: 'Kaiserstraße', max: 6, closure_factor: 0.6, road_factor: 1,
};

/** For a car at 08:00 on a school-day Monday. */
export const schoolDayRow = {
  site_id: 's1', rating: 9, score: 8.7, band: 'severe', impact: 'slowed', active: true,
  starts_on: '2026-10-14', ends_on: '2026-11-13', disruption: 4.7, surroundings: 4.0,
  rated_at: '2026-11-02T07:00:00+00:00',
  reasons: [
    closure,
    { factor: 'rush_hour', points: 1.1, multiplier: 1.3 },
    { factor: 'school', points: 1.5, name: 'Berswordt-Europa-Grundschule', primary: true, m: 83 },
    { factor: 'school_route_crossings', points: 1.5, count: 4 },
    { factor: 'care', points: 0.5, kind: 'kindergarten', name: 'Ev. Kiga Melanchthon', m: 79 },
    { factor: 'transit', points: 0.5, kind: 'rail_stop', name: 'Von-der-Tann-Straße', m: 14 },
  ],
};

/** The same at 08:00 on a Monday in the autumn holidays. */
export const holidayRow = {
  ...schoolDayRow,
  rating: 6, score: 6.2, band: 'medium', surroundings: 1.5, rated_at: '2026-10-19T06:00:00+00:00',
  reasons: [
    closure,
    { factor: 'rush_hour', points: 1.1, multiplier: 1.3 },
    { factor: 'school', points: 0, name: 'Berswordt-Europa-Grundschule', primary: true, m: 83, not_counted: 'school_holiday', free_day: 'Herbstferien' },
    { factor: 'school_route_crossings', points: 0, count: 4, not_counted: 'school_holiday', free_day: 'Herbstferien' },
    { factor: 'crossings', points: 0.5, count: 4 },
    { factor: 'care', points: 0.5, kind: 'kindergarten', name: 'Ev. Kiga Melanchthon', m: 79 },
    { factor: 'transit', points: 0.5, kind: 'rail_stop', name: 'Von-der-Tann-Straße', m: 14 },
  ],
};

/** As public.route_site_ratings() returns it for a route that only crosses the site. */
export const crossingRouteRow = {
  ...schoolDayRow, along_m: 12, route_use: 'crosses', weight: 0.3, effective_score: 2.6, effective_rating: 3,
};
