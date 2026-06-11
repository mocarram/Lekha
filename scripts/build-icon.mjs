/**
 * Renders the SVG icon masters to PNG at every macOS iconset size with
 * Playwright Chromium, packs build/icon.icns with iconutil (macOS only),
 * and refreshes build/icon.png (the 1024px electron-builder fallback).
 *
 * Usage: node scripts/build-icon.mjs
 */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCES = {
  master: path.join(ROOT, 'assets/icon/icon-master.svg'),
  small: path.join(ROOT, 'assets/icon/icon-small.svg'),
}

/** The 10 entries iconutil requires, with which master each renders from. */
export const ICONSET = [
  { name: 'icon_16x16.png', size: 16, source: 'small' },
  { name: 'icon_16x16@2x.png', size: 32, source: 'small' },
  { name: 'icon_32x32.png', size: 32, source: 'small' },
  { name: 'icon_32x32@2x.png', size: 64, source: 'master' },
  { name: 'icon_128x128.png', size: 128, source: 'master' },
  { name: 'icon_128x128@2x.png', size: 256, source: 'master' },
  { name: 'icon_256x256.png', size: 256, source: 'master' },
  { name: 'icon_256x256@2x.png', size: 512, source: 'master' },
  { name: 'icon_512x512.png', size: 512, source: 'master' },
  { name: 'icon_512x512@2x.png', size: 1024, source: 'master' },
]

/** Render one SVG file to a square transparent PNG at `size`. */
export async function renderSvg(page, svgPath, size, outPath) {
  const svg = fs.readFileSync(svgPath, 'utf8')
  const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;padding:0}img{display:block}</style>` +
      `<img src="${data}" width="${size}" height="${size}">`,
  )
  await page.screenshot({ path: outPath, omitBackground: true })
}

async function main() {
  const iconset = path.join(ROOT, 'build', 'icon.iconset')
  fs.rmSync(iconset, { recursive: true, force: true })
  fs.mkdirSync(iconset, { recursive: true })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    for (const entry of ICONSET) {
      await renderSvg(page, SOURCES[entry.source], entry.size, path.join(iconset, entry.name))
      console.log(`rendered ${entry.name} (${entry.size}px, ${entry.source})`)
    }
    await renderSvg(page, SOURCES.master, 1024, path.join(ROOT, 'build', 'icon.png'))
  } finally {
    await browser.close()
  }

  if (process.platform === 'darwin') {
    try {
      execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(ROOT, 'build', 'icon.icns')])
      console.log('packed build/icon.icns')
    } finally {
      fs.rmSync(iconset, { recursive: true, force: true })
    }
  } else {
    console.log('skipped iconutil (not macOS); iconset left in build/icon.iconset')
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await main()
