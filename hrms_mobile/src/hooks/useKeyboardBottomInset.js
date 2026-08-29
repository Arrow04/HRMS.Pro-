import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Extra bottom lift so a fixed input bar sits flush above the keyboard.
 * Works in Expo Go (adjustPan) without relying on KeyboardAvoidingView.
 */
export function useKeyboardBottomInset() {
  const insets = useSafeAreaInsets();
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event) => {
      const keyboardHeight = event?.endCoordinates?.height ?? 0;
      setBottomInset(Math.max(0, keyboardHeight - insets.bottom));
    };

    const onHide = () => setBottomInset(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  return bottomInset;
}
