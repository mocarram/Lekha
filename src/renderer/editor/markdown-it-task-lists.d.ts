declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'

  interface TaskListsOptions {
    /** Render checkboxes as enabled (clickable) rather than disabled. */
    enabled?: boolean
    /** Wrap the list item label text in a `<label>` element. */
    label?: boolean
    /** Place the label after the checkbox instead of wrapping it. */
    labelAfter?: boolean
  }

  const taskLists: (md: MarkdownIt, options?: TaskListsOptions) => void
  export default taskLists
}
