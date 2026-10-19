// Dortmund's weather, from Open-Meteo: free and without a key, and over Germany it forecasts with the DWD's ICON
// models. Its data is CC BY 4.0, so the forecast card credits it.
import { strings } from '../i18n';

export const CITY = 'Dortmund';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast?latitude=51.5136&longitude=7.4653&timezone=Europe%2FBerlin'
  + '&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_gusts_10m'
  + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=13'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=5';

/** What the sky is doing, as the weather symbol draws it. */
export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'showers' | 'snow' | 'thunder';

// Codes are WMO weather codes; times are local, e.g. "2026-10-17T15:00".
export type Hour = { time: string; code: number; day: boolean; temperature: number; rainChance: number | null };
export type Day = { date: string; code: number; high: number; low: number; rainChance: number | null };
export type Weather = {
  time: string; // of the current conditions, every quarter hour
  code: number;
  day: boolean;
  temperature: number;
  feelsLike: number;
  gusts: number; // km/h
  hours: Hour[]; // from the next whole hour, 12 of them
  days: Day[]; // from today, 5 of them
};

type Series<T> = (T | null)[];
export type Forecast = {
  current: { time: string; temperature_2m: number; apparent_temperature: number | null; is_day: number; weather_code: number; wind_gusts_10m: number | null };
  hourly: { time: string[]; temperature_2m: Series<number>; weather_code: Series<number>; precipitation_probability: Series<number>; is_day: Series<number> };
  daily: { time: string[]; weather_code: Series<number>; temperature_2m_max: Series<number>; temperature_2m_min: Series<number>; precipitation_probability_max: Series<number> };
};

const FREEZING = new Set([48, 56, 57, 66, 67]);
const WET = new Set<Sky>(['drizzle', 'rain', 'showers', 'snow', 'thunder']);
/** An hour this likely to rain counts as wet, whatever its code says. */
const LIKELY = 60;
/** Gusts from here on are worth a mention; the DWD warns of strong gusts from 50 km/h. */
const WINDY = 50;

/** The WMO code in words, in the app's language. */
export function describe(code: number, day: boolean) {
  const t = strings().weather;
  if (day && code === 0) return t.sunny;
  if (day && code === 1) return t.mostlySunny;
  return t.names[code] ?? t.cloudy;
}

export function skyOf(code: number): Sky {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}

/** Whether it rains, snows or storms. */
export const isWet = (code: number) => WET.has(skyOf(code));

/** Rounded, and never "-0°". */
export const degrees = (celsius: number) => `${Math.round(celsius) || 0}°`;

/** "15:00" from "2026-10-17T15:00". */
export const clockTime = (time: string) => time.slice(11, 16);

/** "Today", "Tomorrow" or the weekday of `date`, seen from `today`, both as "2026-10-17". */
export function dayName(date: string, today: string) {
  const noon = (d: string) => new Date(`${d}T12:00:00Z`).getTime();
  const ahead = Math.round((noon(date) - noon(today)) / 86_400_000);
  const t = strings().weather;
  if (ahead === 0) return t.today;
  if (ahead === 1) return t.tomorrow;
  return t.days[new Date(noon(date)).getUTCDay()];
}

export function toWeather(forecast: Forecast): Weather {
  const { current, hourly, daily }: Partial<Forecast> = forecast ?? {};
  if (typeof current?.temperature_2m !== 'number' || typeof current.weather_code !== 'number' || !hourly?.time || !daily?.time) {
    throw new Error('Weather: unexpected response');
  }
  const hours = hourly.time.flatMap((time, i) => {
    const temperature = hourly.temperature_2m[i];
    const code = hourly.weather_code[i];
    // the hour the current conditions fall in is already past its start
    if (time <= current.time || temperature == null || code == null) return [];
    return [{ time, code, day: hourly.is_day[i] === 1, temperature, rainChance: hourly.precipitation_probability[i] ?? null }];
  });
  const days = daily.time.flatMap((date, i) => {
    const code = daily.weather_code[i];
    const high = daily.temperature_2m_max[i];
    const low = daily.temperature_2m_min[i];
    if (code == null || high == null || low == null) return [];
    return [{ date, code, high, low, rainChance: daily.precipitation_probability_max[i] ?? null }];
  });
  return {
    time: current.time,
    code: current.weather_code,
    day: current.is_day === 1,
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature ?? current.temperature_2m,
    gusts: current.wind_gusts_10m ?? 0,
    hours: hours.slice(0, 12),
    days,
  };
}

export async function fetchWeather(): Promise<Weather> {
  const res = await fetch(FORECAST_URL);
  if (!res.ok) throw new Error(`Weather: HTTP ${res.status}`);
  return toWeather(await res.json());
}

/**
 * What the forecast card says, the way a forecaster would: the hours ahead, then the day, then anything to watch
 * out for on the way, e.g. "Light rain until about 16:00, then overcast. Today light rain, 9° to 14°."
 */
export function outlook(weather: Weather): string {
  const t = strings().weather;
  const { hours } = weather;
  const wet = (h: Hour) => isWet(h.code) || (h.rainChance ?? 0) >= LIKELY;
  const sentences: string[] = [];

  if (hours.length > 0) {
    const now = describe(weather.code, weather.day);
    if (isWet(weather.code)) {
      const dry = hours.findIndex((h) => !wet(h));
      const again = dry < 0 ? undefined : hours.slice(dry).find(wet);
      if (dry < 0) sentences.push(t.wetAll(now, hours.length));
      else if (again) sentences.push(t.wetAgain(now, clockTime(hours[dry].time), clockTime(again.time)));
      else sentences.push(t.wetThen(now, clockTime(hours[dry].time), describe(hours[dry].code, hours[dry].day)));
    } else {
      const next = hours.find(wet);
      // an hour can be likely to rain while its own code, the single likeliest outcome, stays dry
      if (next) sentences.push(t.wetFrom(isWet(next.code) ? describe(next.code, next.day) : null, clockTime(next.time)));
      else sentences.push(t.dry(hours.length));
    }
  }

  // in the evening, tomorrow matters more than what is left of today
  const evening = Number(weather.time.slice(11, 13)) >= 18;
  const day = weather.days[evening ? 1 : 0];
  if (day) sentences.push(t.day(evening, describe(day.code, true), degrees(day.low), degrees(day.high)));

  if (weather.gusts >= WINDY) sentences.push(t.gusts(Math.round(weather.gusts)));
  const icy = (code: number, temperature: number) => FREEZING.has(code) || skyOf(code) === 'snow' || (isWet(code) && temperature <= 1);
  if (icy(weather.code, weather.temperature) || hours.some((h) => icy(h.code, h.temperature))) sentences.push(t.slippery);

  return sentences.join(' ');
}
