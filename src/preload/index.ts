import { contextBridge } from 'electron'

// Minimal stub - full IPC API will be wired in a later phase.
// Exposed as window.lekha in the renderer.
contextBridge.exposeInMainWorld('lekha', Object.freeze({}))
