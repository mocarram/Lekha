import { describe, it, expect } from 'vitest'
import { ICONSET } from '../../../scripts/build-icon.mjs'

const APPLE_NAMES = [
  'icon_16x16.png', 'icon_16x16@2x.png',
  'icon_32x32.png', 'icon_32x32@2x.png',
  'icon_128x128.png', 'icon_128x128@2x.png',
  'icon_256x256.png', 'icon_256x256@2x.png',
  'icon_512x512.png', 'icon_512x512@2x.png',
]

describe('build-icon ICONSET map', () => {
  it('covers exactly the 10 Apple iconset entries', () => {
    expect(ICONSET.map((e) => e.name).sort()).toEqual([...APPLE_NAMES].sort())
  })

  it('every @2x entry renders at double its base size', () => {
    for (const e of ICONSET) {
      const m = /^icon_(\d+)x\1(@2x)?\.png$/.exec(e.name)
      expect(m).not.toBeNull()
      const base = Number(m![1])
      expect(e.size).toBe(m![2] ? base * 2 : base)
    }
  })

  it('16 and 32 px renders use the simplified small master', () => {
    for (const e of ICONSET) {
      expect(e.source).toBe(e.size <= 32 ? 'small' : 'master')
    }
  })
})
