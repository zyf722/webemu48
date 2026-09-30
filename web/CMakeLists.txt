cmake_minimum_required(VERSION 3.20)

project(webemu48_portability_probe LANGUAGES C)

set(EMU48_CPP_DIR "${CMAKE_CURRENT_LIST_DIR}/../app/src/main/cpp")
set(EMU48_CORE_DIR "${EMU48_CPP_DIR}/core")

# Compile the same Emu48 core translation units used by the Android build.
# Platform implementations (win32-layer.c, android-layer.c, android-emu.c and
# emu-jni.c) are intentionally excluded from this target.
add_library(webemu48_core_probe OBJECT
    "${EMU48_CORE_DIR}/apple.c"
    "${EMU48_CORE_DIR}/ddeserv.c"
    "${EMU48_CORE_DIR}/disasm.c"
    "${EMU48_CORE_DIR}/dismem.c"
    "${EMU48_CPP_DIR}/patch/display_ex.c"
    "${EMU48_CORE_DIR}/disrpl.c"
    "${EMU48_CORE_DIR}/engine.c"
    "${EMU48_CORE_DIR}/fetch.c"
    "${EMU48_CORE_DIR}/files.c"
    "${EMU48_CORE_DIR}/i28f160.c"
    "${EMU48_CORE_DIR}/keyboard.c"
    "${EMU48_CORE_DIR}/keymacro.c"
    "${EMU48_CORE_DIR}/kml.c"
    "${EMU48_CORE_DIR}/lodepng.c"
    "${EMU48_CORE_DIR}/lowbat.c"
    "${EMU48_CORE_DIR}/mops.c"
    "${EMU48_CORE_DIR}/mru.c"
    "${EMU48_CORE_DIR}/opcodes.c"
    "${EMU48_CORE_DIR}/pch.c"
    "${EMU48_CORE_DIR}/redeye.c"
    "${EMU48_CORE_DIR}/romcrc.c"
    "${EMU48_CORE_DIR}/rpl.c"
    "${EMU48_CORE_DIR}/serial.c"
    "${EMU48_CORE_DIR}/settings.c"
    "${EMU48_CORE_DIR}/sound.c"
    "${EMU48_CORE_DIR}/stack.c"
    "${EMU48_CORE_DIR}/symbfile.c"
    "${EMU48_CORE_DIR}/timer.c"
    "${EMU48_CPP_DIR}/win32-layer.c"
    "${EMU48_CPP_DIR}/android-emu.c"
    src/portability_probe.c
)

target_include_directories(webemu48_core_probe PRIVATE
    "${EMU48_CPP_DIR}"
    "${EMU48_CPP_DIR}/win32"
)

target_compile_definitions(webemu48_core_probe PRIVATE
    EMUXX=48
    NEW_WIN32_SOUND_ENGINE
    LODEPNG_NO_COMPILE_ENCODER
    LODEPNG_NO_COMPILE_DISK
    LODEPNG_NO_COMPILE_ANCILLARY_CHUNKS
    LODEPNG_NO_COMPILE_ERROR_TEXT
    LODEPNG_NO_COMPILE_CPP
    WEBEMU48_WEB_PORT=1
)

target_compile_features(webemu48_core_probe PRIVATE c_std_11)

if(EMSCRIPTEN)
    target_compile_options(webemu48_core_probe PRIVATE
        -Wno-ignored-pragmas
        -Wno-pointer-sign
        -Wno-incompatible-pointer-types
        -Wno-int-conversion
    )
endif()
