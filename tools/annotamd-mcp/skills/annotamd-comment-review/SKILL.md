---
name: annotamd-comment-review
description: Use when reading, answering, discussing, resolving, or applying feedback from comments, annotations, latest comments, or review notes attached to local Markdown documents. Use the AnnotaMD MCP to access private comment threads even when the user does not name AnnotaMD. Do not trigger for comments explicitly identified as GitHub, Feishu/Lark, Google Docs, or another non-AnnotaMD source unless local AnnotaMD comments are also in scope.
---

# AnnotaMD Comment Review

Use AnnotaMD comments as private context attached to the Markdown document. Do not search a browser or guess comment text when the request concerns comments on a local Markdown file.

## Workflow

1. Call `annotamd_list_inbox` to discover documents containing Local-ending comment threads unless the request already provides a `documentId` or `commentId`.
2. Match an explicitly referenced file path first. For an unspecified “current” document, use the most recently updated matching inbox document.
3. Call `annotamd_read_document` before answering or writing. Read the complete Markdown, current revision, anchors, **all comment threads**, and all replies together.
4. Process every thread whose final message is from Local (`author: "user"`). Use the returned `localEndingComments` list; do not select only the newest root comment. A root comment with no replies is Local-ending. A thread whose newest reply is from Agent is not pending.
5. Do not infer pending work from `resolved`, the root comment's `updatedAt`, or the order of the `comments` array. Resolved Local-ending threads still require handling; unresolved Agent-ending threads do not.
6. Use `commentId` to distinguish comments on repeated text. Never locate a comment by searching for matching text.
7. Classify every Local-ending comment before acting:
   - Reply with `annotamd_reply_comment` for questions, discussions, requests for an opinion, and ambiguous feedback. Keep these threads unresolved by default.
   - Use `annotamd_apply_comment_edit` only for an explicit edit, rewrite, insertion, deletion, or replacement request. Include a short user-facing summary. A successful edit already records the reply and resolves the comment.
   - Use `annotamd_resolve_comment` only when the user explicitly asks to change resolution state independently of an edit.
8. Process one Local-ending thread at a time. After every write, call `annotamd_read_document` again before choosing the next thread so comments and `expectedRevision` stay current.
9. Before saying that all comments were answered or handled, read the document again and verify that `localEndingCommentCount` is `0`. Never answer a completion-status question from memory.

If AnnotaMD comment access is unavailable, state that the private comments cannot be read. Continue to use normal file access for the Markdown only when that still satisfies the request.

<!-- Managed by AnnotaMD: annotamd-comment-review -->
