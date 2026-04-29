import { describe, expect, it } from 'vitest';

import { getLoggerBindings } from './index';

describe('logger bindings', () => {
  it('keeps only defined bindings', () => {
    expect(
      getLoggerBindings({
        requestId: 'req-1',
        route: '/users',
        method: 'GET',
      }),
    ).toEqual({
      requestId: 'req-1',
      route: '/users',
      method: 'GET',
    });
  });
});
