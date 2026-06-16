# Getting started

Welcome to your notebook. **Lekha** is a clean, distraction-free editor that
shows your Markdown the way it will read - no split preview pane, no syntax
noise. Just write, and watch it take shape.

> The best tool is the one that gets out of your way. Type a `#`, a `-`, or a
> `|`, and the document quietly formats itself.

## A quick tour

- Headings, lists, and quotes form as you type
- Tables, task lists, and footnotes are first-class
- Math and diagrams render live, inline with your prose
- Everything is plain `.md` on disk - yours to keep, forever

## This week

- [x] Sketch the outline for the field guide
- [x] Collect reference links and quotes
- [ ] Draft the introduction
- [ ] Review notes from the archive
- [ ] Share the first pass for feedback

## A small example

Code blocks are highlighted and easy to read:

```typescript
function greet(name: string): string {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : 'afternoon'
  return `Good ${part}, ${name}.`
}

console.log(greet('reader'))
```

## At a glance

| Feature         | What it does                          | Shortcut      |
| --------------- | ------------------------------------- | ------------- |
| Quick open      | Find a file in the open folder        | `Cmd+P`       |
| Command palette | Run any command by name               | `Cmd+Shift+P` |
| Focus mode      | Dim everything but the current block  | `F8`          |
| Source view     | Drop to raw Markdown when you want it | `Cmd+Alt+S`   |

---

Open the **Topics** folder in the sidebar to browse the rest of the notebook,
or start a new note with `Cmd+N`.
