/*
 * Minimal C API for the browser port.
 *
 * ROM and KML resources are expected to be present in the Emscripten
 * filesystem before webemu48_new_document() is called.
 */

#include "core/pch.h"
#include "core/Emu48.h"
#include "core/kml.h"
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

    ResumeThread(hThread);
    while (nState != nNextState)
        Sleep(0);

    webemu48_initialized = TRUE;
    return TRUE;
}

WEBEMU48_EXPORT
int webemu48_new_document(const char *kmlFilename, const char *baseDirectory)
{
    if (!webemu48_initialized || !kmlFilename || !kmlFilename[0])
        return FALSE;

    if (bDocumentAvail) {
        SwitchToState(SM_INVALID);
        if (bAutoSave)
            SaveDocument();
    }

    chooseCurrentKmlMode = ChooseKmlMode_FILE_NEW;
    _tcsncpy(szChosenCurrentKml, kmlFilename, MAX_PATH - 1);
    szChosenCurrentKml[MAX_PATH - 1] = _T('\0');

    copy_directory(szEmuDirectory, baseDirectory);
    copy_directory(szRomDirectory, baseDirectory);

    BOOL result = NewDocument();
    chooseCurrentKmlMode = ChooseKmlMode_UNKNOWN;

    if (result) {
        mainViewResizeCallback(nBackgroundW, nBackgroundH);
        if (pbyRom)
            SwitchToState(SM_RUN);
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
