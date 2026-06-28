import { createContext, useContext } from "react";

export const ToastCtx = createContext(null);

export function useToast() {
  return useContext(ToastCtx);
}
