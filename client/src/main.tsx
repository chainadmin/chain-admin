import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyProductMetadata } from "./lib/page-metadata";

applyProductMetadata();

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
