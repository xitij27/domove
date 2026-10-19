import { createElement, Fragment } from 'react';
import type { ReactNode } from 'react';

/** A sentence with elements in it, such as a figure with its working: the parts in order, as one node. */
export const rich = (...parts: ReactNode[]): ReactNode => createElement(Fragment, null, ...parts);
