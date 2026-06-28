import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Order matters: tokens define the CSS variables, then the Tailwind/base reset,
// then the shared utility classes (global.css) which must win ties — exactly the
// cascade the old runtime <style>{STYLE}</style> produced.
import "./styles/tokens.css";
import "./styles/global.css";
import App from "./app/App";
createRoot(document.getElementById("root")).render(
  <StrictMode>

    <App />
  </StrictMode>
);
