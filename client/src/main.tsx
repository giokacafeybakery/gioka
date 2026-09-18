import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { initOffline } from "./lib/offline/boot";

registerSW({ immediate: true });
// Offline layer: read cache + operation queue + connectivity probe. Rendering does not wait for it (it resolves in ms).
void initOffline();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Respect "reduce motion" from the phone settings; animations are otherwise tuned per component. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
