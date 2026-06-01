import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type AuthState, type NeemeApi } from '../shared/ipc'

// Custom APIs for renderer — the only data surface the renderer can reach.
const api: NeemeApi = {
  memory: {
    list: () => ipcRenderer.invoke(IPC.memoryList),
    add: (content: string) => ipcRenderer.invoke(IPC.memoryAdd, content)
  },
  auth: {
    login: () => ipcRenderer.invoke(IPC.authLogin),
    logout: () => ipcRenderer.invoke(IPC.authLogout),
    getAccessToken: () => ipcRenderer.invoke(IPC.authGetToken),
    getState: () => ipcRenderer.invoke(IPC.authGetState),
    onChanged: (cb) => {
      const handler = (
        _e: IpcRendererEvent,
        payload: { state: AuthState; accessToken?: string }
      ): void => cb(payload.state, payload.accessToken)
      ipcRenderer.on(IPC.authChanged, handler)
      return () => ipcRenderer.removeListener(IPC.authChanged, handler)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
