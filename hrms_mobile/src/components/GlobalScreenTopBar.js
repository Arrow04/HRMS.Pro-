import React, { useCallback, useEffect, useLayoutEffect } from 'react';
import { findFocusedRoute } from '@react-navigation/native';
import { useScrollTopBarHost } from '../context/ScrollTopBarHost';

const HIDDEN_ROUTES = new Set(['Login']);

export function getFocusedRouteName(state) {
  if (!state) return null;
  return findFocusedRoute(state)?.name ?? null;
}

function shouldHideTopBar(routeName) {
  return !routeName || HIDDEN_ROUTES.has(routeName);
}

export default function GlobalScreenTopBar({ navigationRef, navEpoch = 0 }) {
  const host = useScrollTopBarHost();

  const syncVisibility = useCallback(() => {
    if (!host) return;

    if (!navigationRef?.isReady?.()) {
      host.setTopBarHidden(false);
      return;
    }

    const routeName = getFocusedRouteName(navigationRef.getRootState());
    host.setTopBarHidden(shouldHideTopBar(routeName));
  }, [host, navigationRef]);

  useLayoutEffect(() => {
    syncVisibility();
  }, [syncVisibility, navEpoch]);

  useEffect(() => {
    syncVisibility();
    const timers = [16, 100, 300].map((ms) => setTimeout(syncVisibility, ms));
    return () => timers.forEach(clearTimeout);
  }, [syncVisibility, navEpoch]);

  return null;
}
