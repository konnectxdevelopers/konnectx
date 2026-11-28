import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { Dimensions, Keyboard, ScrollView } from 'react-native';

const KeyboardNavigationContext = createContext(null);

export function useKeyboardNavigation() {
  return useContext(KeyboardNavigationContext);
}

export default function KeyboardAwareScrollView({
  children,
  onScroll,
  scrollEventThrottle,
  ...props
}) {
  const scrollViewRef = useRef(null);
  const inputRefs = useRef([]);
  const focusedInput = useRef(null);
  const keyboardVisible = useRef(false);
  const keyboardTop = useRef(null);
  const scrollOffset = useRef(0);

  const registerInput = useCallback((input) => {
    if (input && !inputRefs.current.includes(input)) {
      inputRefs.current.push(input);
    }
  }, []);

  const unregisterInput = useCallback((input) => {
    inputRefs.current = inputRefs.current.filter((item) => item !== input);
    if (focusedInput.current === input) {
      focusedInput.current = null;
    }
  }, []);

  const focusNextInput = useCallback((currentInput) => {
    const currentIndex = inputRefs.current.indexOf(currentInput);
    if (currentIndex < 0) {
      return false;
    }
    const nextInput = inputRefs.current[currentIndex + 1];
    if (!nextInput) {
      return false;
    }
    nextInput.focus();
    return true;
  }, []);

  const ensureInputVisible = useCallback((input) => {
    if (
      !keyboardVisible.current ||
      typeof input?.measureInWindow !== 'function' ||
      typeof scrollViewRef.current?.measureInWindow !== 'function'
    ) {
      return;
    }

    requestAnimationFrame(() => {
      const scrollView = scrollViewRef.current;
      if (!keyboardVisible.current || focusedInput.current !== input || !scrollView) {
        return;
      }

      scrollView.measureInWindow((...scrollFrame) => {
        input.measureInWindow((...inputFrame) => {
          if (!keyboardVisible.current || focusedInput.current !== input) {
            return;
          }

          const scrollTop = scrollFrame[1];
          const scrollBottom = Math.min(
            scrollTop + scrollFrame[3],
            keyboardTop.current
          );
          const inputTop = inputFrame[1];
          const inputBottom = inputTop + inputFrame[3];
          const margin = 16;
          let scrollDelta = 0;

          if (inputTop < scrollTop + margin) {
            scrollDelta = inputTop - scrollTop - margin;
          } else if (inputBottom > scrollBottom - margin) {
            scrollDelta = inputBottom - scrollBottom + margin;
          }

          if (scrollDelta) {
            scrollView.scrollTo({
              y: Math.max(0, scrollOffset.current + scrollDelta),
              animated: true,
            });
          }
        });
      });
    });
  }, []);

  const scrollToInput = useCallback((input) => {
    focusedInput.current = input;
    if (keyboardVisible.current) {
      ensureInputVisible(input);
    }
  }, [ensureInputVisible]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardVisible.current = true;
      const coordinates = event?.endCoordinates;
      const screenY = coordinates?.screenY;
      keyboardTop.current = Number.isFinite(screenY)
        ? screenY
        : Dimensions.get('screen').height - (coordinates?.height || 0);
      const input = focusedInput.current;
      if (input) {
        ensureInputVisible(input);
      }
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisible.current = false;
      keyboardTop.current = null;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [ensureInputVisible]);

  const handleScroll = useCallback((event) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  }, [onScroll]);

  const navigation = useMemo(
    () => ({ registerInput, unregisterInput, focusNextInput, scrollToInput }),
    [registerInput, unregisterInput, focusNextInput, scrollToInput]
  );

  return (
    <KeyboardNavigationContext.Provider value={navigation}>
      <ScrollView
        ref={scrollViewRef}
        {...props}
        onScroll={handleScroll}
        scrollEventThrottle={scrollEventThrottle || 16}
      >
        {children}
      </ScrollView>
    </KeyboardNavigationContext.Provider>
  );
}
