/**
 * install.ts - install the browser platform adapter BEFORE the renderer boots.
 *
 * main.tsx imports this module first; ES modules evaluate imports depth-first in
 * source order, so window.lekha exists before '@renderer/main' runs its
 * synchronous theme apply + React mount (and before App's useStartup calls
 * getSettings). It also seeds the launch-open queue from the URL and installs
 * the keyboard bridge that stands in for the desktop native menu.
 */
// window.lekha's type comes from src/preload/api.d.ts (LekhaAPI), included in
// this app's tsconfig, so no redeclaration is needed here.
import { webAdapter, setPendingOpen } from './adapter/webAdapter'
import { initialOpenPaths } from './router'
import { installKeymap } from './keymap'

window.lekha = webAdapter
setPendingOpen(initialOpenPaths())
installKeymap()
