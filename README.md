# webemu48

Run selected HP ARM graphing calculator ROMs directly in a modern browser.

webemu48 is a WebAssembly port of the Emu48 codebase with a TypeScript frontend
and vector calculator skins. The current browser build supports:

- HP 39g+
- HP 39gs
- HP 40gs
- HP 48gII
- HP 49g+
- HP 50g

## Browser build

The native emulator core is compiled with Emscripten and runs with pthreads in
a cross-origin-isolated browser context. The frontend lives in
`web/frontend/`.

```sh
npm install --prefix web/frontend
npm run build --prefix web/frontend

docker run --rm \
  -v "$PWD:/src" \
  -w /src \
  emscripten/emsdk:latest \
  sh -lc 'emcmake cmake -S web -B build/web && cmake --build build/web --parallel'
```

GitHub Actions also runs Chromium smoke tests for all six supported models and
a production-frontend E2E path.

## ROMs

The production web application does not upload or bundle a user-selected ROM.
ROM bytes stay in the browser tab's in-memory Emscripten filesystem.

Users are responsible for supplying ROM images that they are legally entitled
to use.

## Source layout

- `web/CMakeLists.txt` — Emscripten build.
- `web/src/` — browser platform/API glue.
- `web/frontend/` — browser UI.
- `app/src/main/cpp/core/` — inherited Emu48 core.
- `app/src/main/cpp/win32*` — compatibility layer used by the port.
- `app/src/main/assets/calculators/` — KML/patch resources used by the core and tests.

The repository was derived from Emu48 for Android, which in turn ports the
Windows Emu48/Emu48+ codebase. Android application/UI build files have been
removed from this Web-focused branch; some native files still retain historical
Android-oriented names where the Web port currently reuses their platform
implementation.

## Licenses

The emulator-derived code is distributed under the terms described in
`LICENSE-GPL.TXT`. Some compatibility-layer portions are covered by
`LICENSE-MIT.TXT`.

Calculator ROMs, KML scripts, artwork, and trademarks may have separate rights
and are not automatically covered by those software licenses.
