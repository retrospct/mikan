import { ElectronAPI } from '@electron-toolkit/preload'
import { NeemeApi } from '../shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: NeemeApi
  }
}
