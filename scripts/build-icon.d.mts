import type { Page } from '@playwright/test'

export declare const ICONSET: ReadonlyArray<{
  name: string
  size: number
  source: 'master' | 'small'
}>

export declare function renderSvg(
  page: Page,
  svgPath: string,
  size: number,
  outPath: string,
): Promise<void>
