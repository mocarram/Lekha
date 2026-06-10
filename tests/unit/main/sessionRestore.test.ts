// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { claimSessionRestore, _resetSessionRestore } from '@main/sessionRestore'

beforeEach(() => {
  _resetSessionRestore()
})

describe('claimSessionRestore', () => {
  it('grants the claim to the first caller only', () => {
    expect(claimSessionRestore()).toBe(true) // launch window
    expect(claimSessionRestore()).toBe(false) // File > New Window
    expect(claimSessionRestore()).toBe(false) // and every window after
  })
})
