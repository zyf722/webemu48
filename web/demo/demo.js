import createWebEmu48 from "./webemu48.js";

const modelSelect = document.querySelector("#model");
const romInput = document.querySelector("#rom");
const startButton = document.querySelector("#start");
const calculator = document.querySelector("#calculator");
const skin = document.querySelector("#skin");
const canvas = document.querySelector("#lcd");
const ctx = canvas.getContext("2d", { alpha: false });
const log = document.querySelector("#log");
const bootstrapStatus = document.querySelector("#bootstrap-status");

const MODELS = {
  "39gp": {
    label: "HP 39g+",
    kml: "real39gp-lc.kml",
    skin: "real39gp-lc.png",
    width: 444,
    height: 884,
    lcd: { x: 25, y: 21, width: 393, height: 192 },
    power: { x: 46, y: 837 }
  },
  "39gs": {
    label: "HP 39gs",
    kml: "real39gs-lc.kml",
    skin: "real39gs-lc.png",
    width: 444,
    height: 887,
    lcd: { x: 25, y: 21, width: 393, height: 192 },
    power: { x: 46, y: 838 }
  },
  "40gs": {
    label: "HP 40gs",
    kml: "real40gs-lc.kml",
    skin: "real40gs-lc.png",
    width: 444,
    height: 889,
    lcd: { x: 25, y: 21, width: 393, height: 192 },
    power: { x: 51, y: 839 }
  }
};

let moduleInstance = null;
let running = false;
let activePointerId = null;
let lastPointer = { x: 0, y: 0 };

function selectedModel() {
  return MODELS[modelSelect.value] || MODELS["39gp"];
}

function applyModelVisual() {
  const model = selectedModel();
  calculator.style.aspectRatio = `${model.width} / ${model.height}`;
  calculator.setAttribute("aria-label", `Clickable ${model.label} emulator`);
  skin.src = `./${model.skin}`;
  skin.alt = `${model.label} emulator skin`;

  canvas.style.left = `${model.lcd.x / model.width * 100}%`;
  canvas.style.top = `${model.lcd.y / model.height * 100}%`;
  canvas.style.width = `${model.lcd.width / model.width * 100}%`;
  canvas.style.height = `${model.lcd.height / model.height * 100}%`;

  startButton.textContent = `Start ${model.label.replace("HP ", "")}`;
}

function writeLog(message) {
  log.textContent += "\n" + message;
}

function ensureDirectory(FS, path) {
  try {
    FS.mkdir(path);
  } catch (error) {
    if (!String(error).includes("File exists")) throw error;
  }
}

async function waitForState(expectedState, timeoutMs = 5000) {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    const state = moduleInstance._webemu48_state();
    if (state === expectedState) return state;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  const state = moduleInstance._webemu48_state();
  const nextState = moduleInstance._webemu48_next_state();
  throw new Error(
    `Timed out waiting for emulator state ${expectedState}; state=${state}, next=${nextState}`
  );
}

async function waitForShutdown(timeoutMs = 5000) {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    if (
      moduleInstance._webemu48_state() === 0 &&
      moduleInstance._webemu48_cpu_shutdn() === 1
    ) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  throw new Error(
    `Timed out waiting for calculator reset; state=${moduleInstance._webemu48_state()}, ` +
    `next=${moduleInstance._webemu48_next_state()}, ` +
    `shutdn=${moduleInstance._webemu48_cpu_shutdn()}`
  );
}

async function pressPowerOn(model) {
  moduleInstance._webemu48_button_down(model.power.x, model.power.y);
  await new Promise(resolve => setTimeout(resolve, 300));
  moduleInstance._webemu48_button_up(model.power.x, model.power.y);
}

function toKmlCoordinates(event) {
  const rect = calculator.getBoundingClientRect();
  const model = selectedModel();
  return {
    x: Math.max(
      0,
      Math.min(
        model.width - 1,
        Math.floor((event.clientX - rect.left) * model.width / rect.width)
      )
    ),
    y: Math.max(
      0,
      Math.min(
        model.height - 1,
        Math.floor((event.clientY - rect.top) * model.height / rect.height)
      )
    )
  };
}

