import createWebEmu48 from "./webemu48.js";

const root = document.documentElement;
const status = document.querySelector("#status");

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
  setStatus("loading", "Loading WebAssembly module");

  const moduleInstance = await createWebEmu48({
    locateFile(path) {
      return new URL(path, import.meta.url).href;
    },
    print() {},
    printErr(text) {
      console.error(text);
    }
  });

  const romResponse = await fetch("./rom.39g");
  if (!romResponse.ok) {
    throw new Error(`ROM fetch failed: ${romResponse.status}`);
  }

  moduleInstance.FS.writeFile(
    "/calculators/rom.39g",
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
    ["real39gp-lc.kml", "/calculators/"]
  );
  if (!opened) throw new Error("webemu48_new_document() returned false");

  await waitForState(moduleInstance, 0);

  /*
   * A freshly-created calculator can begin with the LCD powered off.
   * Exercise the real KML ON key hit region rather than forcing emulator state.
   */
  await sleep(250);
  moduleInstance._webemu48_button_down(46, 837);
  await sleep(120);
  moduleInstance._webemu48_button_up(46, 837);

  const deadline = performance.now() + 12000;
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
      height === 64 &&
      hasPixelVariation(moduleInstance.HEAPU8, pointer, width, height)
    ) {
      setStatus(
        "pass",
        `PASS state=${lastState} lcd=${width}x${height}`
      );
      break;
    }
  }

  if (root.dataset.smoke !== "pass") {
    throw new Error(`LCD never became non-uniform; state=${lastState}`);
  }
} catch (error) {
  console.error(error);
  setStatus("fail", "FAIL " + (error?.stack || error));
}
