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
  annunciators?: DisplayRect;
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
  _webemu48_button_id_down(id: number): number;
  _webemu48_button_id_up(id: number): number;
  _webemu48_lcd_refresh(): number;
  _webemu48_lcd_width(): number;
  _webemu48_lcd_height(): number;
  _webemu48_lcd_rgba(): number;
  _webemu48_annunciators(): number;
};
type RuntimeFactory = (options: {
  locateFile(path: string): string;
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<EmuModule>;

const VIEWBOX_WIDTH = 665;
const VIEWBOX_HEIGHT = 1340;
const LCD_BACKGROUND = "#a8c0b0";
const INTERACTIVE_KEY_SELECTOR = [
  "#six-function-keys > g[id^=\"F\"]",
  "#navigation > #up",
  "#navigation > #left",
  "#navigation > #right",
  "#navigation > #down",
  "#keyboard > g[id^=\"key-\"]"
].join(", ");

const FUNCTION_BUTTON_IDS = [11, 12, 13, 14, 15, 16] as const;
const KEYBOARD_BUTTON_IDS = [
  21, 22, 23,
  31, 32, 33,
  41, 42, 43, 44, 45,
  51, 52, 53, 54, 55,
  61, 62, 63, 64, 65,
  71, 72, 73, 74, 75,
  81, 82, 83, 84, 85,
  91, 92, 93, 94, 95,
  101, 102, 103, 104, 105
] as const;
const DIRECTION_BUTTON_IDS: Record<string, number> = {
  right: 110,
  down: 111,
  left: 112,
  up: 113
};

const MODELS: Record<ModelId, ModelConfig> = {
  "39gp": {
    label: "HP 39g+", rom: "rom.39g", romSize: 1_048_576,
    kml: "real39gp-lc.kml", skin: "hp39gplus.svg",
    kmlWidth: 444, kmlHeight: 884, lcdHeight: 64,
    display: { x: 126, y: 205, width: 411, height: 201 },
    annunciators: { x: 126, y: 173, width: 411, height: 26 },
    power: { x: 46, y: 837 }
  },
  "39gs": {
    label: "HP 39gs", rom: "rom.39g", romSize: 1_048_576,
    kml: "real39gs-lc.kml", skin: "hp39gs.svg",
    kmlWidth: 444, kmlHeight: 887, lcdHeight: 64,
    display: { x: 126, y: 205, width: 411, height: 201 },
    annunciators: { x: 126, y: 173, width: 411, height: 26 },
    power: { x: 46, y: 838 }
  },
  "40gs": {
    label: "HP 40gs", rom: "rom.39g", romSize: 1_048_576,
    kml: "real40gs-lc.kml", skin: "hp40gs.svg",
    kmlWidth: 444, kmlHeight: 889, lcdHeight: 64,
    display: { x: 126, y: 205, width: 411, height: 201 },
    annunciators: { x: 126, y: 173, width: 411, height: 26 },
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
const resetButton = requiredElement<HTMLButtonElement>("reset");
const calculator = requiredElement<HTMLElement>("calculator");
const skin = requiredElement<HTMLElement>("skin");
const annunciators = document.getElementById("annunciators") as unknown as SVGSVGElement;
if (!annunciators) throw new Error("Missing #annunciators");
const annunciatorIcons = Array.from(
  annunciators.querySelectorAll<SVGGraphicsElement>("[data-bit]")
);
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
let activePointerButtonId: number | null = null;
let frameImageData: ImageData | null = null;
let activePointerVisualKey: Element | null = null;
let skinLoadGeneration = 0;
const skinCache = new Map<string, string>();
const activeKeyboardButtonIds = new Set<number>();
const activeKeyboardVisuals = new Map<number, Element>();

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

function setResetEnabled(enabled: boolean): void {
  resetButton.disabled = !enabled;
}

function formatMiB(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(bytes % 1_048_576 === 0 ? 0 : 2)} MiB`;
}

function clearAnnunciators(): void {
  for (const icon of annunciatorIcons) icon.classList.remove("is-on");
}

function refreshAnnunciators(): void {
  if (!running || !moduleInstance || !selectedModel().annunciators) {
    clearAnnunciators();
    return;
  }

  const state = moduleInstance._webemu48_annunciators();
  for (const icon of annunciatorIcons) {
    const bit = Number(icon.dataset.bit ?? "0");
    icon.classList.toggle("is-on", bit !== 0 && (state & bit) !== 0);
  }
}

function paintLcdBackground(model: ModelConfig): void {
  canvas.width = 131;
  canvas.height = model.lcdHeight;
  frameImageData = null;
  ctx.fillStyle = LCD_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function installSkinSvg(svgText: string, model: ModelConfig): void {
  const documentSvg = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = documentSvg.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg") {
    throw new Error(`Invalid SVG skin for ${model.label}`);
  }

  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  skin.replaceChildren(document.importNode(svg, true));
  skin.dataset.skin = model.skin;

  const lcdPlate = skin.querySelector<SVGElement>("#display rect");
  lcdPlate?.setAttribute("fill", LCD_BACKGROUND);

  const functionKeys = Array.from(
    skin.querySelectorAll<SVGElement>("#six-function-keys > g[id^='F']")
  );
  const keyboardKeys = Array.from(
    skin.querySelectorAll<SVGElement>("#keyboard > g[id^='key-']")
  );

  if (functionKeys.length !== FUNCTION_BUTTON_IDS.length) {
    throw new Error(
      `${model.label} SVG has ${functionKeys.length} function keys; expected ${FUNCTION_BUTTON_IDS.length}`
    );
  }
  if (keyboardKeys.length !== KEYBOARD_BUTTON_IDS.length) {
    throw new Error(
      `${model.label} SVG has ${keyboardKeys.length} physical keyboard keys; expected ${KEYBOARD_BUTTON_IDS.length}`
    );
  }

  functionKeys.forEach((key, index) => {
    key.dataset.kmlButtonId = String(FUNCTION_BUTTON_IDS[index]);
  });
  keyboardKeys.forEach((key, index) => {
    key.dataset.kmlButtonId = String(KEYBOARD_BUTTON_IDS[index]);
  });
  for (const [svgId, buttonId] of Object.entries(DIRECTION_BUTTON_IDS)) {
    const key = skin.querySelector<SVGElement>(`#${svgId}`);
    if (!key) throw new Error(`${model.label} SVG is missing direction key #${svgId}`);
    key.dataset.kmlButtonId = String(buttonId);
  }
}

async function applyModelVisual(): Promise<void> {
  const generation = ++skinLoadGeneration;
  const model = selectedModel();

  calculator.style.aspectRatio = `${VIEWBOX_WIDTH} / ${VIEWBOX_HEIGHT}`;
  calculator.setAttribute("aria-label", `${model.label} calculator`);

  canvas.style.left = `${(model.display.x / VIEWBOX_WIDTH) * 100}%`;
  canvas.style.top = `${(model.display.y / VIEWBOX_HEIGHT) * 100}%`;
  canvas.style.width = `${(model.display.width / VIEWBOX_WIDTH) * 100}%`;
  canvas.style.height = `${(model.display.height / VIEWBOX_HEIGHT) * 100}%`;

  if (model.annunciators) {
    annunciators.style.left = `${(model.annunciators.x / VIEWBOX_WIDTH) * 100}%`;
    annunciators.style.top = `${(model.annunciators.y / VIEWBOX_HEIGHT) * 100}%`;
    annunciators.style.width = `${(model.annunciators.width / VIEWBOX_WIDTH) * 100}%`;
    annunciators.style.height = `${(model.annunciators.height / VIEWBOX_HEIGHT) * 100}%`;
    annunciators.removeAttribute("hidden");
  } else {
    annunciators.setAttribute("hidden", "");
  }
  clearAnnunciators();
  paintLcdBackground(model);

  startButton.textContent = `Start ${model.label}`;
  romHint.textContent = `Expected ${formatMiB(model.romSize)} ${model.rom} family`;

  try {
    let svgText = skinCache.get(model.skin);
    if (!svgText) {
      const response = await fetch(assetUrl(`skins/${model.skin}`));
      if (!response.ok) {
        throw new Error(`Skin fetch failed: ${response.status}`);
      }
      svgText = await response.text();
      skinCache.set(model.skin, svgText);
    }

    if (generation !== skinLoadGeneration) return;
    installSkinSvg(svgText, model);
  } catch (error) {
    if (generation !== skinLoadGeneration) return;
    skin.replaceChildren();
    delete skin.dataset.skin;
    const message = error instanceof Error ? error.message : String(error);
    writeLog(`Could not load ${model.label} SVG skin: ${message}`);
  }
}

function findVisualKey(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const key = target.closest(INTERACTIVE_KEY_SELECTOR);
  return key && skin.contains(key) ? key : null;
}

function buttonIdForKeyboardEvent(event: KeyboardEvent): number | null {
  if (/^F[1-6]$/.test(event.key)) {
    return 10 + Number(event.key.slice(1));
  }

  const digitButtons: Record<string, number> = {
    "0": 102,
    "1": 92,
    "2": 93,
    "3": 94,
    "4": 82,
    "5": 83,
    "6": 84,
    "7": 72,
    "8": 73,
    "9": 74
  };
  if (event.key in digitButtons) return digitButtons[event.key];

  switch (event.key) {
    case "+": return 95;
    case "-": return 85;
    case "*": return 75;
    case "/": return 65;
    case ".": return 103;
    case ",":
      return selectedModel().rom === "rom.39g" ? 71 : null;
    case "Enter": return 105;
    case "Backspace": return 45;
    case "Escape": return 101;
    case "ArrowLeft": return 112;
    case "ArrowUp": return 113;
    case "ArrowRight": return 110;
    case "ArrowDown": return 111;
    default: return null;
  }
}

function visualKeyForButtonId(buttonId: number): Element | null {
  return skin.querySelector(`[data-kml-button-id="${buttonId}"]`);
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

async function pressPowerOn(_model: ModelConfig): Promise<void> {
  if (!moduleInstance) return;
  if (!moduleInstance._webemu48_button_id_down(101)) {
    throw new Error("KML ON button is unavailable.");
  }
  await sleep(300);
  moduleInstance._webemu48_button_id_up(101);
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

  const visualKey = findVisualKey(event.target);
  const buttonIdText = visualKey?.getAttribute("data-kml-button-id");
  const buttonId = buttonIdText ? Number(buttonIdText) : undefined;
  let point: { x: number; y: number } | null = null;
  let accepted = false;

  if (buttonId !== undefined) {
    accepted = moduleInstance._webemu48_button_id_down(buttonId) !== 0;
  } else {
    // Preserve KML coordinate hit testing for LCD virtual buttons / hotspots.
    point = toKmlCoordinates(event);
    accepted = moduleInstance._webemu48_button_down(point.x, point.y) !== 0;
  }

  if (!accepted) return;

  activePointerId = event.pointerId;
  activePressPoint = point;
  activePointerButtonId = buttonId ?? null;
  activePointerVisualKey = visualKey;
  activePointerVisualKey?.classList.add("is-pointer-pressed");

  calculator.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function releasePointer(event: PointerEvent): void {
  if (!running || !moduleInstance || event.pointerId !== activePointerId) return;

  if (activePointerButtonId !== null) {
    moduleInstance._webemu48_button_id_up(activePointerButtonId);
  } else if (activePressPoint) {
    moduleInstance._webemu48_button_up(activePressPoint.x, activePressPoint.y);
  }

  activePointerVisualKey?.classList.remove("is-pointer-pressed");
  activePointerId = null;
  activePressPoint = null;
  activePointerButtonId = null;
  activePointerVisualKey = null;
  event.preventDefault();
}


function keyDown(event: KeyboardEvent): void {
  if (!running || !moduleInstance || event.repeat) return;

  const buttonId = buttonIdForKeyboardEvent(event);
  if (buttonId === null || activeKeyboardButtonIds.has(buttonId)) return;
  if (!moduleInstance._webemu48_button_id_down(buttonId)) return;

  activeKeyboardButtonIds.add(buttonId);
  const visualKey = visualKeyForButtonId(buttonId);
  if (visualKey) {
    visualKey.classList.add("is-keyboard-pressed");
    activeKeyboardVisuals.set(buttonId, visualKey);
  }
  event.preventDefault();
}

function keyUp(event: KeyboardEvent): void {
  if (!running || !moduleInstance) return;

  const buttonId = buttonIdForKeyboardEvent(event);
  if (buttonId === null || !activeKeyboardButtonIds.has(buttonId)) return;

  moduleInstance._webemu48_button_id_up(buttonId);
  activeKeyboardVisuals.get(buttonId)?.classList.remove("is-keyboard-pressed");
  activeKeyboardVisuals.delete(buttonId);
  activeKeyboardButtonIds.delete(buttonId);
  event.preventDefault();
}

function releaseKeyboard(): void {
  if (!moduleInstance) return;

  for (const buttonId of activeKeyboardButtonIds) {
    moduleInstance._webemu48_button_id_up(buttonId);
    activeKeyboardVisuals.get(buttonId)?.classList.remove("is-keyboard-pressed");
  }
  activeKeyboardVisuals.clear();
  activeKeyboardButtonIds.clear();
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
    setResetEnabled(true);
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

async function resetCalculator(): Promise<void> {
  if (!moduleInstance || !running) return;

  const model = selectedModel();
  setResetEnabled(false);
  releaseKeyboard();

  if (activePointerButtonId !== null) {
    moduleInstance._webemu48_button_id_up(activePointerButtonId);
  } else if (activePressPoint) {
    moduleInstance._webemu48_button_up(activePressPoint.x, activePressPoint.y);
  }
  activePointerVisualKey?.classList.remove("is-pointer-pressed");
  activePointerId = null;
  activePressPoint = null;
  activePointerButtonId = null;
  activePointerVisualKey = null;

  running = false;
  clearAnnunciators();
  paintLcdBackground(model);
  setSessionStatus(`Resetting ${model.label}…`);
  writeLog(`Resetting ${model.label}.`);

  try {
    const requested = moduleInstance.ccall(
      "webemu48_request_invalid", "number", [], []
    );
    if (!requested) throw new Error("Could not suspend the emulator core.");

    await waitForState(1);

    const reset = moduleInstance.ccall(
      "webemu48_reset_cpu", "number", [], []
    );
    if (!reset) throw new Error("CPU reset was rejected.");

    await waitForState(0);
    await waitForShutdown();
    await pressPowerOn(model);

    running = true;
    calculator.focus({ preventScroll: true });
    setSessionStatus(`${model.label} is running.`);
    writeLog(`${model.label} reset complete.`);
    setResetEnabled(true);
    requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    setSessionStatus(`Reset failed: ${message}`);
    writeLog(`Reset failed: ${message}`);
    writeLog("Reload the page to recover the emulator session.");
  }
}

function renderLoop(): void {
  if (!running || !moduleInstance) return;

  refreshAnnunciators();

  /*
   * webemu48_lcd_refresh() is deliberately non-blocking. If the emulator
   * worker owns the LCD lock, leave the previous canvas frame in place.
   */
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
  setResetEnabled(false);
  log.textContent = "Runtime ready. Select a model and ROM image.";
}

modelSelect.addEventListener("change", () => void applyModelVisual());
romInput.addEventListener("change", () => {
  const file = romInput.files?.[0];
  romName.textContent = file ? `${file.name} · ${formatMiB(file.size)}` : "No ROM selected";
});
startButton.addEventListener("click", () => void startCalculator());
resetButton.addEventListener("click", () => void resetCalculator());

calculator.addEventListener("pointerdown", pointerDown);
calculator.addEventListener("pointerup", releasePointer);
calculator.addEventListener("pointercancel", releasePointer);
calculator.addEventListener("lostpointercapture", event => {
  if (!moduleInstance || event.pointerId !== activePointerId) return;

  if (activePointerButtonId !== null) {
    moduleInstance._webemu48_button_id_up(activePointerButtonId);
  } else if (activePressPoint) {
    moduleInstance._webemu48_button_up(activePressPoint.x, activePressPoint.y);
  }

  activePointerVisualKey?.classList.remove("is-pointer-pressed");
  activePointerId = null;
  activePressPoint = null;
  activePointerButtonId = null;
  activePointerVisualKey = null;
});
calculator.addEventListener("keydown", keyDown);
calculator.addEventListener("keyup", keyUp);
calculator.addEventListener("blur", releaseKeyboard);
window.addEventListener("blur", releaseKeyboard);

void applyModelVisual();

bootRuntime().catch(error => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  setRuntimeStatus("Runtime failed.", "error");
  setSessionStatus(message);
  log.textContent = `Failed to load runtime:\n${message}`;
});