function pointerDown(event) {
  if (!running || activePointerId !== null) return;

  const point = toKmlCoordinates(event);
  activePointerId = event.pointerId;
  lastPointer = point;
  calculator.setPointerCapture?.(event.pointerId);
  moduleInstance._webemu48_button_down(point.x, point.y);
  event.preventDefault();
}

function pointerMove(event) {
  if (event.pointerId !== activePointerId) return;
  lastPointer = toKmlCoordinates(event);
}

function pointerUp(event) {
  if (!running || event.pointerId !== activePointerId) return;

  const point = toKmlCoordinates(event);
  moduleInstance._webemu48_button_up(point.x, point.y);
  activePointerId = null;
  event.preventDefault();
}

async function bootModule() {
  moduleInstance = await createWebEmu48({
    locateFile(path) {
      return new URL(path, import.meta.url).href;
    },
    print(text) {
      writeLog(String(text));
    },
    printErr(text) {
      writeLog(String(text));
    }
  });

  bootstrapStatus.textContent = "Runtime ready.";
  log.textContent = "WebAssembly module loaded. Select a ROM image.";
  startButton.disabled = false;
}

async function startCalculator() {
  const model = selectedModel();
  const file = romInput.files?.[0];
  if (!file) {
    writeLog("Select a ROM image first.");
    return;
  }

  startButton.disabled = true;
  modelSelect.disabled = true;
  romInput.disabled = true;
  const bytes = new Uint8Array(await file.arrayBuffer());
  ensureDirectory(moduleInstance.FS, "/calculators");

  try {
    moduleInstance.FS.unlink("/calculators/rom.39g");
  } catch (_) {
  }
  moduleInstance.FS.writeFile("/calculators/rom.39g", bytes);

  writeLog(`ROM loaded into memory: ${bytes.byteLength} bytes`);

  const initialized = moduleInstance.ccall(
    "webemu48_init",
    "number",
    ["string"],
    ["/calculators/"]
  );
  if (!initialized) {
    writeLog("webemu48_init() failed.");
    startButton.disabled = false;
    return;
  }

  writeLog("Waiting for emulator worker…");
  await waitForState(1);

  const opened = moduleInstance.ccall(
    "webemu48_new_document",
    "number",
    ["string", "string"],
    [model.kml, "/calculators/"]
  );
  if (!opened) {
    writeLog(`NewDocument() failed for ${model.label}. Check the selected ROM.`);
    startButton.disabled = false;
    modelSelect.disabled = false;
    romInput.disabled = false;
    return;
  }

  writeLog("Waiting for calculator CPU…");
  await waitForState(0);
  await waitForShutdown();

  writeLog(`Powering on ${model.label}…`);
  await pressPowerOn(model);

  writeLog(`${model.label} started. The calculator image is now clickable.`);
  running = true;
  requestAnimationFrame(renderLoop);
}

function renderLoop() {
  if (!running) return;

  if (moduleInstance._webemu48_lcd_refresh()) {
    const width = moduleInstance._webemu48_lcd_width();
    const height = moduleInstance._webemu48_lcd_height();
    const pointer = moduleInstance._webemu48_lcd_rgba();

    if (width > 0 && height > 0 && pointer) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const byteLength = width * height * 4;
      const pixels = new Uint8ClampedArray(
        moduleInstance.HEAPU8.buffer,
        pointer,
        byteLength
      );
      ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    }
  }

  requestAnimationFrame(renderLoop);
}

calculator.addEventListener("pointerdown", pointerDown);
calculator.addEventListener("pointermove", pointerMove);
calculator.addEventListener("pointerup", pointerUp);
calculator.addEventListener("pointercancel", pointerUp);
calculator.addEventListener("lostpointercapture", event => {
  if (event.pointerId === activePointerId && running) {
    moduleInstance._webemu48_button_up(lastPointer.x, lastPointer.y);
    activePointerId = null;
  }
});

modelSelect.addEventListener("change", applyModelVisual);
startButton.addEventListener("click", startCalculator);
applyModelVisual();

bootModule().catch(error => {
  bootstrapStatus.textContent = "Runtime failed to load.";
  log.textContent = "Failed to load WebAssembly module:\n" + (error?.stack || error);
});
