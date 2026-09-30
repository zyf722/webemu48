import "./style.css";

type ModelId = "39gp" | "39gs" | "40gs" | "48gii" | "49gp" | "50g";
type DisplayRect = { x: number; y: number; width: number; height: number };
type ModelConfig = {
  label: string;
  rom: "rom.39g" | "rom.49g";
  romSize: number;
  kml: string;
  skin: string;
  kmlWidth: number;
  kmlHeight: number;
  lcdHeight: 64 | 80;
  display: DisplayRect;
  power: { x: number; y: number };
};
type EmuFs = {
  mkdir(path: string): void;
  unlink(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
};
type EmuModule = {
  FS: EmuFs;
  HEAPU8: Uint8Array;
  ccall(name: string, returnType: string, argumentTypes: string[], args: unknown[]): number;
  _webemu48_state(): number;
  _webemu48_next_state(): number;
  _webemu48_cpu_shutdn(): number;
  _webemu48_button_down(x: number, y: number): number;
  _webemu48_button_up(x: number, y: number): void;
  _webemu48_key_down(virtKey: number): void;
  _webemu48_key_up(virtKey: number): void;
  _webemu48_lcd_refresh(): number;
  _webemu48_lcd_width(): number;
  _webemu48_lcd_height(): number;
  _webemu48_lcd_rgba(): number;
};
type RuntimeFactory = (options: {
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<EmuModule>;

const VIEWBOX_WIDTH = 665;
const VIEWBOX_HEIGHT = 1340;

const MODELS: Record<ModelId, ModelConfig> = {
  "39gp": {
    label: "HP 39g+", rom: "rom.39g", romSize: 1_048_576,
    kml: "real39gp-lc.kml", skin: "hp39gplus.svg",
    kmlWidth: 444, kmlHeight: 884, lcdHeight: 64,
    display: { x: 100, y: 164, width: 463, height: 262 },
    power: { x: 46, y: 837 }
  },
  "39gs": {
    label: "HP 39gs", rom: "rom.39g", romSize: 1_048_576,
    kml: "real39gs-lc.kml", skin: "hp39gs.svg",
    kmlWidth: 444, kmlHeight: 887, lcdHeight: 64,
    display: { x: 100, y: 164, width: 463, height: 262 },
    power: { x: 46, y: 838 }
  },
  "40gs": {
    label: "HP 40gs", rom: "rom.39g", romSize: 1_048_576,
    kml: "real40gs-lc.kml", skin: "hp40gs.svg",
    kmlWidth: 444, kmlHeight: 889, lcdHeight: 64,
    display: { x: 100, y: 164, width: 463, height: 262 },
    power: { x: 51, y: 839 }
  },
  "48gii": {
    label: "HP 48gII", rom: "rom.49g", romSize: 2_097_152,
    kml: "real48gii-lc.kml", skin: "hp48gii.svg",
    kmlWidth: 444, kmlHeight: 885, lcdHeight: 64,
    display: { x: 109.473684, y: 181.868657, width: 506.863158, height: 290.546269 },
    power: { x: 51, y: 839 }
  },
  "49gp": {
    label: "HP 49g+", rom: "rom.49g", romSize: 2_097_152,
    kml: "real49gp-lc.kml", skin: "hp49gplus.svg",
    kmlWidth: 443, kmlHeight: 944, lcdHeight: 80,
    display: { x: 100, y: 164, width: 463, height: 262 },
    power: { x: 44, y: 899 }
  },
  "50g": {
    label: "HP 50g", rom: "rom.49g", romSize: 2_097_152,
    kml: "real50g-lc.kml", skin: "hp50g.svg",
    kmlWidth: 437, kmlHeight: 940, lcdHeight: 80,
    display: { x: 100, y: 164, width: 463, height: 262 },
    power: { x: 44, y: 894 }
  }
};

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const modelSelect = requiredElement<HTMLSelectElement>("model");
const romInput = requiredElement<HTMLInputElement>("rom");
const romName = requiredElement<HTMLElement>("rom-name");
const romHint = requiredElement<HTMLElement>("rom-hint");
const startButton = requiredElement<HTMLButtonElement>("start");
const calculator = requiredElement<HTMLElement>("calculator");
const skin = requiredElement<HTMLImageElement>("skin");
const canvas = requiredElement<HTMLCanvasElement>("lcd");
const ctx = canvas.getContext("2d", { alpha: false })!;
const runtimeBadge = requiredElement<HTMLElement>("runtime-badge");
const bootstrapStatus = requiredElement<HTMLElement>("bootstrap-status");
const sessionStatus = requiredElement<HTMLElement>("session-status");
const log = requiredElement<HTMLElement>("log");

if (!ctx) throw new Error("2D canvas is unavailable.");

let moduleInstance: EmuModule | null = null;
let running = false;
let activePointerId: number | null = null;
let activePressPoint: { x: number; y: number } | null = null;
let frameImageData: ImageData | null = null;
const activeVirtualKeys = new Set<number>();

function selectedModel(): ModelConfig {
  return MODELS[modelSelect.value as ModelId] ?? MODELS["39gp"];
}

function assetUrl(path: string): string {
  return new URL(`./${path}`, document.baseURI).href;
}

function writeLog(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  log.textContent += `\n[${timestamp}] ${message}`;
}

function setRuntimeStatus(message: string, state: "loading" | "ready" | "error"): void {
  bootstrapStatus.textContent = message;
  runtimeBadge.dataset.state = state;
}

function setSessionStatus(message: string): void {
  sessionStatus.textContent = message;
}

function setControlsEnabled(enabled: boolean): void {
  modelSelect.disabled = !enabled;
  romInput.disabled = !enabled;
  startButton.disabled = !enabled;
}

function formatMiB(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(bytes % 1_048_576 === 0 ? 0 : 2)} MiB`;
}

function applyModelVisual(): void {
  const model = selectedModel();
  calculator.style.aspectRatio = `${VIEWBOX_WIDTH} / ${VIEWBOX_HEIGHT}`;
  calculator.setAttribute("aria-label", `${model.label} calculator`);
  skin.src = assetUrl(`skins/${model.skin}`);
  skin.alt = `${model.label} calculator skin`;

  canvas.style.left = `${(model.display.x / VIEWBOX_WIDTH) * 100}%`;
  canvas.style.top = `${(model.display.y / VIEWBOX_HEIGHT) * 100}%`;
  canvas.style.width = `${(model.display.width / VIEWBOX_WIDTH) * 100}%`;
  canvas.style.height = `${(model.display.height / VIEWBOX_HEIGHT) * 100}%`;

  startButton.textContent = `Start ${model.label}`;
  romHint.textContent = `Expected ${formatMiB(model.romSize)} ${model.rom} family`;
}

function ensureDirectory(fs: EmuFs, path: string): void {
  try { fs.mkdir(path); }
  catch (error) {
    if (!String(error).includes("File exists")) throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForState(expectedState: number, timeoutMs = 5000): Promise<void> {
  if (!moduleInstance) throw new Error("Runtime is not loaded.");
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (moduleInstance._webemu48_state() === expectedState) return;
    await sleep(10);
  }
  throw new Error(
    `Timed out waiting for emulator state ${expectedState}; state=${moduleInstance._webemu48_state()}, next=${moduleInstance._webemu48_next_state()}`
  );
}

async function waitForShutdown(timeoutMs = 5000): Promise<void> {
  if (!moduleInstance) throw new Error("Runtime is not loaded.");
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (moduleInstance._webemu48_state() === 0 && moduleInstance._webemu48_cpu_shutdn() === 1) return;
    await sleep(10);
  }
  throw new Error(
    `Timed out waiting for calculator reset; state=${moduleInstance._webemu48_state()}, next=${moduleInstance._webemu48_next_state()}, shutdn=${moduleInstance._webemu48_cpu_shutdn()}`
  );
}

async function pressPowerOn(model: ModelConfig): Promise<void> {
  if (!moduleInstance) return;
  moduleInstance._webemu48_button_down(model.power.x, model.power.y);
  await sleep(300);
  moduleInstance._webemu48_button_up(model.power.x, model.power.y);
}

function toKmlCoordinates(event: PointerEvent): { x: number; y: number } {
  const rect = calculator.getBoundingClientRect();
  const model = selectedModel();
  const svgX = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
  const svgY = ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;
  return {
    x: Math.max(0, Math.min(model.kmlWidth - 1, Math.floor((svgX / VIEWBOX_WIDTH) * model.kmlWidth))),
    y: Math.max(0, Math.min(model.kmlHeight - 1, Math.floor((svgY / VIEWBOX_HEIGHT) * model.kmlHeight)))
  };
}

function pointerDown(event: PointerEvent): void {
  if (!running || !moduleInstance || activePointerId !== null) return;
  calculator.focus({ preventScroll: true });
  const point = toKmlCoordinates(event);
  if (!moduleInstance._webemu48_button_down(point.x, point.y)) return;
  activePointerId = event.pointerId;
  activePressPoint = point;
  calculator.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function releasePointer(event: PointerEvent): void {
  if (!running || !moduleInstance || event.pointerId !== activePointerId) return;
  if (activePressPoint) moduleInstance._webemu48_button_up(activePressPoint.x, activePressPoint.y);
  activePointerId = null;
  activePressPoint = null;
  event.preventDefault();
}

function virtualKeyForEvent(event: KeyboardEvent): number | null {
  if (/^F[1-6]$/.test(event.key)) return 111 + Number(event.key.slice(1));
  if (/^[0-9]$/.test(event.key)) return event.key.charCodeAt(0);

  switch (event.key) {
    case "+": return 187;
    case "-": return 189;
    case "*": return 106;
    case "/": return 191;
    case ".": return 190;
    case ",": return 188;
    case "Enter": return 13;
    case "Backspace": return 8;
    case "Escape": return 27;
    case "ArrowLeft": return 37;
    case "ArrowUp": return 38;
    case "ArrowRight": return 39;
    case "ArrowDown": return 40;
    default: return null;
  }
}

function keyDown(event: KeyboardEvent): void {
  if (!running || !moduleInstance || event.repeat) return;
  const virtKey = virtualKeyForEvent(event);
  if (virtKey === null || activeVirtualKeys.has(virtKey)) return;
  activeVirtualKeys.add(virtKey);
  moduleInstance._webemu48_key_down(virtKey);
  event.preventDefault();
}

function keyUp(event: KeyboardEvent): void {
  if (!running || !moduleInstance) return;
  const virtKey = virtualKeyForEvent(event);
  if (virtKey === null || !activeVirtualKeys.has(virtKey)) return;
  moduleInstance._webemu48_key_up(virtKey);
  activeVirtualKeys.delete(virtKey);
  event.preventDefault();
}

function releaseKeyboard(): void {
  if (!moduleInstance) return;
  for (const virtKey of activeVirtualKeys) moduleInstance._webemu48_key_up(virtKey);
  activeVirtualKeys.clear();
}

async function startCalculator(): Promise<void> {
  if (!moduleInstance || running) return;
  const model = selectedModel();
  const file = romInput.files?.[0];
  if (!file) {
    setSessionStatus("Choose a ROM image first.");
    return;
  }

  setControlsEnabled(false);
  let documentOpened = false;

  try {
    if (file.size !== model.romSize) {
      writeLog(
        `Warning: ${model.label} normally uses a raw ${formatMiB(model.romSize)} ${model.rom} image, but the selected file is ${formatMiB(file.size)}. Trying it anyway.`
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    ensureDirectory(moduleInstance.FS, "/calculators");
    const romPath = `/calculators/${model.rom}`;

    try { moduleInstance.FS.unlink(romPath); }
    catch { /* first load */ }

    moduleInstance.FS.writeFile(romPath, bytes);
    setSessionStatus(`Booting ${model.label}…`);
    writeLog(`Loaded ${bytes.byteLength} bytes as ${model.rom}.`);

    const initialized = moduleInstance.ccall(
      "webemu48_init", "number", ["string"], ["/calculators/"]
    );
    if (!initialized) throw new Error("webemu48_init() failed.");

    await waitForState(1);

    const opened = moduleInstance.ccall(
      "webemu48_new_document",
      "number",
      ["string", "string"],
      [model.kml, "/calculators/"]
    );
    if (!opened) {
      throw new Error(`Could not open ${model.label}. Check that the ROM belongs to the selected family.`);
    }
    documentOpened = true;

    await waitForState(0);
    await waitForShutdown();
    await pressPowerOn(model);

    running = true;
    calculator.focus({ preventScroll: true });
    setSessionStatus(`${model.label} is running.`);
    writeLog(`${model.label} started.`);
    requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    setSessionStatus(`Start failed: ${message}`);
    writeLog(`Start failed: ${message}`);

    if (documentOpened) {
      writeLog("Reload the page before another attempt; the core already owns an active document.");
    } else {
      setControlsEnabled(true);
    }
  }
}

function renderLoop(): void {
  if (!running || !moduleInstance) return;

  if (moduleInstance._webemu48_lcd_refresh()) {
    const width = moduleInstance._webemu48_lcd_width();
    const height = moduleInstance._webemu48_lcd_height();
    const pointer = moduleInstance._webemu48_lcd_rgba();

    if (width > 0 && height > 0 && pointer) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        frameImageData = null;
      }

      const byteLength = width * height * 4;
      if (!frameImageData || frameImageData.width !== width || frameImageData.height !== height) {
        frameImageData = new ImageData(new Uint8ClampedArray(byteLength), width, height);
      }

      // HEAPU8 uses SharedArrayBuffer with pthreads. ImageData cannot.
      frameImageData.data.set(moduleInstance.HEAPU8.subarray(pointer, pointer + byteLength));
      ctx.putImageData(frameImageData, 0, 0);
    }
  }

  requestAnimationFrame(renderLoop);
}

async function enableCrossOriginIsolation(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support the Service Worker required by the threaded build.");
  }

  setRuntimeStatus("Enabling browser isolation…", "loading");
  await navigator.serviceWorker.register(assetUrl("coi-serviceworker.js"), { scope: "./" });

  if (navigator.serviceWorker.controller) {
    location.reload();
    return;
  }

  await new Promise<void>(resolve => {
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        location.reload();
        resolve();
      },
      { once: true }
    );
  });
}

async function bootRuntime(): Promise<void> {
  if (!globalThis.crossOriginIsolated) {
    await enableCrossOriginIsolation();
    return;
  }

  setRuntimeStatus("Loading emulator…", "loading");
  const runtimeModule = await import(/* @vite-ignore */ assetUrl("runtime/webemu48.js"));
  const createWebEmu48 = runtimeModule.default as RuntimeFactory;

  moduleInstance = await createWebEmu48({
    locateFile(path) { return assetUrl(`runtime/${path}`); },
    print(text) { writeLog(String(text)); },
    printErr(text) { writeLog(String(text)); }
  });

  setRuntimeStatus("Runtime ready.", "ready");
  setControlsEnabled(true);
  log.textContent = "Runtime ready. Select a model and ROM image.";
}

modelSelect.addEventListener("change", applyModelVisual);
romInput.addEventListener("change", () => {
  const file = romInput.files?.[0];
  romName.textContent = file ? `${file.name} · ${formatMiB(file.size)}` : "No ROM selected";
});
startButton.addEventListener("click", () => void startCalculator());

calculator.addEventListener("pointerdown", pointerDown);
calculator.addEventListener("pointerup", releasePointer);
calculator.addEventListener("pointercancel", releasePointer);
calculator.addEventListener("lostpointercapture", event => {
  if (moduleInstance && event.pointerId === activePointerId && activePressPoint) {
    moduleInstance._webemu48_button_up(activePressPoint.x, activePressPoint.y);
    activePointerId = null;
    activePressPoint = null;
  }
});
calculator.addEventListener("keydown", keyDown);
calculator.addEventListener("keyup", keyUp);
calculator.addEventListener("blur", releaseKeyboard);
window.addEventListener("blur", releaseKeyboard);

applyModelVisual();

bootRuntime().catch(error => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  setRuntimeStatus("Runtime failed.", "error");
  setSessionStatus(message);
  log.textContent = `Failed to load runtime:\n${message}`;
});
