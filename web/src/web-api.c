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

WEBEMU48_EXPORT
int webemu48_lcd_refresh(void)
{
    if (!hLcdDC || !hLcdDC->selectedBitmap)
        return FALSE;

    HBITMAP bitmap = hLcdDC->selectedBitmap;
    if (!bitmap->bitmapInfoHeader || !bitmap->bitmapBits)
        return FALSE;

    const BITMAPINFOHEADER *header = bitmap->bitmapInfoHeader;
    if (header->biBitCount != 8 || header->biWidth <= 0)
        return FALSE;

    const int sourceWidth = header->biWidth;
    const int sourceHeight = abs(header->biHeight);
    if (sourceHeight <= 0 || sourceHeight > WEBEMU48_LCD_MAX_HEIGHT)
        return FALSE;

    const int sourceStride =
        4 * ((sourceWidth * header->biBitCount + 31) / 32);
    const BYTE *source = (const BYTE *) bitmap->bitmapBits;

    HPALETTE palette = hLcdDC->realizedPalette ?
        hLcdDC->realizedPalette : hLcdDC->selectedPalette;
    const PALETTEENTRY *entries = NULL;
    UINT entryCount = 0;
    if (palette && palette->paletteLog) {
        entries = palette->paletteLog->palPalEntry;
        entryCount = palette->paletteLog->palNumEntries;
    }

    const int headerRows = Chipset.d0size;
    const int mainRows = MAINSCREENHEIGHT;

    /*
     * Browser-side LCD snapshots are intentionally lock-free. Waiting on the
     * emulator thread's LCD critical section can block the browser event loop;
     * a snapshot may tear by at most one emulated frame instead.
     */
    for (int y = 0; y < sourceHeight; ++y) {
        int sourceX = 0;
        if (y < headerRows)
            sourceX = Chipset.d0offset;
        else if (y < headerRows + mainRows)
            sourceX = Chipset.boffset;

        for (int x = 0; x < WEBEMU48_LCD_WIDTH; ++x) {
            const int sx = sourceX + x;
            BYTE index = 0;
            if (sx >= 0 && sx < sourceWidth)
                index = source[y * sourceStride + sx];

            BYTE red;
            BYTE green;
            BYTE blue;
            if (entries && index < entryCount) {
                red = entries[index].peRed;
                green = entries[index].peGreen;
                blue = entries[index].peBlue;
            } else {
                red = green = blue = index;
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

WEBEMU48_EXPORT
unsigned int webemu48_cycles_low(void)
{
    return (unsigned int) (Chipset.cycles & 0xffffffffu);
}

WEBEMU48_EXPORT
int webemu48_inte(void)
{
    return Chipset.inte ? 1 : 0;
}

WEBEMU48_EXPORT
int webemu48_intk(void)
{
    return Chipset.intk ? 1 : 0;
}

WEBEMU48_EXPORT
int webemu48_softint(void)
{
    return Chipset.SoftInt ? 1 : 0;
}

WEBEMU48_EXPORT
unsigned int webemu48_in_register(void)
{
    return (unsigned int) Chipset.in;
}

WEBEMU48_EXPORT
unsigned int webemu48_timer1_ctrl(void)
{
    return (unsigned int) Chipset.IORam[TIMER1_CTRL];
}

WEBEMU48_EXPORT
unsigned int webemu48_timer2_ctrl(void)
{
    return (unsigned int) Chipset.IORam[TIMER2_CTRL];
}

WEBEMU48_EXPORT
unsigned int webemu48_ir15x(void)
{
    return (unsigned int) Chipset.IR15X;
}

WEBEMU48_EXPORT
int webemu48_lcd_raw_min(void)
{
    if (!hLcdDC || !hLcdDC->selectedBitmap ||
        !hLcdDC->selectedBitmap->bitmapInfoHeader ||
        !hLcdDC->selectedBitmap->bitmapBits)
        return -1;

    const BITMAPINFOHEADER *header = hLcdDC->selectedBitmap->bitmapInfoHeader;
    const int width = header->biWidth;
    const int height = abs(header->biHeight);
    const int stride = 4 * ((width * header->biBitCount + 31) / 32);
    const BYTE *bits = (const BYTE *) hLcdDC->selectedBitmap->bitmapBits;
    int minimum = 255;

    for (int y = 0; y < height; ++y)
        for (int x = 0; x < width; ++x)
            if (bits[y * stride + x] < minimum)
                minimum = bits[y * stride + x];

    return minimum;
}

WEBEMU48_EXPORT
int webemu48_lcd_raw_max(void)
{
    if (!hLcdDC || !hLcdDC->selectedBitmap ||
        !hLcdDC->selectedBitmap->bitmapInfoHeader ||
        !hLcdDC->selectedBitmap->bitmapBits)
        return -1;

    const BITMAPINFOHEADER *header = hLcdDC->selectedBitmap->bitmapInfoHeader;
    const int width = header->biWidth;
    const int height = abs(header->biHeight);
    const int stride = 4 * ((width * header->biBitCount + 31) / 32);
    const BYTE *bits = (const BYTE *) hLcdDC->selectedBitmap->bitmapBits;
    int maximum = 0;

    for (int y = 0; y < height; ++y)
        for (int x = 0; x < width; ++x)
            if (bits[y * stride + x] > maximum)
                maximum = bits[y * stride + x];

    return maximum;
}

static int webemu48_lcd_nonzero_stat(int selector)
{
    if (!hLcdDC || !hLcdDC->selectedBitmap ||
        !hLcdDC->selectedBitmap->bitmapInfoHeader ||
        !hLcdDC->selectedBitmap->bitmapBits)
        return -1;

    const BITMAPINFOHEADER *header = hLcdDC->selectedBitmap->bitmapInfoHeader;
    const int width = header->biWidth;
    const int height = abs(header->biHeight);
    const int stride = 4 * ((width * header->biBitCount + 31) / 32);
    const BYTE *bits = (const BYTE *) hLcdDC->selectedBitmap->bitmapBits;

    int minX = width;
    int maxX = -1;
    int minY = height;
    int maxY = -1;
    int count = 0;

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            if (bits[y * stride + x] == 0)
                continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            ++count;
        }
    }

    switch (selector) {
    case 0: return count;
    case 1: return count ? minX : -1;
    case 2: return maxX;
    case 3: return count ? minY : -1;
    case 4: return maxY;
    default: return -1;
    }
}

WEBEMU48_EXPORT
int webemu48_lcd_nonzero_count(void)
{
    return webemu48_lcd_nonzero_stat(0);
}

WEBEMU48_EXPORT
int webemu48_lcd_nonzero_min_x(void)
{
    return webemu48_lcd_nonzero_stat(1);
}

WEBEMU48_EXPORT
int webemu48_lcd_nonzero_max_x(void)
{
    return webemu48_lcd_nonzero_stat(2);
}

WEBEMU48_EXPORT
int webemu48_lcd_nonzero_min_y(void)
{
    return webemu48_lcd_nonzero_stat(3);
}

WEBEMU48_EXPORT
int webemu48_lcd_nonzero_max_y(void)
{
    return webemu48_lcd_nonzero_stat(4);
}

static int webemu48_visible_raw_extreme(BOOL wantMaximum)
{
    if (!hLcdDC || !hLcdDC->selectedBitmap ||
        !hLcdDC->selectedBitmap->bitmapInfoHeader ||
        !hLcdDC->selectedBitmap->bitmapBits)
        return -1;

    const BITMAPINFOHEADER *header = hLcdDC->selectedBitmap->bitmapInfoHeader;
    const int sourceWidth = header->biWidth;
    const int sourceHeight = abs(header->biHeight);
    const int stride = 4 * ((sourceWidth * header->biBitCount + 31) / 32);
    const BYTE *bits = (const BYTE *) hLcdDC->selectedBitmap->bitmapBits;
    int extreme = wantMaximum ? 0 : 255;

    for (int y = 0; y < sourceHeight; ++y) {
        int sourceX = 0;
        if (y < Chipset.d0size)
            sourceX = Chipset.d0offset;
        else if (y < Chipset.d0size + MAINSCREENHEIGHT)
            sourceX = Chipset.boffset;

        for (int x = 0; x < WEBEMU48_LCD_WIDTH; ++x) {
            const int sx = sourceX + x;
            if (sx < 0 || sx >= sourceWidth)
                continue;
            const int value = bits[y * stride + sx];
            if (wantMaximum) {
                if (value > extreme) extreme = value;
            } else {
                if (value < extreme) extreme = value;
            }
        }
    }

    return extreme;
}

WEBEMU48_EXPORT
int webemu48_lcd_visible_raw_min(void)
{
    return webemu48_visible_raw_extreme(FALSE);
}

WEBEMU48_EXPORT
int webemu48_lcd_visible_raw_max(void)
{
    return webemu48_visible_raw_extreme(TRUE);
}

WEBEMU48_EXPORT
int webemu48_contrast(void)
{
    return (int) Chipset.contrast;
}

static unsigned int webemu48_palette_rgb(int index)
{
    HPALETTE palette = NULL;
    if (hLcdDC)
        palette = hLcdDC->realizedPalette ? hLcdDC->realizedPalette : hLcdDC->selectedPalette;

    if (!palette || !palette->paletteLog ||
        index < 0 || index >= palette->paletteLog->palNumEntries)
        return 0xFFFFFFFFu;

    const PALETTEENTRY *entry = &palette->paletteLog->palPalEntry[index];
    return ((unsigned int)entry->peRed << 16) |
           ((unsigned int)entry->peGreen << 8) |
           (unsigned int)entry->peBlue;
}

WEBEMU48_EXPORT
unsigned int webemu48_palette0_rgb(void)
{
    return webemu48_palette_rgb(0);
}

WEBEMU48_EXPORT
unsigned int webemu48_palette1_rgb(void)
{
    return webemu48_palette_rgb(1);
}

WEBEMU48_EXPORT
int webemu48_boffset(void)
{
    return (int) Chipset.boffset;
}

WEBEMU48_EXPORT
int webemu48_d0offset(void)
{
    return (int) Chipset.d0offset;
}
