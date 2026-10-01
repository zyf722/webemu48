// Patch display.c
#include "../core/display.c"

DWORD GetKMLColor(UINT index) {
    if (index < 64) return dwKMLColor[index];
    return 0; // Error handling
}


#if defined(WEBEMU48_WEB_PORT)
BOOL WebCopyLcdRgba(BYTE *destination, UINT destinationSize)
{
    const UINT width = 131;
    const UINT height = SCREENHEIGHT;
    const UINT required = width * height * 4;

    if (!destination || !pbyLcd || destinationSize < required)
        return FALSE;

    EnterCriticalSection(&csLcdLock);
    {
        const UINT headerRows =
            (Chipset.d0size < height) ? Chipset.d0size : height;
        UINT mainRows = MAINSCREENHEIGHT;
        if (mainRows > height - headerRows)
            mainRows = height - headerRows;
        const UINT mainEnd = headerRows + mainRows;

        for (UINT y = 0; y < height; ++y)
        {
            UINT sourceX;
            if (y < headerRows)
                sourceX = Chipset.d0offset;
            else if (y < mainEnd)
                sourceX = Chipset.boffset;
            else
                sourceX = 0;

            if (sourceX > LCD_ROW - width)
                sourceX = LCD_ROW - width;

            const BYTE *source =
                pbyLcd + y * LCD_ROW + sourceX;

            for (UINT x = 0; x < width; ++x)
            {
                BYTE index = source[x];
                if (index >= ARRAYSIZEOF(bmiLcd.bmiColors))
                    index = 0;

                const RGBQUAD color = bmiLcd.bmiColors[index];
                BYTE *pixel = destination + (y * width + x) * 4;
                pixel[0] = color.rgbRed;
                pixel[1] = color.rgbGreen;
                pixel[2] = color.rgbBlue;
                pixel[3] = 255;
            }
        }
    }
    LeaveCriticalSection(&csLcdLock);
    return TRUE;
}

UINT WebLcdHeight(VOID)
{
    return SCREENHEIGHT;
}
#endif
