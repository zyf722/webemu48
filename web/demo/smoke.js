import createWebEmu48 from "./runtime/webemu48.js";

const root = document.documentElement;
const status = document.querySelector("#status");

const MODELS = {
  "39gp": {
    label: "HP 39g+",
    rom: "rom.39g",
    kml: "real39gp-lc.kml",
    lcdHeight: 64,
    power: { x: 46, y: 837 }
  },
  "39gs": {
    label: "HP 39gs",
    rom: "rom.39g",
    kml: "real39gs-lc.kml",
    lcdHeight: 64,
    power: { x: 46, y: 838 }
  },
  "40gs": {
    label: "HP 40gs",
    rom: "rom.39g",
    kml: "real40gs-lc.kml",
    lcdHeight: 64,
    power: { x: 51, y: 839 }
  },
  "48gii": {
    label: "HP 48gII",
    rom: "rom.49g",
    kml: "real48gii-lc.kml",
    lcdHeight: 64,
    power: { x: 51, y: 839 }
  },
  "49gp": {
    label: "HP 49g+",
    rom: "rom.49g",
    kml: "real49gp-lc.kml",
    lcdHeight: 80,
    power: { x: 44, y: 899 }
  },
  "50g": {
    label: "HP 50g",
    rom: "rom.49g",
    kml: "real50g-lc.kml",
    lcdHeight: 80,
    power: { x: 44, y: 894 }
  }
};

const modelId = new URLSearchParams(location.search).get("model") || "39gp";
const model = MODELS[modelId];

function setStatus(state, message) {
  root.dataset.smoke = state;
  status.textContent = message;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForState(moduleInstance, expectedState, timeoutMs = 5000) {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    const state = moduleInstance._webemu48_state();
    if (state === expectedState) return state;
    await sleep(10);
  }

  const state = moduleInstance._webemu48_state();
  const nextState = moduleInstance._webemu48_next_state();
  throw new Error(
    `Timed out waiting for state ${expectedState}; state=${state}, next=${nextState}`
  );
}

async function waitForShutdown(moduleInstance, timeoutMs = 5000) {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    if (
      moduleInstance._webemu48_state() === 0 &&
      moduleInstance._webemu48_cpu_shutdn() === 1
    ) {
      return;
    }
    await sleep(10);
  }

  throw new Error(
    `Timed out waiting for reset SHUTDN; state=${moduleInstance._webemu48_state()}, ` +
    `next=${moduleInstance._webemu48_next_state()}, ` +
    `shutdn=${moduleInstance._webemu48_cpu_shutdn()}, ` +
    `pc=${moduleInstance._webemu48_pc() >>> 0}`
  );
}

function hasPixelVariation(heap, pointer, width, height) {
  const length = width * height * 4;
  if (!pointer || length <= 4) return false;

  const firstR = heap[pointer];
  const firstG = heap[pointer + 1];
  const firstB = heap[pointer + 2];

  for (let offset = 4; offset < length; offset += 4) {
    if (
      heap[pointer + offset] !== firstR ||
      heap[pointer + offset + 1] !== firstG ||
      heap[pointer + offset + 2] !== firstB
    ) {
      return true;
    }
  }
  return false;
}

try {
  if (!model) throw new Error(`Unknown smoke model: ${modelId}`);
  setStatus("loading", `Loading WebAssembly module for ${model.label}`);

  const moduleInstance = await createWebEmu48({
    locateFile(path) {
      return new URL(`./runtime/${path}`, import.meta.url).href;
    },
    print() {},
    printErr(text) {
      console.error(text);
    }
  });

  const romResponse = await fetch(`./${model.rom}`);
  if (!romResponse.ok) {
    throw new Error(
      `${model.rom} fetch failed: ${romResponse.status}`
    );
  }

  moduleInstance.FS.writeFile(
    `/calculators/${model.rom}`,
    new Uint8Array(await romResponse.arrayBuffer())
  );

  const initialized = moduleInstance.ccall(
    "webemu48_init",
    "number",
    ["string"],
    ["/calculators/"]
  );
  if (!initialized) throw new Error("webemu48_init() returned false");

  await waitForState(moduleInstance, 1);

  const opened = moduleInstance.ccall(
    "webemu48_new_document",
    "number",
    ["string", "string"],
    [model.kml, "/calculators/"]
  );
  if (!opened) throw new Error("webemu48_new_document() returned false");

  await waitForState(moduleInstance, 0);
  await waitForShutdown(moduleInstance);

  /*
   * A freshly reset calculator waits in SHUTDN for the physical ON key.
   * Button 101 is ON in all six bundled HP ARM KML layouts. Use the semantic
   * ID path here so the runtime matrix validates the same API as the SVG UI.
   */
  if (!moduleInstance._webemu48_button_id_down(101)) {
    throw new Error("KML Button 101 (ON) is unavailable");
  }
  await sleep(300);
  if (!moduleInstance._webemu48_button_id_up(101)) {
    throw new Error("KML Button 101 (ON) could not be released");
  }

  const deadline = performance.now() + 15000;
  let lastState = moduleInstance._webemu48_state();

  while (performance.now() < deadline) {
    await sleep(100);
    lastState = moduleInstance._webemu48_state();

    if (!moduleInstance._webemu48_lcd_refresh()) continue;

    const width = moduleInstance._webemu48_lcd_width();
    const height = moduleInstance._webemu48_lcd_height();
    const pointer = moduleInstance._webemu48_lcd_rgba();

    if (
      width === 131 &&
      height === model.lcdHeight &&
      hasPixelVariation(moduleInstance.HEAPU8, pointer, width, height)
    ) {
      setStatus(
        "pass",
        `PASS model=${modelId} state=${lastState} lcd=${width}x${height}`
      );
      break;
    }
  }

  if (root.dataset.smoke !== "pass") {
    const diagnostics = {
      state: lastState,
      nextState: moduleInstance._webemu48_next_state(),
      displayOn: moduleInstance._webemu48_display_on(),
      shutdn: moduleInstance._webemu48_cpu_shutdn(),
      pc: moduleInstance._webemu48_pc() >>> 0,
      width: moduleInstance._webemu48_lcd_width(),
      height: moduleInstance._webemu48_lcd_height()
    };
    throw new Error(
      `${model.label} LCD never became non-uniform; ` + JSON.stringify(diagnostics)
    );
  }
} catch (error) {
  console.error(error);
  setStatus("fail", "FAIL " + (error?.stack || error));
}
