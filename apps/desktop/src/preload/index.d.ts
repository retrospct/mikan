import { ElectronAPI } from '@electron-toolkit/preload'
import { MikanApi } from '@mikan/contract/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: MikanApi
  }
}
