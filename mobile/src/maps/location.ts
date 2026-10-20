import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { Gyroscope } from 'expo-sensors';
import type { Coordinate } from '../routes/model';

/** Asks once to show the user on the map; false until they allow it. */
export function useLocationGranted() {
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then((p) => setGranted(p.granted), () => {});
  }, []);
  return granted;
}

/** Without a gyroscope the facing direction comes from the magnetometer alone, which is jumpy; null until known. */
export function useHasGyroscope() {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    Gyroscope.isAvailableAsync().then(setHas, () => setHas(false));
  }, []);
  return has;
}

/** Where the user is and which way they face (degrees from north, null without a compass), once location is allowed. */
export function useUserPosition() {
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    let gone = false;
    const subscriptions: Location.LocationSubscription[] = [];
    const keep = (subscription: Location.LocationSubscription) => {
      if (gone) subscription.remove();
      else subscriptions.push(subscription);
    };
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 3 }, ({ coords }) => {
      setCoordinate({ latitude: coords.latitude, longitude: coords.longitude });
    }).then(keep, () => {});
    // Rounded so the sensor's noise doesn't re-render the marker many times a second.
    Location.watchHeadingAsync(({ trueHeading, magHeading }) => {
      setHeading(Math.round(trueHeading >= 0 ? trueHeading : magHeading));
    }).then(keep, () => {});
    return () => {
      gone = true;
      subscriptions.forEach((s) => s.remove());
    };
  }, []);

  return coordinate && { coordinate, heading };
}

