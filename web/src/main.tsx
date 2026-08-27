/**
 * main.tsx - the web app entry.
 *
 * Order matters: './install' sets up window.lekha (and the keyboard bridge)
 * before '@renderer/main' - the existing desktop renderer bootstrap - runs its
 * synchronous theme apply and React mount. From there the app is identical to
 * the desktop renderer; it simply talks to the browser adapter instead of IPC.
 */
import './install'
import '@renderer/main'
