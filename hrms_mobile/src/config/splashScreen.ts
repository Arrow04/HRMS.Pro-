import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import * as Font from 'expo-font';
SplashScreen.preventAutoHideAsync();
export function useAppPrepare() {
  const [appIsReady, setAppIsReady] = useState(false);
  useEffect(() => {
    async function prepare() {
      try { await Font.loadAsync({ 'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'), 'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'), 'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf') }); } catch (e) { console.warn('Prepare error:', e); } finally { setAppIsReady(true); await SplashScreen.hideAsync(); }
    }
    prepare();
  }, []);
  return appIsReady;
}
export default SplashScreen;
