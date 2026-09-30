/*
 * Minimal C API for the browser port.
 *
 * ROM and KML resources are expected to be present in the Emscripten
 * filesystem before webemu48_new_document() is called.
 */

#include "core/pch.h"
#include "core/kml.h"
#include "core/io.h"
#include "emu.h"
#include "win32-layer.h"

#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#define WEBEMU48_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define WEBEMU48_EXPORT
#endif

extern void win32Init(void);
extern void draw(void);
extern BOOL buttonDown(int x, int y);
extern void buttonUp(int x, int y);
extern void keyDown(int virtKey);
extern void keyUp(int virtKey);
extern BOOL WebButtonById(UINT nId, BOOL bPressed);

extern CRITICAL_SECTION csGDILock;
extern CRITICAL_SECTION csLcdLock;
extern CRITICAL_SECTION csKeyLock;
extern CRITICAL_SECTION csIOLock;
extern CRITICAL_SECTION csT1Lock;
extern CRITICAL_SECTION csT2Lock;
extern CRITICAL_SECTION csTxdLock;
extern CRITICAL_SECTION csRecvLock;
extern CRITICAL_SECTION csSlowLock;
extern CRITICAL_SECTION csDbgLock;
extern LARGE_INTEGER lFreq;
extern LARGE_INTEGER lAppStart;
extern HANDLE hThread;
extern HANDLE hEventShutdn;
extern HWND hWnd;
extern HDC hWindowDC;
extern BOOL bRealSpeed;

extern BOOL soundAvailable;
extern BOOL soundEnabled;
extern enum ChooseKmlMode chooseCurrentKmlMode;
extern TCHAR szChosenCurrentKml[MAX_PATH];

extern volatile int webemu48_view_dirty;
extern int webemu48_view_width;
extern int webemu48_view_height;

static BOOL webemu48_initialized = FALSE;

static void copy_directory(TCHAR *destination, const TCHAR *source)
{
    const TCHAR *fallback = _T("/calculators/");
    const TCHAR *value = (source && source[0]) ? source : fallback;
    _tcsncpy(destination, value, MAX_PATH - 1);
    destination[MAX_PATH - 1] = _T('\0');
}

WEBEMU48_EXPORT
int webemu48_init(const char *baseDirectory)
{
    if (webemu48_initialized)
        return TRUE;

    win32Init();

    chooseCurrentKmlMode = ChooseKmlMode_UNKNOWN;
    szChosenCurrentKml[0] = _T('\0');

    InitializeCriticalSection(&csGDILock);
    InitializeCriticalSection(&csLcdLock);
    InitializeCriticalSection(&csKeyLock);
    InitializeCriticalSection(&csIOLock);
    InitializeCriticalSection(&csT1Lock);
    InitializeCriticalSection(&csT2Lock);
    InitializeCriticalSection(&csTxdLock);
    InitializeCriticalSection(&csRecvLock);
    InitializeCriticalSection(&csSlowLock);
    InitializeCriticalSection(&csDbgLock);

    GetCurrentDirectory(ARRAYSIZEOF(szCurrentDirectory), szCurrentDirectory);
    szCurrentDirectory[0] = _T('\0');
    copy_directory(szEmuDirectory, baseDirectory);
    copy_directory(szRomDirectory, baseDirectory);
    szPort2Filename[0] = _T('\0');

    QueryPerformanceFrequency(&lFreq);
    QueryPerformanceCounter(&lAppStart);

    hWnd = CreateWindow();
    if (!hWnd)
        return FALSE;
    hWindowDC = GetDC(hWnd);

    szCurrentKml[0] = _T('\0');
    SetSpeed(bRealSpeed);

    hEventShutdn = CreateEvent(NULL, FALSE, FALSE, NULL);
    if (!hEventShutdn)
        return FALSE;

    nState = SM_RUN;
    nNextState = SM_INVALID;

    DWORD threadId = 0;
    hThread = CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE) &WorkerThread,
                           NULL, CREATE_SUSPENDED, &threadId);
    if (!hThread)
        return FALSE;

    /* Audio is intentionally disabled during the first Web bring-up. */
    soundAvailable = FALSE;
    soundEnabled = FALSE;

    /*
     * The Android/Win32 startup waits synchronously for WorkerThread to enter
     * SM_INVALID. That blocks the browser UI thread under Emscripten pthreads.
     * Start the worker and let JavaScript poll webemu48_state() instead.
     */
    ResumeThread(hThread);

    webemu48_initialized = TRUE;
    return TRUE;
}

