import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  COMMENT_DATA_MARKER,
  COMMENT_REVIEW_GUIDANCE,
  formatCommentReviewResult
} from './commentWorkflow.js'

test('requires intent classification before modifying comment anchors', () => {
  assert.match(COMMENT_REVIEW_GUIDANCE, /读取全部评论不等于授权修改全部关联正文/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /问题、讨论或征询意见.*annotamd_reply_comment/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /明确的修改建议或改写要求.*annotamd_apply_comment_edit/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /先使用 annotamd_reply_comment 追问确认/)
})

test('keeps the returned comment payload intact after the guidance', () => {
  const payload = { revision: 3, comments: [{ id: 'comment-1', body: '这里为什么这样写？' }] }
  const text = formatCommentReviewResult(payload)
  const json = text.slice(text.indexOf(COMMENT_DATA_MARKER) + COMMENT_DATA_MARKER.length).trim()

  assert.deepEqual(JSON.parse(json), payload)
})

test('applies the guidance to every tool that reads comment details', async() => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8')

  for (const method of ['read_document', 'list_comments', 'get_comment']) {
    assert.match(
      source,
      new RegExp(`commentReviewResult\\(await callBridge\\('${method}'`),
      `${method} must return the intent-classification guidance`
    )
  }
})
