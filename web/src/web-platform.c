/*
 * Browser host services for the Emu48 Android native port.
 *
 * These replace the Java/JNI callbacks used by emu-jni.c.  Features that
 * require browser APIs are deliberately represented as explicit stubs for
 * the first native bring-up; they can later be connected to JavaScript.
 */

#include "core/pch.h"
#include "emu.h"
#include "win32-layer.h"

#include <stdio.h>
#include <unistd.h>

enum DialogBoxMode currentDialogBoxMode = DialogBoxMode_UNKNOWN;
LPBYTE pbyRomBackup = NULL;
enum ChooseKmlMode chooseCurrentKmlMode = ChooseKmlMode_UNKNOWN;
TCHAR szChosenCurrentKml[MAX_PATH];
TCHAR szKmlLog[10240];
TCHAR szKmlLogBackup[10240];
TCHAR szKmlTitle[10240];
BOOL securityExceptionOccured = FALSE;
BOOL kmlFileNotFound = FALSE;
BOOL settingsPort2en = FALSE;
BOOL settingsPort2wr = FALSE;
BOOL soundAvailable = FALSE;
BOOL soundEnabled = FALSE;
BOOL serialPortSlowDown = FALSE;
TCHAR lastKMLFilename[MAX_PATH];

volatile int webemu48_view_dirty = 0;
int webemu48_view_width = 0;
int webemu48_view_height = 0;

void mainViewUpdateCallback(void)
{
    webemu48_view_dirty = 1;
}

void mainViewResizeCallback(int x, int y)
{
    webemu48_view_width = x;
    webemu48_view_height = y;
    webemu48_view_dirty = 1;
}

int openFileFromContentResolver(const TCHAR *fileURL, int writeAccess)
{
    (void) fileURL;
    (void) writeAccess;
    return -1;
}

int openFileInFolderFromContentResolver(const TCHAR *filename, const TCHAR *folderURL, int writeAccess)
{
    (void) filename;
    (void) folderURL;
    (void) writeAccess;
    return -1;
}

int closeFileFromContentResolver(int fd)
{
    return close(fd);
}

int showAlert(const TCHAR *messageText, int flags)
{
    (void) flags;
    if (messageText)
        fprintf(stderr, "webemu48: %s\n", messageText);
    return IDOK;
}

void sendMenuItemCommand(int menuItem)
{
    (void) menuItem;
}

BOOL getFirstKMLFilenameForType(BYTE chipsetType)
{
    (void) chipsetType;
    return FALSE;
}

void clipboardCopyText(const TCHAR *text)
{
    (void) text;
}

const TCHAR *clipboardPasteText(void)
{
    return NULL;
}

void performHapticFeedback(void)
{
}

void sendByteUdp(unsigned char byteSent)
{
    (void) byteSent;
}

void setKMLIcon(int imageWidth, int imageHeight, LPBYTE buffer, int bufferSize)
{
    (void) imageWidth;
    (void) imageHeight;
    (void) buffer;
    (void) bufferSize;
}

int openSerialPort(const TCHAR *serialPort)
{
    (void) serialPort;
    return -1;
}

int closeSerialPort(int serialPortId)
{
    (void) serialPortId;
    return 0;
}

int setSerialPortParameters(int serialPortId, int baudRate)
{
    (void) serialPortId;
    (void) baudRate;
    return -1;
}

int readSerialPort(int serialPortId, LPBYTE buffer, int nNumberOfBytesToRead)
{
    (void) serialPortId;
    (void) buffer;
    (void) nNumberOfBytesToRead;
    return 0;
}

int writeSerialPort(int serialPortId, LPBYTE buffer, int bufferSize)
{
    (void) serialPortId;
    (void) buffer;
    (void) bufferSize;
    return 0;
}

int serialPortPurgeComm(int serialPortId, int dwFlags)
{
    (void) serialPortId;
    (void) dwFlags;
    return 0;
}

int serialPortSetBreak(int serialPortId)
{
    (void) serialPortId;
    return 0;
}

int serialPortClearBreak(int serialPortId)
{
    (void) serialPortId;
    return 0;
}
