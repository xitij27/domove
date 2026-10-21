import { useEffect, useState } from 'react';

const matches = (query: string) => typeof window !== 'undefined' && window.matchMedia(query).matches;

/** Whether the screen matches a media query, such as a phone's width; follows it as the window resizes. */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => matches(query));
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatch(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return match;
}
