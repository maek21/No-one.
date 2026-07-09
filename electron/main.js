const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

const isDev = !app.isPackaged
const BACKEND_PORT = 8000
const DEV_FRONTEND_URL = 'http://localhost:5174'

let mainWindow = null
let backendProcess = null

function getBackendPath() {
  if (isDev) {
    return null // In dev, backend runs separately
  }
  const resourcesPath = process.resourcesPath
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(resourcesPath, 'backend', `no-one-backend${ext}`)
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = getBackendPath()
    if (!backendPath) {
      resolve() // Dev mode — assume backend already running
      return
    }
    console.log('[electron] Starting backend:', backendPath)
    backendProcess = spawn(backendPath, [], {
      cwd: path.dirname(backendPath),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    backendProcess.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`))
    backendProcess.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`))
    backendProcess.on('error', reject)
    backendProcess.on('exit', (code) => {
      console.log('[electron] Backend exited with code:', code)
    })
    resolve()
  })
}

function waitForBackend(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve()
        else if (Date.now() - start > timeout) reject(new Error('Backend timeout'))
        else setTimeout(poll, 500)
      })
      req.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('Backend timeout'))
        else setTimeout(poll, 500)
      })
      req.end()
    }
    poll()
  })
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: iconPath,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDev) {
    mainWindow.loadURL(DEV_FRONTEND_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function stopBackend() {
  if (backendProcess) {
    console.log('[electron] Stopping backend...')
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', backendProcess.pid.toString(), '/f', '/t'])
    } else {
      backendProcess.kill('SIGTERM')
    }
    backendProcess = null
  }
}

// ── IPC handlers ──
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('get-platform', () => process.platform)

// ── App lifecycle ──
app.whenReady().then(async () => {
  try {
    await startBackend()
    await waitForBackend()
    console.log('[electron] Backend ready')
  } catch (e) {
    console.error('[electron] Backend failed:', e.message)
  }
  createWindow()
})

app.on('window-all-closed', () => {
  stopBackend()
  app.quit()
})

app.on('before-quit', () => {
  stopBackend()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
