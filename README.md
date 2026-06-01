# asana-mcp-extended

An MCP server that fills the gaps the **hosted Asana MCP** (`mcp.asana.com`) leaves open. The
hosted server is closed-source and exposes only a read-heavy + basic create/update subset, so it
cannot upload attachments, manage sections, reorder tasks, update project settings, log time, or
manage members. This server adds those — the write-heavy half of a full project-management cycle.

Built from scratch in TypeScript on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk),
talking directly to the [Asana REST API](https://developers.asana.com/reference). MIT licensed.

> Status: **51 tools** covering the full TZ scope (attachments, sections, projects, time tracking,
> custom fields, templates, recurrence, tags, comments, portfolios, subtasks/dependencies, goals,
> task templates, user/overdue reports). Webhooks are intentionally excluded — see below.

## Tools

### Attachments
| Tool | What it does |
|------|--------------|
| `add_attachment` | Upload a local file (mp4/pdf/png/…) to a task. Returns the attachment gid. |
| `delete_attachment` | Delete an attachment by gid. |

### Sections
| Tool | What it does |
|------|--------------|
| `create_section` | Create a section in a project (optional `insert_before` / `insert_after`). |
| `update_section` | Rename a section. |
| `delete_section` | Delete a section (its tasks return to the project, not deleted). |
| `reorder_section_in_project` | Move a section in the project's display order. |
| `reorder_task_in_section` | Move a task within a section (`insert_before` / `insert_after`). |

### Projects
| Tool | What it does |
|------|--------------|
| `update_project` | Update name, notes/html_notes, color, privacy, default_view, dates, owner, archived. |
| `archive_project` / `unarchive_project` | Convenience wrappers over `update_project`. |
| `add_project_member` / `remove_project_member` | Add/remove member users on a project. |

### Time Tracking (requires Asana Advanced+)
| Tool | What it does |
|------|--------------|
| `add_time_tracking_entry` | Log actual time (`duration_minutes`) on a task → task's native `actual_time_minutes`. |
| `get_time_tracking_entries` | List a task's time entries. |
| `update_time_tracking_entry` | Edit an entry's duration/date. |
| `delete_time_tracking_entry` | Delete an entry. |

> **Time tracking vs. custom time fields.** Actual time is Asana's *native* time-tracking field —
> write it with `add_time_tracking_entry` (populates `task.actual_time_minutes`). The native
> **Actual time** and **Estimated time** columns can NOT be attached to a project via the API
> (Asana limitation — no gid; add them in the project's Customize menu in the UI). Logged
> actual-time values are still stored and appear once that column is added. Some workspaces also
> use plain **number custom fields** for estimates — those you can attach with the tools below and
> set via the standard task `custom_fields` API.

### Custom fields
| Tool | What it does |
|------|--------------|
| `list_workspace_custom_fields` | List a workspace's custom fields (gid/name/type); optional name filter. |
| `add_custom_field_to_project` | Attach an existing custom field (e.g. "Estimated time") to a project. |
| `remove_custom_field_from_project` | Detach a custom field from a project (values/field preserved). |

### Project templates
| Tool | What it does |
|------|--------------|
| `list_project_templates` | List templates (gid/name/team) for a team, or across all your teams. |
| `get_project_template` | Template details incl. any `requested_dates` to supply on instantiate. |
| `create_project_from_template` | Instantiate a new project from a template. |

> **Why templates matter for time tracking.** Since the native Time tracking / Actual time field
> can't be attached to a project via the API, the practical pattern is: enable Time tracking once
> in a project *template* (in the UI), then create new projects from it with
> `create_project_from_template` — the native column carries over. Editing a template's contents
> is UI-only; because a template is a single shared object, edits are immediately used by everyone
> who instantiates from it.

### Recurrence
| Tool | What it does |
|------|--------------|
| `set_task_recurrence` | Make a task repeat: `freq`+`interval` (daily/weekly/monthly/yearly every N) or specific `weekdays`. Needs a due date. |

### Tags
| Tool | What it does |
|------|--------------|
| `create_tag` / `delete_tag` | Create/delete a workspace tag. |
| `add_tag_to_task` / `remove_tag_from_task` | Tag/untag a task. |
| `get_tasks_for_tag` | List tasks with a tag. |

### Comments
| Tool | What it does |
|------|--------------|
| `get_comments` | List a task's comment stories (system stories optional). |
| `update_comment` / `delete_comment` | Edit/delete a comment you authored. |

### Subtasks & dependencies
| Tool | What it does |
|------|--------------|
| `bulk_create_subtasks` | Create many subtasks under a parent in one call. |
| `set_task_dependencies` | Replace a task's dependencies with a given list (empty = clear). |

### Project extras
| Tool | What it does |
|------|--------------|
| `duplicate_project` | Duplicate a project (async job); returns the new project. |
| `add_followers_to_project` | Add follower users to a project. |
| `sort_section_tasks_by_due_date` | Reorder a section's tasks by due date (asc/desc, nulls top/bottom). |

### Custom fields (creation)
| Tool | What it does |
|------|--------------|
| `create_custom_field` | Create a workspace custom field (text/number/enum/multi_enum/date/people). |
| `delete_custom_field` | Delete a workspace custom field (irreversible). |
| `add_enum_option` | Add an option to an enum/multi_enum field. |

### Portfolios
| Tool | What it does |
|------|--------------|
| `create_portfolio` | Create a portfolio. |
| `add_portfolio_item` / `remove_portfolio_item` | Add/remove a project in a portfolio. |

### Task templates
| Tool | What it does |
|------|--------------|
| `list_task_templates` | List a project's task templates. |
| `instantiate_task_template` | Create a task from a task template. |

### Goals
| Tool | What it does |
|------|--------------|
| `list_goals` / `get_goal` | List/read goals. |
| `create_goal` | Create a goal (auto-resolves the current time period if none given). |
| `update_goal` | Update name/notes/owner/status/dates. |
| `add_supporting_relationship` | Link a project/task/portfolio/sub-goal to a goal. |

### Users & reports
| Tool | What it does |
|------|--------------|
| `get_tasks_for_user` | A user's incomplete assigned tasks (`me` or gid). |
| `overdue_tasks_for_user` | A user's past-due incomplete tasks. |

### Not included: webhooks
Webhooks require a public HTTPS endpoint to *receive* event callbacks. A local stdio MCP server
has no such endpoint, so webhook tools would not function in this deployment and are omitted. (If
ever deployed as a hosted HTTP server with a public URL, they could be added.)

## Usage examples

```jsonc
// Attach a video to a task
add_attachment { "task_id": "1201234567890", "file_path": "/Users/me/IMG_4776.MOV" }

// Log 90 minutes of actual time
add_time_tracking_entry { "task_id": "1201234567890", "duration_minutes": 90 }

// Rename + describe a project
update_project { "project_id": "120999", "name": "Hardware", "notes": "Q3 roadmap" }

// Create a section and put it at the top
create_section { "project_id": "120999", "name": "🚀 Магазин сувенірки" }

// Move a task to sit right after another in a section
reorder_task_in_section { "section_id": "S1", "task_id": "T1", "insert_after": "T0" }
```

## Setup

```bash
npm install
npm run build        # → dist/index.js
npm test             # unit tests (mocked Asana API)
```

Create an Asana **Personal Access Token** at <https://app.asana.com/0/my-apps>, then copy
`.env.example` to `.env` and fill it in:

```
ASANA_PERSONAL_ACCESS_TOKEN=...
ASANA_WORKSPACE_GID=1203635502704309
```

## Connecting to Claude / Cowork

Add a custom **stdio** MCP server pointing at the built entrypoint, passing the token via env:

```json
{
  "mcpServers": {
    "asana-extended": {
      "command": "node",
      "args": ["/Users/valentine/Code/asana-mcp-extended/dist/index.js"],
      "env": {
        "ASANA_PERSONAL_ACCESS_TOKEN": "your_token_here",
        "ASANA_WORKSPACE_GID": "1203635502704309"
      }
    }
  }
}
```

In **Cowork**: Settings → Plugins → Add Custom MCP → use the command/args/env above. The new tools
appear under this server's own prefix; the hosted Asana plugin can stay enabled for reads or be
disabled to avoid duplicate tools.

Set `DEBUG=asana-mcp` to log requests to stderr.

## Design notes

- Direct `fetch` to `https://app.asana.com/api/1.0` — no Asana SDK dependency. Request bodies are
  wrapped in `{ data }` and responses unwrapped from `{ data }` automatically.
- Attachments upload as `multipart/form-data` via native `FormData`/`Blob`; the multipart boundary
  is set by the runtime (Content-Type is intentionally not set by hand).
- Errors surface Asana's own `errors[].message` rather than raw HTTP dumps.
- Automatic retry on HTTP 429 with `Retry-After` / exponential backoff.

## License

MIT
