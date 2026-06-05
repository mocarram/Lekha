import { describe, it, expect } from 'vitest'
import { IPC } from '@shared/ipc-channels'

describe('toolchain', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })

  it('resolves shared alias', () => {
    expect(IPC.readFile).toBe('fs:readFile')
  })
})
