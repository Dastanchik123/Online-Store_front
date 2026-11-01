// Печать чеков на термопринтер (Xprinter XP-80C и совместимые ESC/POS).
//
// Два режима (настройка терминала receipt_print_config в SQLite):
//  - 'driver' — как раньше, через драйвер Windows (webContents.print), но с
//    точным размером листа под ленту и без масштабирования: раньше чек
//    шириной 82мм ужимался драйвером в 72мм области печати и размывался;
//  - 'raster' — HTML-чек рендерится в скрытом окне ровно в 576 точек ширины
//    (72мм × 8 точек/мм при 203 dpi), переводится в 1-бит порогом (без
//    дизеринга — он делает текст «рваным») и уходит на принтер командой
//    ESC/POS GS v 0 как RAW-задание в очередь Windows. Драйвер не участвует,
//    поэтому нет ни масштабирования, ни полутонов, а кириллица (включая
//    кыргызские ң/ө/ү, которых нет в кодовых страницах CP866/WPC1251)
//    печатается как картинка — точно так, как свёрстана.
//
// RAW-байты отправляются через WinAPI winspool (OpenPrinter/WritePrinter)
// из PowerShell-хелпера — без нативных npm-модулей и пересборки под Electron.
const { BrowserWindow, app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const CSS_PX_PER_MM = 96 / 25.4;
const DOTS_PER_MM = 8; // 203 dpi

// Ширина бумаги → ширина области печати. Сам чек сообщает ширину ленты
// через <meta name="print-roll-width-mm">, по умолчанию 80мм.
const ROLL_SPECS = {
  80: { paperMm: 80, printMm: 72, dots: 576 },
  58: { paperMm: 58, printMm: 48, dots: 384 },
};

// Порог перевода в 1-бит: чем выше, тем больше серых пикселей сглаживания
// становятся чёрными — текст получается жирнее.
const DENSITY_THRESHOLDS = { light: 128, normal: 160, dark: 192 };

const DEFAULT_CONFIG = { mode: 'driver', density: 'normal', cut: true };

const PRINT_TIMEOUT_MS = 45000;

// Понятные кассиру тексты ошибок (в UI уходит только это, не stack trace)
const MESSAGES = {
  NOT_FOUND: 'Принтер не найден. Проверьте, что он включён и выбран в настройках принтера.',
  NO_PRINTER: 'Принтер для чеков не выбран. Выберите его в настройках принтера.',
  OFFLINE: 'Принтер не в сети. Проверьте кабель USB и питание принтера.',
  NO_PAPER: 'В принтере закончилась бумага. Вставьте новый рулон и повторите печать.',
  DOOR_OPEN: 'Открыта крышка принтера. Закройте крышку и повторите печать.',
  JAMMED: 'Замятие бумаги в принтере. Устраните замятие и повторите печать.',
  PRINTER_ERROR: 'Принтер сообщил об ошибке. Проверьте бумагу и крышку, затем повторите печать.',
  TIMEOUT: 'Принтер не ответил вовремя. Проверьте подключение и повторите печать.',
  CANCELLED: 'Печать отменена.',
  FAILED: 'Не удалось напечатать чек. Проверьте принтер и повторите печать.',
};

// Ошибка состояния принтера: печать через драйвер её не исправит,
// поэтому на этих ошибках фолбэк не делаем — сразу сообщаем кассиру.
class PrinterStateError extends Error {
  constructor(code, detail) {
    super(MESSAGES[code] || MESSAGES.FAILED);
    this.code = code;
    this.detail = detail;
  }
}

// ─────────────────────────────────────────────
//  Лог печати: userData/logs/print.log
// ─────────────────────────────────────────────
function logPrint(...parts) {
  const line = `[${new Date().toISOString()}] ${parts
    .map((p) => (p instanceof Error ? `${p.code || ''} ${p.message} ${p.detail || ''}`.trim() : typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ')}\n`;
  console.log('[print]', line.trim());
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'print.log'), line);
  } catch (e) {
    /* лог — не критично, печать не должна падать из-за него */
  }
}

