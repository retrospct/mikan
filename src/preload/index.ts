import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type AuthState, type NeemeApi } from '../shared/ipc'

// Custom APIs for renderer — the only data surface the renderer can reach.
const api: NeemeApi = {
  pipeline: {
    captureText: (text: string, name?: string) =>
      ipcRenderer.invoke(IPC.pipelineCaptureText, text, name),
    archive: () => ipcRenderer.invoke(IPC.pipelineArchive),
    feed: () => ipcRenderer.invoke(IPC.pipelineFeed),
    search: (query: string, topK?: number) => ipcRenderer.invoke(IPC.pipelineSearch, query, topK)
  },
  todos: {
    add: (title: string, notes?: string) => ipcRenderer.invoke(IPC.todoAdd, title, notes),
    today: (day?: string) => ipcRenderer.invoke(IPC.todoToday, day),
    backlog: () => ipcRenderer.invoke(IPC.todoBacklog),
    done: (limit?: number) => ipcRenderer.invoke(IPC.todoDone, limit),
    complete: (id: string) => ipcRenderer.invoke(IPC.todoComplete, id),
    reopen: (id: string) => ipcRenderer.invoke(IPC.todoReopen, id),
    plan: (keep: string[], day?: string) => ipcRenderer.invoke(IPC.todoPlan, keep, day),
    schedule: (id: string, day?: string) => ipcRenderer.invoke(IPC.todoSchedule, id, day),
    searchMoreContext: (id: string) => ipcRenderer.invoke(IPC.todoContextSearch, id),
    pinContext: (id: string, itemId: string) => ipcRenderer.invoke(IPC.todoContextPin, id, itemId),
    dismissContext: (id: string, itemId: string) =>
      ipcRenderer.invoke(IPC.todoContextDismiss, id, itemId)
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
  },
  ui: {
    setBadge: (count: number) => ipcRenderer.invoke(IPC.traySetBadge, count)
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
