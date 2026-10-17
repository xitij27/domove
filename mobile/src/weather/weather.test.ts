import { FORECAST } from './testForecast';
import { dayName, degrees, describe, outlook, skyOf, toWeather, type Forecast, type Hour, type Weather } from './weather';

const hour = (time: string, code: number, rainChance: number | null = 0, temperature = 12): Hour =>
  ({ time: `2026-10-17T${time}`, code, day: true, temperature, rainChance });
const dry: Weather = {
  time: '2026-10-17T13:15', code: 2, day: true, temperature: 14, feelsLike: 13, gusts: 20,
  hours: ['14:00', '15:00', '16:00', '17:00'].map((t) => hour(t, 2)),
  days: [{ date: '2026-10-17', code: 2, high: 15.4, low: 8.2, rainChance: 10 }, { date: '2026-10-18', code: 61, high: 12, low: 7, rainChance: 80 }],
};

test('reads the current weather, the hours after it and the days', () => {
  const weather = toWeather(FORECAST);
  expect(weather).toMatchObject({ time: '2026-10-17T03:45', code: 53, day: false, temperature: 12.3, feelsLike: 10.8, gusts: 22.7 });
  // the 03:00 hour is under way
  expect(weather.hours).toHaveLength(12);
  expect(weather.hours[0]).toEqual({ time: '2026-10-17T04:00', code: 53, day: false, temperature: 12.3, rainChance: 99 });
  expect(weather.hours[4]).toMatchObject({ time: '2026-10-17T08:00', day: true });
  expect(weather.days[1]).toEqual({ date: '2026-10-18', code: 53, high: 13, low: 8.9, rainChance: 51 });
});

test('skips hours and days with gaps, and rejects anything else', () => {
  const gaps = toWeather({
    ...FORECAST,
    hourly: { ...FORECAST.hourly, temperature_2m: FORECAST.hourly.temperature_2m.map((t, i) => (i === 1 ? null : t)) },
    daily: { ...FORECAST.daily, temperature_2m_max: [null, 13, 14.1, 12.1, 11] },
  });
  expect(gaps.hours[0].time).toBe('2026-10-17T05:00');
  expect(gaps.days[0].date).toBe('2026-10-18');
  expect(() => toWeather({ error: true, reason: 'Invalid' } as unknown as Forecast)).toThrow('unexpected response');
});

test.each([
  [0, 'clear'], [1, 'partly'], [2, 'partly'], [3, 'cloudy'], [45, 'fog'], [48, 'fog'], [53, 'drizzle'], [57, 'drizzle'],
  [61, 'rain'], [67, 'rain'], [71, 'snow'], [77, 'snow'], [80, 'showers'], [82, 'showers'], [85, 'snow'], [95, 'thunder'], [99, 'thunder'],
])('code %i draws a %s sky', (code, sky) => {
  expect(skyOf(code)).toBe(sky);
});

test('names the weather, sunny only by day', () => {
  expect(describe(0, true)).toBe('Sunny');
  expect(describe(0, false)).toBe('Clear');
  expect(describe(1, true)).toBe('Mostly sunny');
  expect(describe(63, false)).toBe('Rain');
  expect(describe(42, true)).toBe('Cloudy');
});

test('rounds temperatures without a minus zero, and names days from today', () => {
  expect(degrees(12.5)).toBe('13°');
  expect(degrees(-0.4)).toBe('0°');
  expect(degrees(-3.6)).toBe('-4°');
  expect(dayName('2026-10-17', '2026-10-17')).toBe('Today');
  expect(dayName('2026-10-18', '2026-10-17')).toBe('Tomorrow');
  expect(dayName('2026-10-19', '2026-10-17')).toBe('Monday');
  expect(dayName('2026-11-01', '2026-10-31')).toBe('Tomorrow');
});

test('says how long the drizzle lasts when every hour ahead is likely wet, and how the day goes', () => {
  expect(outlook(toWeather(FORECAST))).toBe('Drizzle for the next 12 hours. Today light rain, 10° to 15°.');
});

test('says when the rain stops, and whether it comes back', () => {
  const raining = { ...dry, code: 61 };
  expect(outlook({ ...raining, hours: [hour('14:00', 61, 90), hour('15:00', 3, 30), hour('16:00', 2, 10)] }))
    .toBe('Light rain until about 15:00, then overcast. Today partly cloudy, 8° to 15°.');
  expect(outlook({ ...raining, hours: [hour('14:00', 3, 20), hour('15:00', 80, 70)] }))
    .toBe('Light rain until about 14:00, and again from about 15:00. Today partly cloudy, 8° to 15°.');
});

test('says when rain starts, also when only its chance is high', () => {
  expect(outlook(dry)).toBe('Dry for the next 4 hours. Today partly cloudy, 8° to 15°.');
  expect(outlook({ ...dry, hours: [hour('14:00', 2), hour('15:00', 81, 40)] })).toMatch(/^Showers from about 15:00\./);
  expect(outlook({ ...dry, hours: [hour('14:00', 2), hour('15:00', 3, 75)] })).toMatch(/^Rain likely from about 15:00\./);
});

test('in the evening it talks about tomorrow, and it warns of gusts and slippery roads', () => {
  expect(outlook({ ...dry, time: '2026-10-17T19:00' })).toBe('Dry for the next 4 hours. Tomorrow light rain, 7° to 12°.');
  expect(outlook({ ...dry, gusts: 61.6 })).toMatch(/ Gusts up to 62 km\/h\.$/);
  expect(outlook({ ...dry, hours: [hour('14:00', 2), hour('15:00', 61, 80, 0.5)] })).toMatch(/ Roads and paths may be slippery\.$/);
  expect(outlook({ ...dry, code: 48 })).toMatch(/ Roads and paths may be slippery\.$/);
});
