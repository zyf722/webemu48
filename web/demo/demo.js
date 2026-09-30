import createWebEmu48 from "./webemu48.js";

const romInput = document.querySelector("#rom");
const startButton = document.querySelector("#start");
const canvas = document.querySelector("#lcd");
const ctx = canvas.getContext("2d", { alpha: false });
const log = document.querySelector("#log");

let moduleInstance = null;
let running = false;

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
  log.textContent = "WebAssembly module loaded. Select a ROM image.";
  startButton.disabled = false;
}

async function startCalculator() {
  const file = romInput.files?.[0];
  if (!file) {
    writeLog("Select a ROM image first.");
    return;
  }

  startButton.disabled = true;
  const bytes = new Uint8Array(await file.arrayBuffer());
  ensureDirectory(moduleInstance.FS, "/calculators");

  try {
    moduleInstance.FS.unlink("/calculators/rom.39g");
  } catch (_) {
  }
  moduleInstance.FS.writeFile("/calculators/rom.39g", bytes);

  writeLog(`ROM loaded into memory: ${bytes.byteLength} bytes`);

  if (!moduleInstance._webemu48_init("/calculators/")) {
    writeLog("webemu48_init() failed.");
    startButton.disabled = false;
    return;
  }

  if (!moduleInstance._webemu48_new_document("real39gp-lc.kml", "/calculators/")) {
    writeLog("NewDocument() failed. Check the selected ROM.");
    startButton.disabled = false;
    return;
  }

  writeLog("Emulator started.");
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

startButton.addEventListener("click", startCalculator);

bootModule().catch(error => {
  log.textContent = "Failed to load WebAssembly module:\n" + (error?.stack || error);
});