static BOOL webemu48_request_run(void)
{
    if (nState == SM_RUN)
        return TRUE;

    if (nState != SM_INVALID)
        return FALSE;

    /*
     * Non-blocking form of SwitchToState(SM_RUN) for the browser UI thread.
     * WorkerThread observes nNextState after hEventShutdn is signalled and
     * updates nState to SM_RUN itself.
     */
    nNextState = SM_RUN;
    bInterrupt = Chipset.Shutdn || Chipset.SoftInt;
    ResumeDebugger();
    SetEvent(hEventShutdn);
    return TRUE;
}

WEBEMU48_EXPORT
int webemu48_new_document(const char *kmlFilename, const char *baseDirectory)
{
    if (!webemu48_initialized || !kmlFilename || !kmlFilename[0])
        return FALSE;

    /*
     * The first Web preview supports one active document per module instance.
     * Avoid the core's synchronous RUN -> INVALID transition on the UI thread.
     */
    if (bDocumentAvail || nState != SM_INVALID)
        return FALSE;

    chooseCurrentKmlMode = ChooseKmlMode_FILE_NEW;
    _tcsncpy(szChosenCurrentKml, kmlFilename, MAX_PATH - 1);
    szChosenCurrentKml[MAX_PATH - 1] = _T('\0');

    copy_directory(szEmuDirectory, baseDirectory);
    copy_directory(szRomDirectory, baseDirectory);

    BOOL result = NewDocument();
    chooseCurrentKmlMode = ChooseKmlMode_UNKNOWN;

    if (result) {
        /*
         * A fresh document starts from a zeroed CHIPSET structure. The native
         * desktop/Android flow can tolerate that historical behavior, but the
         * browser bring-up needs the hardware reset state before entering RUN:
         * interrupts enabled, MMU reset, and the CPU waiting in SHUTDN for ON.
         */
        CpuReset();
        mainViewResizeCallback(nBackgroundW, nBackgroundH);
        if (pbyRom && !webemu48_request_run())
            return FALSE;
    }

    return result;
}

WEBEMU48_EXPORT
void webemu48_key_down(int virtKey)
{
    keyDown(virtKey);
}

WEBEMU48_EXPORT
void webemu48_key_up(int virtKey)
{
    keyUp(virtKey);
}

WEBEMU48_EXPORT
int webemu48_button_down(int x, int y)
{
    return buttonDown(x, y);
}

WEBEMU48_EXPORT
void webemu48_button_up(int x, int y)
{
    buttonUp(x, y);
}

WEBEMU48_EXPORT
int webemu48_button_id_down(int id)
{
    return WebButtonById((UINT) id, TRUE);
}

WEBEMU48_EXPORT
int webemu48_button_id_up(int id)
{
    return WebButtonById((UINT) id, FALSE);
}

WEBEMU48_EXPORT
int webemu48_state(void)
{
    return (int) nState;
}

WEBEMU48_EXPORT
int webemu48_next_state(void)
{
    return (int) nNextState;
}

WEBEMU48_EXPORT
int webemu48_view_is_dirty(void)
{
    return webemu48_view_dirty;
}

WEBEMU48_EXPORT
void webemu48_view_clear_dirty(void)
{
    webemu48_view_dirty = 0;
}

WEBEMU48_EXPORT
int webemu48_view_width_get(void)
{
    return webemu48_view_width;
}

WEBEMU48_EXPORT
int webemu48_view_height_get(void)
{
    return webemu48_view_height;
}


#define WEBEMU48_LCD_WIDTH 131
#define WEBEMU48_LCD_MAX_HEIGHT 80

static BYTE webemu48_lcd_rgba_buffer[
    WEBEMU48_LCD_WIDTH * WEBEMU48_LCD_MAX_HEIGHT * 4
];

static BYTE webemu48_binary_pixel(const BYTE *nibbles, int nibbleCount, int sourceX)
{
    if (!nibbles || sourceX < 0 || sourceX >= nibbleCount * 4)
        return 0;

    const BYTE nibble = nibbles[sourceX >> 2] & 0x0F;
    return (nibble >> (sourceX & 3)) & 1;
}

