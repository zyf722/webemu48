/*
 * Actual startup-chain link probe.
 *
 * CI only links this executable; it does not execute it. Calling the exported
 * Web initialization API here prevents wasm-ld from garbage-collecting the
 * emulator startup path and exposes missing host symbols.
 */
extern int webemu48_init(const char *baseDirectory);

int main(void)
{
    return webemu48_init("/calculators/") ? 0 : 1;
}