function withTimeout(promise, ms, code = 'TIMEOUT') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new PrinterStateError(code, `timeout ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ─────────────────────────────────────────────
//  Рендер HTML в скрытом окне
// ─────────────────────────────────────────────
function readRollSpec(html) {
  const m = /<meta\s+name=["']print-roll-width-mm["']\s+content=["'](\d+)["']/i.exec(html);
  return ROLL_SPECS[m ? Number(m[1]) : 80] || ROLL_SPECS[80];
}

async function loadHtml(win, html) {
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  // Шрифты и картинки (логотип, QR) должны догрузиться до замера и снимка
  await win.webContents.executeJavaScript(`
    Promise.all([
      document.fonts ? document.fonts.ready : null,
      ...Array.from(document.images).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })),
    ]).then(() => true)
  `);
}

// Высота содержимого в CSS px (окно изначально низкое, поэтому scrollHeight
// равен высоте контента, а не высоте окна)
function measureContentHeight(win) {
  return win.webContents.executeJavaScript(
    'Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))'
  );
}

const nextFrame = (ms = 120) => new Promise((r) => setTimeout(r, ms));

// Offscreen-окно отдаёт кадр по событию 'paint'. После прокрутки/ресайза
// ждём, пока отрисовка «затихнет» — иначе capturePage вернёт кадр с ещё
// не дорисованными (белыми) полосами.
function waitForPaint(webContents, { quietMs = 120, maxMs = 2000 } = {}) {
  return new Promise((resolve) => {
    let quietTimer = null;
    const done = () => {
      clearTimeout(quietTimer);
      clearTimeout(maxTimer);
      webContents.removeListener('paint', onPaint);
      resolve();
    };
    const onPaint = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(done, quietMs);
    };
    const maxTimer = setTimeout(done, maxMs);
    webContents.on('paint', onPaint);
    webContents.invalidate();
  });
}

// ─────────────────────────────────────────────
//  Режим 'driver': через драйвер Windows, без масштабирования
// ─────────────────────────────────────────────
async function printViaDriver(html, printerName) {
  const roll = readRollSpec(html);
  // Лист шириной в область печати (72мм), а не в ленту (80мм): у драйвера
  // XP-80C все форматы «80(72.1) x …» шириной 72мм с печатью от левого края.
  // Лист 80мм с чеком по центру (отступ 4мм) обрезался справа, а
  // нестандартный для драйвера размер подменялся листом 210мм — низ чека
  // (ИТОГО, оплата) терялся. На листе 72мм body без отступа (RECEIPT_BASE_CSS).
  const sheetMm = roll.printMm;
  const win = new BrowserWindow({
    show: false,
    // useContentSize: ширина именно области страницы, без рамки окна —
    // иначе вёрстка при замере уже, чем на листе, и высота не совпадает
    useContentSize: true,
    width: Math.ceil(sheetMm * CSS_PX_PER_MM),
    height: 100,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  try {
    await loadHtml(win, html);
    const heightMm = Math.ceil((await measureContentHeight(win)) / CSS_PX_PER_MM) + 2;
    // Размер листа = область печати × фактическая высота чека; одинаково и в
    // CSS, и в pageSize, чтобы Chromium не выбирал между ними и не добавлял
    // пустых страниц.
    await win.webContents.insertCSS(`@page { size: ${sheetMm}mm ${heightMm}mm; margin: 0; }`);
    const options = {
      silent: !!printerName,
      deviceName: printerName || undefined,
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize: { width: sheetMm * 1000, height: Math.max(heightMm * 1000, 10000) },
      scaleFactor: 100,
      pagesPerSheet: 1,
      color: false,
    };
    await new Promise((resolve, reject) => {
      win.webContents.print(options, (success, failureReason) => {
        if (success) return resolve();
        const code = failureReason === 'cancelled' ? 'CANCELLED' : 'FAILED';
        reject(new PrinterStateError(code, `driver: ${failureReason}`));
      });
    });
  } finally {
    win.destroy();
  }
}

// ─────────────────────────────────────────────
//  Режим 'raster': HTML → 1-бит растр → ESC/POS
// ─────────────────────────────────────────────
// Длинный чек снимается полосами. Полоса должна быть ниже экрана: offscreen-
// рендер не дорисовывает часть окна за пределами высоты дисплея (проверено
// на 1366×768). 480 точек влезает даже в киоск-экран 1024×600.
const BAND_DOTS = 480;

// Рендерит HTML в монохромную картинку шириной ровно roll.dots точек.
// Возвращает { width, height, bits } — bits: Uint8Array, 1 = чёрная точка.
async function rasterizeHtml(html, roll, threshold) {
  const zoom = roll.dots / (roll.printMm * CSS_PX_PER_MM); // ≈2.1167: 1 точка принтера = 1 пиксель снимка
  const win = new BrowserWindow({
    show: false,
    width: roll.dots,
    height: 100,
    useContentSize: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  try {
    await loadHtml(win, html);
    win.webContents.setZoomFactor(zoom);
    // Окно = ровно область печати (72мм), чек (body 72мм, margin auto)
    // заполняет его целиком. Скроллбары не нужны — они съели бы ширину.
    await win.webContents.insertCSS('html, body { overflow: hidden !important; } ::-webkit-scrollbar { display: none; }');
    await nextFrame();

    const cssHeight = await measureContentHeight(win);
    const totalDots = Math.max(1, Math.ceil(cssHeight * zoom));
    const bandDots = Math.min(BAND_DOTS, totalDots);
    win.setContentSize(roll.dots, bandDots);
    await waitForPaint(win.webContents);

    const width = roll.dots;
    const bits = new Uint8Array(width * totalDots);
    let filledTo = 0;
    while (filledTo < totalDots) {
      // Не прокрутка, а сдвиг страницы вверх: в скрытом offscreen-окне
      // Chromium после scrollTo не растеризует новые участки (кадр приходит
      // с белыми полосами), а сдвиг через top — это обычная перерисовка
      // видимой области. Смещение кратно точке, так что полосы стыкуются
      // без швов и без перекрытий.
      await win.webContents.executeJavaScript(
        `document.documentElement.style.position = 'relative'; document.documentElement.style.top = '${-filledTo / zoom}px'; 0`
      );
      await waitForPaint(win.webContents);
      let img = await win.webContents.capturePage();
      const size = img.getSize();
      if (!size.width || !size.height) throw new Error('capturePage вернул пустой снимок');
      // При масштабе экрана ≠ 100% снимок крупнее — приводим к ширине ленты
      if (size.width !== width) {
        img = img.resize({ width, height: Math.round((size.height * width) / size.width), quality: 'best' });
      }
      const rows = Math.min(img.getSize().height, totalDots - filledTo);
      const bmp = img.toBitmap(); // BGRA
      for (let y = 0; y < rows; y++) {
        const dstRow = (filledTo + y) * width;
        const srcRow = y * width * 4;
        for (let x = 0; x < width; x++) {
          const i = srcRow + x * 4;
          // Яркость по BT.601; прозрачное считаем белым фоном
          const a = bmp[i + 3] / 255;
          const lum = (bmp[i + 2] * 299 + bmp[i + 1] * 587 + bmp[i] * 114) / 1000;
          const l = lum * a + 255 * (1 - a);
          bits[dstRow + x] = l < threshold ? 1 : 0;
        }
      }
      if (rows <= 0) break;
      filledTo += rows;
    }
    return { width, height: filledTo, bits };
  } finally {
    win.destroy();
  }
}

// Убирает пустые строки в конце (белое поле под чеком — лишняя бумага)
function trimBottom(raster) {
  const { width, bits } = raster;
  let h = raster.height;
  outer: while (h > 0) {
    const row = (h - 1) * width;
    for (let x = 0; x < width; x++) if (bits[row + x]) break outer;
    h--;
  }
  return { ...raster, height: Math.max(h, 1) };
}

// GS v 0 — растровое изображение; полосами по 256 строк, чтобы не
// переполнять буфер принтера на длинных чеках.
function encodeEscPos(raster, { cut = true } = {}) {
  const { width, height, bits } = raster;
  const bytesPerRow = Math.ceil(width / 8);
  const chunks = [Buffer.from([0x1b, 0x40])]; // ESC @ — сброс
  for (let y0 = 0; y0 < height; y0 += 256) {
    const rows = Math.min(256, height - y0);
    const header = Buffer.from([
      0x1d, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
      rows & 0xff, (rows >> 8) & 0xff,
    ]);
    const data = Buffer.alloc(bytesPerRow * rows);
    for (let y = 0; y < rows; y++) {
      const src = (y0 + y) * width;
      const dst = y * bytesPerRow;
      for (let x = 0; x < width; x++) {
        if (bits[src + x]) data[dst + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    chunks.push(header, data);
  }
  chunks.push(Buffer.from([0x1b, 0x64, 0x04])); // ESC d 4 — протяжка до ножа
  if (cut) chunks.push(Buffer.from([0x1d, 0x56, 0x42, 0x00])); // GS V 66 0 — подрезка
  return Buffer.concat(chunks);
}

// ─────────────────────────────────────────────
//  RAW-задание в очередь Windows через winspool
// ─────────────────────────────────────────────
// C#-обвязка над winspool.drv: отправка RAW, состояние принтера и задания.
// Статусы читаются напрямую (GetPrinter/GetJob) — это миллисекунды, а не
// секунды, как через WMI.
const RAW_PRINT_CS = `
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public class RawPrintPrepareException : Exception {
  public RawPrintPrepareException(string message) : base(message) {}
}
public static class KurulushRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  [DllImport("winspool.drv", EntryPoint = "GetPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool GetPrinter(IntPtr h, int level, IntPtr buf, int cb, out int needed);
  [DllImport("winspool.drv", EntryPoint = "GetJobW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool GetJob(IntPtr h, int jobId, int level, IntPtr buf, int cb, out int needed);
  [DllImport("winspool.drv", EntryPoint = "SetJobW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool SetJob(IntPtr h, int jobId, int level, IntPtr buf, int command);

  static IntPtr Open(string printer) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) {
      int e = Marshal.GetLastWin32Error();
      throw new RawPrintPrepareException(e == 1801 ? "NOT_FOUND" : "OPEN_" + e);
    }
    return h;
  }

  // Состояние принтера по PRINTER_INFO_2.Status / Attributes
  public static string GetState(string printer) {
    IntPtr h;
    try { h = Open(printer); } catch (RawPrintPrepareException ex) { return ex.Message == "NOT_FOUND" ? "NOT_FOUND" : "PRINTER_ERROR"; }
    try {
      int needed;
      GetPrinter(h, 2, IntPtr.Zero, 0, out needed);
      if (needed <= 0) return "OK";
      IntPtr buf = Marshal.AllocHGlobal(needed);
      try {
        if (!GetPrinter(h, 2, buf, needed, out needed)) return "OK";
        int off = 13 * IntPtr.Size; // 13 указателей до Attributes
        int attrs = Marshal.ReadInt32(buf, off);
        int s = Marshal.ReadInt32(buf, off + 20);
        if ((s & 0x10) != 0) return "NO_PAPER";
        if ((s & 0x400000) != 0) return "DOOR_OPEN";
        if ((s & 0x8) != 0) return "JAMMED";
        if ((s & 0x80) != 0 || (s & 0x1000) != 0 || (attrs & 0x400) != 0) return "OFFLINE";
        if ((s & 0x2) != 0 || (s & 0x100000) != 0) return "PRINTER_ERROR";
        return "OK";
      } finally { Marshal.FreeHGlobal(buf); }
    } finally { ClosePrinter(h); }
  }

  // Состояние задания по JOB_INFO_1.Status; задания нет в очереди = DONE
  public static string GetJobState(string printer, int jobId) {
    IntPtr h = Open(printer);
    try {
      int needed;
      GetJob(h, jobId, 1, IntPtr.Zero, 0, out needed);
      if (needed <= 0) return "DONE";
      IntPtr buf = Marshal.AllocHGlobal(needed);
      try {
        if (!GetJob(h, jobId, 1, buf, needed, out needed)) return "DONE";
        int s = Marshal.ReadInt32(buf, 7 * IntPtr.Size); // JobId (+выравнивание) и 6 указателей
        if ((s & 0x40) != 0) return "NO_PAPER";
        if ((s & 0x20) != 0) return "OFFLINE";
        if ((s & (0x2 | 0x200 | 0x400)) != 0) return "PRINTER_ERROR";
        if ((s & (0x80 | 0x100 | 0x1000)) != 0) return "DONE";
        return "PENDING";
      } finally { Marshal.FreeHGlobal(buf); }
    } finally { ClosePrinter(h); }
  }

  public static void CancelJob(string printer, int jobId) {
    IntPtr h;
    try { h = Open(printer); } catch (RawPrintPrepareException) { return; }
    try { SetJob(h, jobId, 0, IntPtr.Zero, 5); } finally { ClosePrinter(h); } // JOB_CONTROL_DELETE
  }

  public static int Send(string printer, byte[] data, string docName) {
    IntPtr h = Open(printer);
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = docName;
      di.pDataType = "RAW";
      int job = StartDocPrinter(h, 1, di);
      // Например, драйвер не принимает RAW — данных ещё не отправили
      if (job == 0) throw new RawPrintPrepareException("STARTDOC_" + Marshal.GetLastWin32Error());
      try {
        StartPagePrinter(h);
        int written;
        if (!WritePrinter(h, data, data.Length, out written) || written != data.Length)
          throw new Win32Exception(Marshal.GetLastWin32Error());
        EndPagePrinter(h);
      } finally {
        EndDocPrinter(h);
      }
      return job;
    } finally {
      ClosePrinter(h);
    }
  }
}
`;

// Постоянный процесс PowerShell: команды — JSON-строки в stdin, ответы —
// JSON-строки в stdout. Холодный старт PowerShell занимает 2–3 секунды,
// поэтому процесс поднимается заранее (warmUp) и живёт до выхода из
// приложения.
//   stage: 'prepare' — данные ещё не отправлены (можно безопасно делать фолбэк),
//          'sent'    — данные уже в очереди (фолбэк = риск двойного чека).
const RAW_PRINT_PS = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
function Send-Line($o) { [Console]::Out.WriteLine((New-Object PSObject -Property $o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function Get-Inner($e) { while ($e.InnerException) { $e = $e.InnerException }; $e }
try {
  if (-not (Test-Path -LiteralPath $env:KPOS_DLL)) {
    Add-Type -TypeDefinition ([IO.File]::ReadAllText($env:KPOS_CS)) -OutputAssembly $env:KPOS_DLL -OutputType Library
  }
  Add-Type -LiteralPath $env:KPOS_DLL
  Send-Line @{ id = 0; ready = $true }
} catch {
  Send-Line @{ id = 0; ready = $false; detail = "$($_.Exception.GetType().Name): $($_.Exception.Message)" }
  exit 1
}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  $rid = -1
  $stage = 'prepare'
  try {
    $req = $line | ConvertFrom-Json
    $rid = $req.id
    if ($req.cmd -eq 'status') {
      Send-Line @{ id = $rid; ok = $true; state = [KurulushRawPrint]::GetState($req.printer) }
    } elseif ($req.cmd -eq 'print') {
      $state = [KurulushRawPrint]::GetState($req.printer)
      if ($state -ne 'OK') {
        Send-Line @{ id = $rid; ok = $false; code = $state; stage = $stage }
      } else {
        $bytes = [IO.File]::ReadAllBytes($req.file)
        $job = [KurulushRawPrint]::Send($req.printer, $bytes, 'Kurulush POS receipt')
        $stage = 'sent'
        # Ждём, пока задание уйдёт из очереди: так ловим «нет бумаги» /
        # «офлайн», о которых драйвер сообщает уже по ходу печати.
        $deadline = (Get-Date).AddSeconds([int]$req.wait)
        $result = $null
        while ((Get-Date) -lt $deadline) {
          $js = [KurulushRawPrint]::GetJobState($req.printer, $job)
          if ($js -eq 'DONE') { $result = @{ id = $rid; ok = $true; job = $job; stage = $stage }; break }
          if ($js -ne 'PENDING') {
            [KurulushRawPrint]::CancelJob($req.printer, $job)
            $result = @{ id = $rid; ok = $false; code = $js; job = $job; stage = $stage }
            break
          }
          Start-Sleep -Milliseconds 200
        }
        if (-not $result) {
          [KurulushRawPrint]::CancelJob($req.printer, $job)
          $result = @{ id = $rid; ok = $false; code = 'TIMEOUT'; job = $job; stage = $stage }
        }
        Send-Line $result
      }
    } else {
      Send-Line @{ id = $rid; ok = $false; code = 'HELPER_ERROR'; stage = $stage; detail = "unknown cmd" }
    }
  } catch {
    $inner = Get-Inner $_.Exception
    if ($inner.GetType().Name -eq 'Win32Exception') { $stage = 'sent' }
    Send-Line @{ id = $rid; ok = $false; code = 'HELPER_ERROR'; stage = $stage; detail = "$($inner.GetType().Name): $($inner.Message)" }
  }
}
`;

let helperFiles = null;
function ensureHelperFiles() {
  if (helperFiles) return helperFiles;
  const dir = path.join(app.getPath('userData'), 'print-helper');
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash('sha1').update(RAW_PRINT_CS).digest('hex').slice(0, 10);
  const cs = path.join(dir, `raw-print-${hash}.cs`);
  const ps1 = path.join(dir, 'raw-print-host.ps1');
  if (!fs.existsSync(cs)) fs.writeFileSync(cs, RAW_PRINT_CS);
  // BOM нужен, иначе Windows PowerShell 5.1 читает скрипт в ANSI
  fs.writeFileSync(ps1, '\ufeff' + RAW_PRINT_PS);
  helperFiles = { cs, ps1, dll: path.join(dir, `raw-print-${hash}.dll`) };
  return helperFiles;
}

let helper = null; // { proc, ready: Promise, pending: Map }
let nextRequestId = 1;

function startHelper() {
  if (helper) return helper;
  const files = ensureHelperFiles();
  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', files.ps1],
    { env: { ...process.env, KPOS_CS: files.cs, KPOS_DLL: files.dll }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const pending = new Map();
  let resolveReady;
  let rejectReady;
  const ready = new Promise((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  ready.catch(() => {});
  const current = { proc, ready, pending };
  helper = current;

  let buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/^\ufeff/, '').trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('{')) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (e) {
        continue;
      }
      if (msg.id === 0) {
        if (msg.ready) resolveReady();
        else rejectReady(Object.assign(new Error(`print helper: ${msg.detail || 'не запустился'}`), { stage: 'prepare' }));
        continue;
      }
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p.resolve(msg);
      }
    }
  });
  // Запись в stdin умершего процесса — не повод ронять main-процесс
  proc.stdin.on('error', () => {});
  let stderr = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-500);
  });
  const onExit = (reason) => {
    if (helper === current) helper = null;
    const err = new Error(`print helper завершился: ${reason} ${stderr}`.trim());
    rejectReady(Object.assign(err, { stage: 'prepare' }));
    for (const p of pending.values()) p.reject(Object.assign(new Error(err.message), { stage: p.stageOnFailure }));
    pending.clear();
  };
  proc.on('error', (e) => onExit(e.message));
  proc.on('exit', (code) => onExit(`код ${code}`));
  return current;
}

