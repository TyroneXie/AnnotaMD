---
name: annotamd-comment-review
description: Use when reading, answering, discussing, or applying feedback from comments, annotations, latest comments, or review notes attached to local Markdown documents. Use the AnnotaMD MCP to access private comment threads even when the user does not name AnnotaMD. Do not trigger for comments explicitly identified as GitHub, Feishu/Lark, Google Docs, or another non-AnnotaMD source unless local AnnotaMD comments are also in scope.
---

# AnnotaMD Comment Review

Use AnnotaMD comments as private context attached to a local Markdown document. Never search a browser or guess comment text when the request concerns comments stored by AnnotaMD.

## Workflow

1. Resolve the exact absolute path of the Markdown file in scope. Call `annotamd_list_comments` with that path to obtain the complete lightweight comment index.
2. Treat “latest comments” and equivalent wording as all threads whose final message is from Local, not only the most recently created thread. A root comment with no replies is Local-ending.
3. If the user asks for all comments, read every indexed thread with `annotamd_get_comment`, batching `commentIds` when necessary. Otherwise read every Local-ending thread and any Agent-ending thread needed for context. Do not omit history within a selected thread.
4. Agent-ending threads are normally context rather than pending work, but this is not a prohibition on replying. Continue when the user explicitly asks, when the Agent response is incomplete, or when a substantive follow-up is useful.
5. After reading the relevant threads, decide whether and how much of the Markdown body is needed. Do not require a full-document read before understanding the comments.
6. Classify each relevant thread before acting. Questions, discussions, requests for an opinion, and ambiguous feedback should normally receive an `annotamd_reply_comment`. Clear change requests may be applied to the Markdown with the Agent's available file capabilities.
7. When asked to read or modify the Markdown, use the Agent's available file capabilities rather than inventing AnnotaMD document tools. Use comment anchors and surrounding context to identify the intended passage; do not rely only on searching repeated quote text.
8. Never mark a thread resolved or delete it on the user's behalf. Partial edits to annotated text keep the thread; replacing or deleting the entire annotated selection removes it automatically. The user remains responsible for “已解决” and explicit deletion.
9. After each reply or Markdown change, call `annotamd_list_comments` again before choosing the next action so the index, revision, and Local-ending set remain current.
10. Before claiming completion, confirm that every thread requested by the user was considered and that no relevant Local-ending thread was silently skipped. Agent-ending threads may remain when no further response is useful.

If AnnotaMD comment access is unavailable, say that the private comments cannot be read. Normal Markdown access does not reveal AnnotaMD's private comment threads.

<!-- Managed by AnnotaMD: annotamd-comment-review -->
