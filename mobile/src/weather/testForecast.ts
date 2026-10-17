import type { Forecast } from './weather';

// Open-Meteo's forecast for Dortmund at 03:45 on 17 Oct 2026, a drizzly night.
export const FORECAST: Forecast = {
  current: { time: '2026-10-17T03:45', temperature_2m: 12.3, apparent_temperature: 10.8, is_day: 0, weather_code: 53, wind_gusts_10m: 22.7 },
  hourly: {
    time: ['2026-10-17T03:00', '2026-10-17T04:00', '2026-10-17T05:00', '2026-10-17T06:00', '2026-10-17T07:00', '2026-10-17T08:00', '2026-10-17T09:00', '2026-10-17T10:00', '2026-10-17T11:00', '2026-10-17T12:00', '2026-10-17T13:00', '2026-10-17T14:00', '2026-10-17T15:00'],
    temperature_2m: [12.3, 12.3, 12.4, 12.2, 11.9, 12.0, 12.0, 12.1, 12.0, 11.5, 11.4, 12.3, 13.1],
    weather_code: [55, 53, 3, 3, 51, 51, 3, 51, 51, 55, 55, 3, 3],
    precipitation_probability: [100, 99, 94, 93, 91, 90, 89, 87, 86, 87, 89, 86, 76],
    is_day: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  daily: {
    time: ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'],
    weather_code: [61, 53, 3, 2, 61],
    temperature_2m_max: [14.7, 13.0, 14.1, 12.1, 11.0],
    temperature_2m_min: [10.3, 8.9, 8.0, 4.8, 5.1],
    precipitation_probability_max: [100, 51, 36, 6, 37],
  },
};
