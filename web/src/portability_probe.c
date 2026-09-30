/*
 * Compile-only probe for the browser port.
 *
 * This file deliberately has no emulator behavior. Its job is to make the
 * Web build include the same compatibility and core headers as real sources,
 * so Android-only dependencies fail early during compilation.
 */

#include "core/pch.h"
#include "core/Emu48.h"

int webemu48_portability_probe(void)
{
    return 0;
}
