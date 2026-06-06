/**
 * applyTemplate.ts
 *
 * Pure helper that substitutes template placeholders with runtime values.
 *
 * Currently supports:
 *   {{date}} - replaced with the date formatted as YYYY-MM-DD
 *
 * Called at insertion time (inside the TemplatePicker onSelect handler)
 * so the registry stays free of Date/side-effects.
 */

/**
 * Format a Date as YYYY-MM-DD (ISO date, local time zone).
 * Using manual formatting avoids locale-dependent toLocaleDateString output.
 */
function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Substitute all occurrences of {{date}} in `content` with the formatted
 * date derived from `date`. Returns `content` unchanged when there is no
 * {{date}} token, so the function is safe to call on every template.
 */
export function applyTemplate(content: string, date: Date): string {
  if (!content.includes('{{date}}')) return content
  return content.replaceAll('{{date}}', formatDate(date))
}
