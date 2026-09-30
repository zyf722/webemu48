const status = document.querySelector("#bootstrap-status");
const log = document.querySelector("#log");

async function boot() {
  if (globalThis.crossOriginIsolated) {
    status.textContent = "Cross-origin isolation active. Loading emulator…";
    await import("./demo.js");
    return;
  }

  if (!("serviceWorker" in navigator)) {
    status.textContent = "This browser does not support Service Workers required by the threaded WebAssembly build.";
    log.textContent = "crossOriginIsolated=false and Service Worker API unavailable.";
    return;
  }

  status.textContent = "Enabling cross-origin isolation for GitHub Pages…";

  try {
    await navigator.serviceWorker.register("./coi-serviceworker.js", { scope: "./" });

    if (navigator.serviceWorker.controller) {
      location.reload();
      return;
    }

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true }
    );
  } catch (error) {
    status.textContent = "Failed to enable cross-origin isolation.";
    log.textContent = String(error?.stack || error);
  }
}

boot();
