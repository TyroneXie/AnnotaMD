# AnnotaMD V2 MarkText Migration Plan

AnnotaMD V2 moves the product center from a Swift Markdown reader to a MarkText/Muya-based block editor.

## Direction

- Base the V2 editor experience on MarkText/Muya.
- Preserve AnnotaMD's product identity: local Markdown files, AI-agent-oriented review comments, and clean export.
- Use a three-column layout:
  - Left: outline or folder tree.
  - Center: block/WYSIWYG editor.
  - Right: comments and agent collaboration state.
- Treat block editing as the primary mode. A separate reading mode is not required for the first V2 MVP.
- Redesign the UI in a modern Feishu-like style instead of inheriting MarkText's original chrome.

## Development Loop

- Every visible change should be shown quickly through a dev preview or local app run.
- DMG packaging happens only when explicitly requested.
- Keep V1 Swift implementation available while V2 is iterated.

## MVP Order

1. Build the dependency-free V2 visual shell under `web/v2/`.
2. Replace the center mock editor with the real MarkText/Muya editor runtime.
3. Keep local file open/save behavior.
4. Add selected-text comment creation.
5. Add right-side comment list, comment positioning, and resolution.
6. Store comments in a lightweight `AnnotaMD` Markdown block.
7. Add clean Markdown export that removes AnnotaMD metadata.
8. Add agent-readable comment extraction.

## Current Preview

Open:

```bash
open web/v2/index.html
```

This preview validates the product layout and visual style before the real MarkText runtime is wired in.
