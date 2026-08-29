import { useLayoutEffect, useId, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollTopBarHost } from '../context/ScrollTopBarHost';
import { getStickyBarContentOffset } from '../components/ScrollTopBar';

const EMPTY_BAR_STYLE = {};

export function useScrollTopBar() {
  const insets = useSafeAreaInsets();
  const contentOffset = useMemo(
    () => getStickyBarContentOffset(insets),
    [insets.top],
  );

  return useMemo(() => ({
    visible: true,
    contentOffset,
    barStyle: EMPTY_BAR_STYLE,
    scrollEventThrottle: 16,
  }), [contentOffset]);
}

export function useRegisterScrollTopBar({
  rightAction,
  scrollTopBar,
}) {
  const host = useScrollTopBarHost();
  const id = useId();

  useLayoutEffect(() => {
    if (!host || !scrollTopBar) return undefined;

    host.register({
      id,
      rightAction,
      visible: true,
      barStyle: scrollTopBar.barStyle,
    });

    return () => host.unregister(id);
  }, [host, id, rightAction, scrollTopBar]);
}
