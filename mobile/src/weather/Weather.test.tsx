import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FORECAST } from './testForecast';
import { useWeather, WeatherButton, WeatherForecast } from './Weather';
import WeatherSymbol from './WeatherSymbol';

jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
const answer = { ok: true, status: 200, json: async () => FORECAST };

beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  // the symbols keep still, so no animation runs past the test
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
});
afterAll(() => { globalThis.fetch = originalFetch; });

/** The button under the compass and the card it opens, as the map shows them. */
function OnMap() {
  const { weather, failed, reload } = useWeather();
  const [open, setOpen] = useState(false);
  return (
    <>
      <WeatherButton weather={weather} failed={failed} open={open} theme="day" onPress={() => (weather ? setOpen(!open) : reload())} />
      {open && weather && <WeatherForecast weather={weather} theme="day" onClose={() => setOpen(false)} />}
    </>
  );
}

test("shows Dortmund's weather under the compass, and tells the forecast when tapped", async () => {
  fetchMock.mockResolvedValue(answer);
  await render(<OnMap />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Weather in Dortmund: Drizzle, 12°' }));
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('https://api.open-meteo.com/v1/forecast?latitude=51.5136&longitude=7.4653'));

  expect(screen.getByText('Drizzle for the next 12 hours. Today light rain, 10° to 15°.')).toBeOnTheScreen();
  expect(screen.getByText('Dortmund · feels like 11°')).toBeOnTheScreen();
  expect(screen.getByLabelText('04:00: Drizzle, 12°, 99% chance of rain')).toBeOnTheScreen();
  expect(screen.getByLabelText('Tomorrow: Drizzle, 9° to 13°, 51% chance of rain')).toBeOnTheScreen();
  // a small chance of rain goes unmentioned
  expect(screen.getByLabelText('Tuesday: Partly cloudy, 5° to 12°')).toBeOnTheScreen();
  expect(screen.getByText(/^Updated 03:45/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Close the forecast' }));
  expect(screen.queryByText(/^Drizzle for the next/)).not.toBeOnTheScreen();
});

test('says when the weather is unavailable, and tries again when tapped', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(answer);
  await render(<OnMap />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Weather unavailable' }));
  expect(await screen.findByRole('button', { name: 'Weather in Dortmund: Drizzle, 12°' })).toBeOnTheScreen();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test.each([0, 1, 3, 45, 53, 63, 81, 73, 95])('draws the sky of code %i by day and by night', async (code) => {
  for (const day of [true, false]) {
    await render(<WeatherSymbol code={code} day={day} theme="night" size={52} background="#232a36" still />);
    expect(screen.toJSON()).not.toBeNull();
  }
});
