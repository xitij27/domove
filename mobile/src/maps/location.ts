import { useCallback, useEffect, useState, type RefObject } from 'react';
import * as Location from 'expo-location';
import { Gyroscope } from 'expo-sensors';
import type { Coordinate, TransportMode } from '../routes/model';
import type { MapHandle } from './Compass';
import { FOLLOW_MS, FOLLOW_START_MS, FOLLOW_ZOOM, followHeading, TURN_MS, TURN_STEP, turnBetween } from './navigation';

/** Asks once to show the user on the map; false until they allow it. `ask` asks again, as starting a route does. */
export function useLocationGranted() {
  const [granted, setGranted] = useState(false);
  const ask = useCallback(() => Location.requestForegroundPermissionsAsync().then((p) => {
    setGranted(p.granted);
    return p;
  }), []);
  useEffect(() => {
    ask().catch(() => {});
  }, [ask]);
  return [granted, ask] as const;
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

/**
 * While `mode` is set, keeps the map on the user, turned the way they go (see followHeading): each fix glides the
 * camera on to them. Nothing renders for it, as fixes and compass readings come in many times a second.
 */
export function useFollowUser(map: RefObject<MapHandle | null>, mode: TransportMode | null) {
  useEffect(() => {
    if (!mode) return;
    let gone = false;
    let center: Coordinate | null = null;
    let course: number | null = null;
    let speed: number | null = null;
    let compass: number | null = null;
    let heading: number | null = null;
    let turnedAt = 0;
    const subscriptions: Location.LocationSubscription[] = [];
    const keep = (subscription: Location.LocationSubscription) => {
      if (gone) subscription.remove();
      else subscriptions.push(subscription);
    };
    const move = (ms: number, glide: boolean) => {
      if (center) map.current?.follow({ center, heading, zoom: FOLLOW_ZOOM[mode], ms, glide });
    };
    const onFix = (coords: Location.LocationObjectCoords) => {
      const first = center === null;
      center = { latitude: coords.latitude, longitude: coords.longitude };
      course = coords.heading;
      speed = coords.speed;
      heading = followHeading(course, speed, compass, heading, mode);
      move(first ? FOLLOW_START_MS : FOLLOW_MS, !first);
    };

    // The first fix can take a while, so the last known position brings the camera down at once.
    Location.getLastKnownPositionAsync({ maxAge: 60_000 }).then((last) => {
      if (!gone && last && center === null) onFix(last.coords);
    }, () => {});
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: FOLLOW_MS }, ({ coords }) => onFix(coords)).then(keep, () => {});
    // Turns in steps, at most a few times a second, so the compass shaking doesn't keep the map moving.
    Location.watchHeadingAsync(({ trueHeading, magHeading }) => {
      compass = trueHeading >= 0 ? trueHeading : magHeading;
      const next = followHeading(course, speed, compass, heading, mode);
      const now = Date.now();
      if (next === null || (heading !== null && turnBetween(heading, next) < TURN_STEP) || now - turnedAt < TURN_MS) return;
      heading = next;
      turnedAt = now;
      move(TURN_MS, true);
    }).then(keep, () => {});

    return () => {
      gone = true;
      subscriptions.forEach((s) => s.remove());
    };
  }, [map, mode]);
}
