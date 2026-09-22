import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { initOffline } from "./lib/offline/boot";

// autoUpdate (vite-plugin-pwa): the new service worker activates on its own and the page reloads,
// so installed devices switch to the latest shell without user action.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // Check periodically and whenever the device returns to this window or comes
    // back online, so an update does not depend on restarting the application.
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => undefined);
    };
    window.setInterval(check, 30 * 60 * 1000);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
});
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
