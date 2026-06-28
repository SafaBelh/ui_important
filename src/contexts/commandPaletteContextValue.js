import { createContext, useContext } from "react";

export const CmdPaletteContext = createContext(null);

export function useCmdPalette() {
  return useContext(CmdPaletteContext) || {};
}
