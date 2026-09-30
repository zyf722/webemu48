# Web port bootstrap

This directory contains the browser/WebAssembly port of the Android Emu48 fork.

## Initial strategy

The Android fork already keeps most of the original Emu48 sources under
`app/src/main/cpp/core` and redirects Win32 headers through
`app/src/main/cpp/win32-layer.h`. The Web port keeps that architecture:

- keep the Emu48 core unchanged where possible;
- keep Android behavior behind `__ANDROID__`;
- add Web-specific platform implementations instead of JNI calls;
- first make the core compile as WebAssembly objects;
- then add ROM/KML loading, execution, framebuffer export, input and persistence.

## Portability probe

The first target intentionally compiles a representative subset of the core
without linking a complete emulator. This exposes accidental Android SDK
dependencies while avoiding fake implementations merely to satisfy the linker.

With Emscripten installed:

```sh
emcmake cmake -S web -B build/web -G Ninja
cmake --build build/web
```

A successful probe means the Saturn execution core can be compiled without
including JNI, Android Bitmap or OpenSL ES headers.