// Заранее поднять хелпер, чтобы первый чек не ждал старта PowerShell
function warmUp() {
  if (process.platform !== 'win32') return;
  try {
    startHelper();
  } catch (e) {
    logPrint('print helper warm-up failed:', e);
  }
}

function stopHelper() {
  if (helper) {
    try {
      helper.proc.kill();
    } catch (e) {
      /* процесс уже завершился */
    }
    helper = null;
  }
}

// stageOnFailure — чем считать сбой хелпера посреди запроса: для печати
// это 'sent' (данные могли уйти — фолбэк опасен), для статуса — 'prepare'.
// readyTimeoutMs — сколько ждать старта хелпера (первый запуск с компиляцией
// C# — до ~6 секунд). Не дождались — хелпер продолжает подниматься в фоне.
async function helperRequest(cmd, payload, timeoutMs, stageOnFailure, readyTimeoutMs = 20000) {
  const h = startHelper();
  let readyTimer;
  await Promise.race([
    h.ready.catch((e) => {
      stopHelper();
      throw e;
    }),
    new Promise((_, reject) => {
      readyTimer = setTimeout(() => reject(Object.assign(new Error('print helper ещё запускается'), { stage: 'prepare' })), readyTimeoutMs);
    }),
  ]).finally(() => clearTimeout(readyTimer));
  const id = nextRequestId++;
  // Только ASCII в stdin: кириллица в имени принтера экранируется \\uXXXX
  const line = JSON.stringify({ id, cmd, ...payload }).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      h.pending.delete(id);
      // Зависший хелпер перезапускаем: следующий чек поднимет новый процесс
      stopHelper();
      reject(Object.assign(new PrinterStateError('TIMEOUT', `helper ${cmd} timeout`), { stage: stageOnFailure }));
    }, timeoutMs);
    h.pending.set(id, {
      stageOnFailure,
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    h.proc.stdin.write(line + '\n');
  });
}

