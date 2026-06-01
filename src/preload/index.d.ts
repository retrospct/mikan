import { ElectronAPI } from '@electron-toolkit/preload'
import { NimiApi } from '../shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: NimiApi
  }
}
