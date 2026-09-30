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
    "${EMU48_CPP_DIR}/android-layer.c"
    src/web-platform.c
    src/web-api.c
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
        -pthread
        -Wno-ignored-pragmas
        -Wno-pointer-sign
        -Wno-incompatible-pointer-types
        -Wno-int-conversion
    )
endif()


if(EMSCRIPTEN)
    add_executable(webemu48_link_probe
        src/link_probe.c
        $<TARGET_OBJECTS:webemu48_core_probe>
    )

    target_link_options(webemu48_link_probe PRIVATE
        -pthread
        "-sPTHREAD_POOL_SIZE=4"
        "-sERROR_ON_UNDEFINED_SYMBOLS=1"
    )

    set_target_properties(webemu48_link_probe PROPERTIES
        OUTPUT_NAME "webemu48-link-probe"
        SUFFIX ".js"
    )
endif()


if(EMSCRIPTEN)
    add_executable(webemu48
        src/browser_main.c
        $<TARGET_OBJECTS:webemu48_core_probe>
    )

    target_link_options(webemu48 PRIVATE
        -pthread
        "-sPTHREAD_POOL_SIZE=4"
        "-sERROR_ON_UNDEFINED_SYMBOLS=1"
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=1"
        "-sEXPORT_NAME=createWebEmu48"
        "-sENVIRONMENT=web,worker"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sEXIT_RUNTIME=0"
        "-sFORCE_FILESYSTEM=1"
        "-sEXPORTED_RUNTIME_METHODS=['FS','ccall','HEAPU8']"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/real39gp-lc.kml@/calculators/real39gp-lc.kml"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/real39gs-lc.kml@/calculators/real39gs-lc.kml"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/real40gs-lc.kml@/calculators/real40gs-lc.kml"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/real48gii-lc.kml@/calculators/real48gii-lc.kml"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/real49gp-lc.kml@/calculators/real49gp-lc.kml"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/real50g-lc.kml@/calculators/real50g-lc.kml"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/keyb3940.kmi@/calculators/keyb3940.kmi"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/keyb4950.kmi@/calculators/keyb4950.kmi"
        "SHELL:--preload-file ${CMAKE_CURRENT_LIST_DIR}/../app/src/main/assets/calculators/patch.39g@/calculators/patch.39g"
    )

    set_target_properties(webemu48 PROPERTIES
        OUTPUT_NAME "webemu48"
        SUFFIX ".js"
    )
endif()