// Проверка состояния принтера перед печатью через драйвер. Если проверка
// сама не отработала — не мешаем печати.
async function checkPrinterState(printerName) {
  if (process.platform !== 'win32' || !printerName) return;
  let res;
  try {
    res = await helperRequest('status', { printer: printerName }, 5000, 'prepare', 2000);
  } catch (e) {
    logPrint('status check skipped:', e);
    return;
  }
  if (res.ok && res.state && res.state !== 'OK') throw new PrinterStateError(res.state, 'status check');
}

async function sendRaw(printerName, bytes, waitSeconds) {
  const file = path.join(os.tmpdir(), `kpos-receipt-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(file, bytes);
  try {
    const res = await helperRequest('print', { printer: printerName, file, wait: waitSeconds }, (waitSeconds + 10) * 1000, 'sent');
    if (res.ok) return res;
    if (res.code === 'HELPER_ERROR') {
      throw Object.assign(new Error(`raw helper: ${res.detail || ''}`), { stage: res.stage });
    }
    throw new PrinterStateError(res.code, `raw job ${res.job || '-'}`);
  } finally {
    fs.rm(file, { force: true }, () => {});
  }
}

async function printViaRaster(html, printerName, config) {
  if (process.platform !== 'win32') throw Object.assign(new Error('RAW-печать реализована только для Windows'), { stage: 'prepare' });
  const roll = readRollSpec(html);
  const threshold = DENSITY_THRESHOLDS[config.density] || DENSITY_THRESHOLDS.normal;
  let raster;
  try {
    raster = trimBottom(await rasterizeHtml(html, roll, threshold));
  } catch (e) {
    e.stage = 'prepare';
    throw e;
  }
  const bytes = encodeEscPos(raster, { cut: config.cut !== false });
  // ~200мм/с у XP-80C + запас на USB и очередь
  const waitSeconds = Math.ceil(8 + raster.height / DOTS_PER_MM / 50);
  await sendRaw(printerName, bytes, waitSeconds);
  return { heightMm: Math.round(raster.height / DOTS_PER_MM), bytes: bytes.length };
}

// ─────────────────────────────────────────────
//  Точка входа: печать одного чека с фолбэком
// ─────────────────────────────────────────────
async function resolvePrinterName(webContents, printerName) {
  const list = await webContents.getPrintersAsync();
  if (printerName) {
    if (!list.some((p) => p.name === printerName)) throw new PrinterStateError('NOT_FOUND', printerName);
    return printerName;
  }
  const def = list.find((p) => p.isDefault);
  return def ? def.name : '';
}

let queue = Promise.resolve();

// Чеки печатаются строго по очереди: два одновременных RAW-задания или
// окна печати не должны перемешаться.
function printReceipt(webContents, { html, printerName }, config) {
  const run = () => withTimeout(printReceiptNow(webContents, { html, printerName }, config), PRINT_TIMEOUT_MS);
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

async function printReceiptNow(webContents, { html, printerName }, rawConfig) {
  const config = { ...DEFAULT_CONFIG, ...(rawConfig || {}) };
  try {
    if (config.mode === 'raster') {
      const name = await resolvePrinterName(webContents, printerName);
      if (!name) throw new PrinterStateError('NO_PRINTER');
      try {
        const info = await printViaRaster(html, name, config);
        logPrint('raster ok', { printer: name, ...info });
        return { ok: true, mode: 'raster' };
      } catch (e) {
        // Состояние принтера (нет бумаги и т.п.) или данные уже ушли в
        // очередь — фолбэк на драйвер дал бы ту же ошибку или второй чек.
        if (e instanceof PrinterStateError || e.stage === 'sent') throw e;
        logPrint('raster failed, fallback to driver:', e);
        await printViaDriver(html, name);
        logPrint('driver ok (fallback)', { printer: name });
        return { ok: true, mode: 'driver', fallback: true, fallbackReason: e.message };
      }
    }

    const name = printerName ? await resolvePrinterName(webContents, printerName) : '';
    await checkPrinterState(name);
    await printViaDriver(html, name);
    logPrint('driver ok', { printer: name || '(диалог)' });
    return { ok: true, mode: 'driver' };
  } catch (e) {
    logPrint('print failed:', e);
    return { ok: false, code: e.code || 'FAILED', error: e instanceof PrinterStateError ? e.message : MESSAGES.FAILED };
  }
}

module.exports = {
  DEFAULT_CONFIG,
  printReceipt,
  checkPrinterState,
  warmUp,
  stopHelper,
  // для отладки/тестов растра без принтера
  rasterizeHtml,
  trimBottom,
  encodeEscPos,
  ROLL_SPECS,
  DENSITY_THRESHOLDS,
};
