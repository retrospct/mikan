import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IPC,
  type AuthState,
  type ConnectorsState,
  type ConnectorId,
  type NimiApi,
  type UpdateStatus
} from '@nimi/contract/ipc'

// Custom APIs for renderer — the only data surface the renderer can reach.
const api: NimiApi = {
  pipeline: {
    captureText: (text: string, name?: string) =>
      ipcRenderer.invoke(IPC.pipelineCaptureText, text, name),
    captureFile: (bytes: Uint8Array, name: string, mime?: string) =>
      ipcRenderer.invoke(IPC.pipelineCaptureFile, bytes, name, mime),
    archive: () => ipcRenderer.invoke(IPC.pipelineArchive),
    feed: () => ipcRenderer.invoke(IPC.pipelineFeed),
    uncoverTodos: () => ipcRenderer.invoke(IPC.pipelineUncoverTodos),
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
  connectors: {
    connect: (provider: ConnectorId) => ipcRenderer.invoke(IPC.connectorsConnect, provider),
    disconnect: (provider: ConnectorId) => ipcRenderer.invoke(IPC.connectorsDisconnect, provider),
    getState: () => ipcRenderer.invoke(IPC.connectorsGetState),
    syncNow: (provider: ConnectorId) => ipcRenderer.invoke(IPC.connectorsSyncNow, provider),
    onChanged: (cb: (state: ConnectorsState) => void) => {
      const handler = (_e: IpcRendererEvent, state: ConnectorsState): void => cb(state)
      ipcRenderer.on(IPC.connectorsChanged, handler)
      return (): void => { ipcRenderer.removeListener(IPC.connectorsChanged, handler) }
    }
  },
  ui: {
    setBadge: (count: number) => ipcRenderer.invoke(IPC.traySetBadge, count)
  },
  update: {
    getStatus: () => ipcRenderer.invoke(IPC.updateGetStatus),
    quitAndInstall: () => ipcRenderer.invoke(IPC.updateQuitAndInstall),
    onChanged: (cb: (status: UpdateStatus) => void) => {
      const handler = (_e: IpcRendererEvent, status: UpdateStatus): void => cb(status)
      ipcRenderer.on(IPC.updateChanged, handler)
      return (): void => {
        ipcRenderer.removeListener(IPC.updateChanged, handler)
      }
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
