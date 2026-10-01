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
extern BOOL buttonDown(int x, int y);
extern void buttonUp(int x, int y);
extern BOOL WebButtonById(UINT nId, BOOL bPressed);
extern BOOL WebCopyLcdRgba(BYTE *destination, UINT destinationSize);
extern UINT WebLcdHeight(VOID);

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

static BOOL webemu48_request_invalid_state(void)
{
    if (nState == SM_INVALID)
        return TRUE;

    if (nState == SM_RUN)
    {
        nNextState = SM_INVALID;
        if (Chipset.Shutdn)
            SetEvent(hEventShutdn);
        else
            bInterrupt = TRUE;
        SuspendDebugger();
        return TRUE;
    }

    if (nState == SM_SLEEP)
    {
        nNextState = SM_INVALID;
        SetEvent(hEventShutdn);
        return TRUE;
    }

    return FALSE;
}

WEBEMU48_EXPORT
int webemu48_request_invalid(void)
{
    if (!webemu48_initialized || !bDocumentAvail)
        return FALSE;
    return webemu48_request_invalid_state();
}

WEBEMU48_EXPORT
int webemu48_reset_cpu(void)
{
    if (!webemu48_initialized || !bDocumentAvail || nState != SM_INVALID)
        return FALSE;

    CpuReset();
    return webemu48_request_run();
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

WEBEMU48_EXPORT
int webemu48_lcd_refresh(void)
{
    if (!bDocumentAvail)
        return FALSE;

    return WebCopyLcdRgba(
        webemu48_lcd_rgba_buffer,
        sizeof(webemu48_lcd_rgba_buffer)
    );
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
    return bDocumentAvail ? (int) WebLcdHeight() : 0;
}

WEBEMU48_EXPORT
int webemu48_annunciators(void)
{
    if (!bDocumentAvail)
        return 0;

    BYTE state = (BYTE)(
        Chipset.IORam[ANNCTRL] |
        (Chipset.IORam[ANNCTRL + 1] << 4)
    );

    /*
     * Match UpdateAnnunciators(): the glass annunciators are dark when the
     * annunciator master bit is off or timer 2 is stopped.
     */
    if ((state & AON) == 0 || (Chipset.IORam[TIMER2_CTRL] & RUN) == 0)
        state = 0;

    return state & 0x3F;
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
