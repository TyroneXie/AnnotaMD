---
name: annotamd-comment-review
description: Use when reading, answering, discussing, resolving, or applying feedback from comments, annotations, latest comments, or review notes attached to local Markdown documents. Use the AnnotaMD MCP to access private comment threads even when the user does not name AnnotaMD. Do not trigger for comments explicitly identified as GitHub, Feishu/Lark, Google Docs, or another non-AnnotaMD source unless local AnnotaMD comments are also in scope.
---

# AnnotaMD Comment Review

Use AnnotaMD comments as private context attached to the Markdown document. Do not search a browser or guess comment text when the request concerns comments on a local Markdown file.

## Workflow

1. Call `annotamd_list_inbox` to discover documents with unresolved comments unless the request already provides a `documentId` or `commentId`.
2. Match an explicitly referenced file path first. For an unspecified “current” or “latest” comment, use the most recently updated inbox document, then select its newest unresolved thread.
3. Call `annotamd_read_document` before answering or writing. Read the complete Markdown, current revision, anchors, comments, and replies together.
4. Use `commentId` to distinguish comments on repeated text. Never locate a comment by searching for matching text.
5. Classify every requested comment before acting:
   - Reply with `annotamd_reply_comment` for questions, discussions, requests for an opinion, and ambiguous feedback. Keep these threads unresolved by default.
   - Use `annotamd_apply_comment_edit` only for an explicit edit, rewrite, insertion, deletion, or replacement request. Include a short user-facing summary. A successful edit already records the reply and resolves the comment.
   - Use `annotamd_resolve_comment` only when the user explicitly asks to change resolution state independently of an edit.
6. Pass the revision returned by the latest read as `expectedRevision`. If it is stale, read the document again before retrying.

If AnnotaMD comment access is unavailable, state that the private comments cannot be read. Continue to use normal file access for the Markdown only when that still satisfies the request.

<!-- Managed by AnnotaMD: annotamd-comment-review -->
