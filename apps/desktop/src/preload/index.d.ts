import { ElectronAPI } from '@electron-toolkit/preload'
import { NimiApi } from '@nimi/contract/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: NimiApi
  }
}
