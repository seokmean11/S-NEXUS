import { useEffect, useRef, useState } from 'react';

/** 한글 IME 조합 중 controlled input value가 끊기지 않도록 로컬 값을 유지합니다. */
export function useImeSafeInputValue(value: string, onChange: (value: string) => void) {
  const composingRef = useRef(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    if (!composingRef.current) {
      setInputValue(value);
    }
  }, [value]);

  return {
    inputValue,
    onInputChange: (next: string) => {
      setInputValue(next);
      if (!composingRef.current) {
        onChange(next);
      }
    },
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (next: string) => {
      composingRef.current = false;
      setInputValue(next);
      onChange(next);
    },
  };
}

export function isKeyboardComposing(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.key === 'Process';
}
