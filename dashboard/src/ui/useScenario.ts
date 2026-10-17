import { useCallback, useEffect, useState } from 'react';
import { decodeScenario, EMPTY_SCENARIO, encodeScenario, isEmpty } from '../model/scenario';
import type { Scenario } from '../model/scenario';

const read = (): Scenario => {
  const s = new URLSearchParams(window.location.hash.slice(1)).get('s');
  return s ? decodeScenario(s) : EMPTY_SCENARIO;
};

/** The scenario lives in the URL hash: reloading keeps it, copying the link shares it. */
export function useScenario(): [Scenario, (next: Scenario) => void] {
  const [scenario, setScenario] = useState(read);
  useEffect(() => {
    const onHash = () => setScenario(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const update = useCallback((next: Scenario) => {
    setScenario(next);
    const url = new URL(window.location.href);
    url.hash = isEmpty(next) ? '' : `s=${encodeScenario(next)}`;
    window.history.replaceState(null, '', url); // replaceState fires no hashchange
  }, []);
  return [scenario, update];
}