WEBEMU48_EXPORT
int webemu48_lcd_refresh(void)
{
    if (!hLcdDC || !hLcdDC->selectedBitmap ||
        !hLcdDC->selectedBitmap->bitmapInfoHeader)
        return FALSE;

    const BITMAPINFOHEADER *header =
        hLcdDC->selectedBitmap->bitmapInfoHeader;
    const int sourceHeight = abs(header->biHeight);
    if (sourceHeight <= 0 || sourceHeight > WEBEMU48_LCD_MAX_HEIGHT)
        return FALSE;

    HPALETTE palette = hLcdDC->realizedPalette ?
        hLcdDC->realizedPalette : hLcdDC->selectedPalette;
    const PALETTEENTRY *entries = NULL;
    UINT entryCount = 0;
    if (palette && palette->paletteLog) {
        entries = palette->paletteLog->palPalEntry;
        entryCount = palette->paletteLog->palNumEntries;
    }

    const BOOL displayOn = (Chipset.IORam[BITOFFSET] & DON) != 0;
    const int headerRows = Chipset.d0size;
    const int mainRows = MAINSCREENHEIGHT;
    BYTE row[36];

    /*
     * The browser framebuffer is rebuilt directly from the emulated display
     * memory instead of depending on the Win32 GDI compatibility bitmap.
     * Native Emu48 maintains that bitmap incrementally; in the Web port the
     * initial boot can leave it stale even though the ROM has a valid active
     * display. Reconstructing 131x64/80 pixels is cheap and avoids GDI locks.
     *
     * This first browser bring-up uses the binary LCD path (palette indices
     * 0/1), matching the default non-grayscale Emu48 mode.
     */
    for (int y = 0; y < sourceHeight; ++y) {
        memset(row, 0, sizeof(row));

        int sourceX = 0;
        int nibbleCount = 0;

        if (displayOn && y < headerRows && Chipset.d0memory) {
            const BYTE *headerRow = Chipset.d0memory + y * 34;
            memcpy(row, headerRow, 34);
            sourceX = Chipset.d0offset;
            nibbleCount = 34;
        } else if (displayOn && y < headerRows + mainRows) {
            const DWORD address =
                Chipset.start1 + (DWORD)(y - headerRows) * Chipset.width;
            Npeek(row, address, 36);
            sourceX = Chipset.boffset;
            nibbleCount = 36;
        } else if (displayOn && y < headerRows + mainRows + MENUHEIGHT) {
            const DWORD address =
                Chipset.start2 +
                (DWORD)(y - headerRows - mainRows) * 34;
            Npeek(row, address, 34);
            sourceX = 0;
            nibbleCount = 34;
        }

        for (int x = 0; x < WEBEMU48_LCD_WIDTH; ++x) {
            const BYTE index = nibbleCount ?
                webemu48_binary_pixel(row, nibbleCount, sourceX + x) : 0;

            BYTE red;
            BYTE green;
            BYTE blue;
            if (entries && index < entryCount) {
                red = entries[index].peRed;
                green = entries[index].peGreen;
                blue = entries[index].peBlue;
            } else {
                /*
                 * Match the default LCD background from the bundled HP ARM
                 * KML files instead of flashing pure white before a palette
                 * has been realized. Lit pixels fall back to black.
                 */
                if (index) {
                    red = green = blue = 0;
                } else {
                    red = 168;
                    green = 192;
                    blue = 176;
                }
            }

            BYTE *destination =
                &webemu48_lcd_rgba_buffer[
                    (y * WEBEMU48_LCD_WIDTH + x) * 4
                ];
            destination[0] = red;
            destination[1] = green;
            destination[2] = blue;
            destination[3] = 255;
        }
    }

    return TRUE;
}

WEBEMU48_EXPORT
const BYTE *webemu48_lcd_rgba(void)
{
    return webemu48_lcd_rgba_buffer;
}

WEBEMU48_EXPORT
int webemu48_lcd_width(void)
{
    return WEBEMU48_LCD_WIDTH;
}

WEBEMU48_EXPORT
int webemu48_lcd_height(void)
{
    if (!hLcdDC || !hLcdDC->selectedBitmap ||
        !hLcdDC->selectedBitmap->bitmapInfoHeader)
        return 0;
    return abs(hLcdDC->selectedBitmap->bitmapInfoHeader->biHeight);
}

WEBEMU48_EXPORT
int webemu48_display_on(void)
{
    return (Chipset.IORam[BITOFFSET] & DON) != 0;
}

WEBEMU48_EXPORT
int webemu48_cpu_shutdn(void)
{
    return Chipset.Shutdn != 0;
}

WEBEMU48_EXPORT
unsigned int webemu48_pc(void)
{
    return (unsigned int) Chipset.pc;
}
