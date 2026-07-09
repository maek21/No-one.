interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  platform: () => Promise<string>
}

interface Window {
  electronAPI?: ElectronAPI
}
