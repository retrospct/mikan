import { ElectronAPI } from '@electron-toolkit/preload'
import { NimiApi } from '@mikan/contract/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: NimiApi
  }
}
