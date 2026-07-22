import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  COMMENT_DATA_MARKER,
  COMMENT_REVIEW_GUIDANCE,
  findLocalEndingComments,
  formatCommentReviewResult
} from './commentWorkflow.js'

test('requires intent classification before modifying comment anchors', () => {
  assert.match(COMMENT_REVIEW_GUIDANCE, /遍历所有评论线程/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /最后一条消息来自 Local/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /resolved.*updatedAt.*数组顺序.*不能代替/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /读取全部评论不等于授权修改全部关联正文/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /问题、讨论或征询意见.*annotamd_reply_comment/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /明确的修改建议或改写要求.*annotamd_apply_comment_edit/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /先使用 annotamd_reply_comment 追问确认/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /每次写操作后重新读取/)
  assert.match(COMMENT_REVIEW_GUIDANCE, /localEndingCommentCount 为 0/)
})

test('adds every Local-ending thread while keeping the returned comment payload intact', () => {
  const payload = {
    revision: 3,
    comments: [
      {
        id: 'newer-answered',
        quote: '新评论',
        body: '请解释',
        resolved: false,
        createdAt: 400,
        replies: [{ id: 'agent-1', body: '已解释', author: 'agent', createdAt: 500 }]
      },
      {
        id: 'older-root-new-local',
        quote: '旧评论',
        body: '最初问题',
        resolved: false,
        createdAt: 100,
        replies: [
          { id: 'agent-2', body: '最初回答', author: 'agent', createdAt: 200 },
          { id: 'local-2', body: '还有一个问题', author: 'user', createdAt: 600 }
        ]
      },
      {
        id: 'resolved-local',
        quote: '已解决但追问',
        body: '这条也要处理',
        resolved: true,
        createdAt: 300,
        replies: []
      }
    ]
  }
  const text = formatCommentReviewResult(payload)
  const json = text.slice(text.indexOf(COMMENT_DATA_MARKER) + COMMENT_DATA_MARKER.length).trim()
  const parsed = JSON.parse(json)

  assert.equal(parsed.revision, payload.revision)
  assert.deepEqual(parsed.comments, payload.comments)
  assert.equal(parsed.localEndingCommentCount, 2)
  assert.deepEqual(parsed.localEndingComments, [
    {
      commentId: 'older-root-new-local',
      quote: '旧评论',
      latestLocalMessage: '还有一个问题',
      lastMessageAt: 600,
      resolved: false
    },
    {
      commentId: 'resolved-local',
      quote: '已解决但追问',
      latestLocalMessage: '这条也要处理',
      lastMessageAt: 300,
      resolved: true
    }
  ])
})

test('finds Local-ending threads inside get_comment document payloads', () => {
  const payload = {
    comment: { id: 'selected' },
    document: {
      comments: [{
        id: 'root-local',
        body: '根评论也是 Local',
        createdAt: 10,
        resolved: false,
        replies: []
      }]
    }
  }

  assert.deepEqual(findLocalEndingComments(payload), [{
    commentId: 'root-local',
    quote: '',
    latestLocalMessage: '根评论也是 Local',
    lastMessageAt: 10,
    resolved: false
  }])
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
