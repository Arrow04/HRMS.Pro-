import React from 'react';

describe('AuthStore', () => {
  let useAuthStore: any;

  beforeAll(() => {
    jest.mock('../store', () => ({
      useAuthStore: {
        getState: jest.fn(),
        setState: jest.fn(),
      },
    }));
    useAuthStore = require('../store').useAuthStore;
  });

  it('should have initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});
