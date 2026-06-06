/**
 * templates/registry.ts
 *
 * Pure, static registry of built-in document templates.
 *
 * Rules:
 *   - No Date(), no side effects - this module is pure.
 *   - Date substitution happens at insertion time via applyTemplate().
 *   - The daily-note template uses the {{date}} placeholder.
 *
 * Template is defined in @shared/types and re-exported here for convenience
 * so renderer code can import both from a single module.
 */
import type { Template } from '@shared/types'

export type { Template }

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Capture attendees, agenda, discussion and action items',
    content: `# Meeting Notes

**Date:** <!-- date -->
**Attendees:** <!-- names -->
**Location / Call:** <!-- Zoom / in-person / etc. -->

---

## Agenda

1.
2.
3.

## Discussion

### Topic 1

_Notes..._

### Topic 2

_Notes..._

## Decisions

-

## Action Items

| Owner | Task | Due |
|-------|------|-----|
|       |      |     |

## Next Meeting

**Date:**
**Agenda preview:**
`,
  },

  {
    id: 'daily-note',
    name: 'Daily Note',
    description: 'A structured daily journal - date is filled in automatically',
    content: `# {{date}}

## Focus for today

- [ ]
- [ ]
- [ ]

## Notes

_Jot down ideas, observations, or anything on your mind..._

## Log

<!-- Add timestamped entries as the day unfolds -->

## Reflection

**What went well?**

**What could be improved?**

**Grateful for:**
`,
  },

  {
    id: 'blog-post',
    name: 'Blog Post',
    description: 'A structured starter for writing blog articles',
    content: `# Post Title

> **Tagline / one-sentence summary**

_Tags: tag1, tag2, tag3_
_Published: <!-- date -->_

---

## Introduction

Hook the reader here. Explain what this post is about and why it matters.

## Background

Provide context or prerequisites the reader needs.

## Main Content

### Section 1

_Write your first main point here._

### Section 2

_Write your second main point here._

### Section 3

_Write your third main point here._

## Conclusion

Summarise the key takeaways and leave the reader with a clear call to action or closing thought.

---

_Have questions or feedback? Reach out at ..._
`,
  },

  {
    id: 'readme',
    name: 'README',
    description: 'A standard project README with all the key sections',
    content: `# Project Name

> Short, punchy description of what this project does.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Overview

Explain the project in 2-3 sentences. Who is it for? What problem does it solve?

## Features

- Feature one
- Feature two
- Feature three

## Getting Started

### Prerequisites

- Node.js >= 18
- <!-- other requirements -->

### Installation

\`\`\`bash
git clone https://github.com/username/project-name.git
cd project-name
npm install
\`\`\`

### Usage

\`\`\`bash
npm start
\`\`\`

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| \`PORT\`  | \`3000\` | HTTP server port |

## Contributing

1. Fork the repository
2. Create a feature branch (\`git checkout -b feat/amazing-feature\`)
3. Commit your changes
4. Open a pull request

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
`,
  },

  {
    id: 'project-plan',
    name: 'Project Plan',
    description: 'Outline goals, milestones, risks and team roles',
    content: `# Project Plan: Project Name

**Owner:** <!-- name -->
**Start date:** <!-- date -->
**Target date:** <!-- date -->
**Status:** Planning | In Progress | Complete

---

## Summary

What are we building, and why?

## Goals

- **Primary goal:**
- **Secondary goal:**
- **Success looks like:**

## Scope

### In scope

-

### Out of scope

-

## Milestones

| Milestone | Description | Target date | Status |
|-----------|-------------|-------------|--------|
| M1 |  |  | Pending |
| M2 |  |  | Pending |
| M3 |  |  | Pending |

## Team

| Name | Role | Responsibilities |
|------|------|-----------------|
|      |      |                 |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
|      | Medium    | High   |            |

## Dependencies

-

## Open Questions

- [ ]
- [ ]

## Notes

_Additional context, links, references..._
`,
  },

  {
    id: 'todo-list',
    name: 'To-Do List',
    description: 'A flexible task list with priority sections',
    content: `# To-Do List

## Today

- [ ]
- [ ]
- [ ]

## This Week

- [ ]
- [ ]
- [ ]

## Backlog

- [ ]
- [ ]

## Completed

- [x]

---

_Last updated: <!-- date -->_
`,
  },
]
