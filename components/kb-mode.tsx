"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FC,
  type MutableRefObject,
  type ReactNode,
} from "react";

type KbModeValue = {
  /** Knowledge Base mode: answers only from PLPA documents, with sources. */
  kbOn: boolean;
  toggle: () => void;
  /** Always-current value for the request body (read when a message is sent). */
  kbRef: MutableRefObject<boolean>;
};

const KbModeContext = createContext<KbModeValue | null>(null);

export const useKbMode = () => {
  const ctx = useContext(KbModeContext);
  if (!ctx) throw new Error("useKbMode must be used inside KbModeProvider");
  return ctx;
};

export const KbModeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [kbOn, setKbOn] = useState(false);
  const kbRef = useRef(false);

  const toggle = useCallback(() => {
    kbRef.current = !kbRef.current;
    setKbOn(kbRef.current);
  }, []);

  const value = useMemo(() => ({ kbOn, toggle, kbRef }), [kbOn, toggle]);
  return <KbModeContext.Provider value={value}>{children}</KbModeContext.Provider>;
};
