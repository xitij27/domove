import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMedia } from './useMedia';

function Probe() {
  return <span>{useMedia('(max-width: 960px)') ? 'narrow' : 'wide'}</span>;
}

const screen = (matches: boolean) => vi.stubGlobal('window', {
  matchMedia: (query: string) => ({ matches: query === '(max-width: 960px)' && matches, addEventListener() {}, removeEventListener() {} }),
});

afterEach(() => vi.unstubAllGlobals());

describe('useMedia', () => {
  it('says whether the screen matches the query on the first render', () => {
    screen(true);
    expect(renderToStaticMarkup(<Probe />)).toContain('narrow');
    screen(false);
    expect(renderToStaticMarkup(<Probe />)).toContain('wide');
  });

  it('says no where there is no window', () => {
    expect(renderToStaticMarkup(<Probe />)).toContain('wide');
  });
});
