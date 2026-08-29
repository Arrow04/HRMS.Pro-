import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ScrollTopBar } from '../components/ScrollTopBar';

const ScrollTopBarHostContext = createContext(null);

export function ScrollTopBarHostProvider({ children }) {
  const [hidden, setHidden] = useState(false);
  const [slot, setSlot] = useState(null);

  const setTopBarHidden = useCallback((value) => {
    setHidden(Boolean(value));
  }, []);

  const register = useCallback((config) => {
    setSlot(config);
    setHidden(false);
  }, []);

  const unregister = useCallback((id) => {
    setSlot((prev) => (prev?.id === id ? null : prev));
  }, []);

  const value = useMemo(
    () => ({ setTopBarHidden, register, unregister }),
    [setTopBarHidden, register, unregister],
  );

  const barProps = slot || { rightAction: undefined, barStyle: {} };

  return (
    <ScrollTopBarHostContext.Provider value={value}>
      <View style={styles.root}>
        <View style={styles.content}>{children}</View>
        {!hidden ? (
          <View style={styles.portal} pointerEvents="box-none" collapsable={false}>
            <ScrollTopBar
              rightAction={barProps.rightAction}
              barStyle={barProps.barStyle}
            />
          </View>
        ) : null}
      </View>
    </ScrollTopBarHostContext.Provider>
  );
}

export function useScrollTopBarHost() {
  return useContext(ScrollTopBarHostContext);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  portal: Platform.select({
    web: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10000,
    },
    default: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10000,
      elevation: 100,
    },
  }),
});
