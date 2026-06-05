import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { createSettingsStore } from '@main/settings'
import { registerDialogHandlers } from '@main/ipc/dialog'
import { registerFileHandlers } from '@main/ipc/files'

// Last-resort handlers so a stray rejection or throw in the main process is
// logged instead of taking the app down silently.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main process:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err)
})

app.setName('Lekha')

// Single reference to the main window - updated every time a new window is created.
let mainWindow: BrowserWindow | null = null

function getWindow(): BrowserWindow | null {
  return mainWindow
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  })

  mainWindow = win

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Open external links in the system browser, not in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

void app.whenReady().then(() => {
  // Settings store backed by the OS user-data directory.
  const settings = createSettingsStore(app.getPath('userData'))

  // Register IPC handlers before creating the window so they are ready
  // the moment the renderer sends its first message.
  registerDialogHandlers(getWindow)
  registerFileHandlers(settings, getWindow)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
