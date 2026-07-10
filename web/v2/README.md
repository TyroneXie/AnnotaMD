# AnnotaMD V2 Preview

This folder is the fast visual iteration surface for AnnotaMD V2.

V2 direction:

- Use MarkText/Muya as the editor foundation.
- Keep AnnotaMD's three-column product layout: left outline/files, center block editor, right comments.
- Redesign the UI in a modern Feishu-like style instead of inheriting MarkText's original chrome.
- Treat block editing as the main mode. A separate reading mode is not part of the first V2 MVP.
- Add comments, comment resolution, agent-readable metadata, and clean Markdown export after the shell is validated.

The current `index.html` is intentionally dependency-free so it can be opened directly during design iteration. Once the layout is approved, the center editor surface will be replaced by the real MarkText/Muya editor runtime.
