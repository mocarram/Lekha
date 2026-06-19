import { describe, it, expect } from 'vitest'
import { changedDirsFromEvents, type WatcherEvent } from '@main/watcherEvents'

describe('changedDirsFromEvents', () => {
  it('maps each event to its parent directory, deduped', () => {
    const events: WatcherEvent[] = [
      { type: 'create', path: '/proj/a.md' },
      { type: 'delete', path: '/proj/b.md' }, // same parent as a.md
      { type: 'create', path: '/proj/sub/c.md' },
    ]
    expect(changedDirsFromEvents(events).sort()).toEqual(['/proj', '/proj/sub'])
  })

  it('drops events under node_modules, .git, and dotfiles/dotdirs', () => {
    const events: WatcherEvent[] = [
      { type: 'create', path: '/proj/node_modules/x/index.js' },
      { type: 'create', path: '/proj/.git/HEAD' },
      { type: 'update', path: '/proj/.hidden.md' },
      { type: 'create', path: '/proj/.cache/data' },
      { type: 'create', path: '/proj/keep.md' },
    ]
    expect(changedDirsFromEvents(events)).toEqual(['/proj'])
  })

  it('returns an empty array for an empty batch', () => {
    expect(changedDirsFromEvents([])).toEqual([])
  })

  it('treats a changed directory entry as a change to its parent', () => {
    expect(changedDirsFromEvents([{ type: 'create', path: '/proj/newdir' }])).toEqual(['/proj'])
  })
})
