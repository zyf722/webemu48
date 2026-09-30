# Web port

The browser build is split into two layers:

- `web/CMakeLists.txt` + `web/src/`: Emscripten/pthread port of the Emu48 core.
- `web/frontend/`: Vite + TypeScript user interface.

The production site never bundles calculator ROMs. ROMs are supplied by the
user and written only to Emscripten's in-memory filesystem.

## Frontend

```sh
cd web/frontend
npm install
npm run typecheck
npm run dev
```

Vite emits COOP/COEP headers in dev/preview. GitHub Pages uses
`coi-serviceworker.js` to provide the same cross-origin isolation.

The production assembly places generated `webemu48.*` files under the built
frontend's `runtime/` directory.
