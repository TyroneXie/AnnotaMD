<template>
  <section
    class="annotamd-document-comments"
    contenteditable="false"
    :aria-label="t('annotamd.comments.documentAriaLabel')"
    @click.stop
    @mousedown.stop
  >
    <article
      v-for="comment in documentComments"
      :key="comment.id"
      class="annotamd-document-comment"
    >
      <div class="annotamd-document-comment-top">
        <span>{{ t('annotamd.comments.documentScope') }}</span>
        <button
          type="button"
          @click="commentStore.deleteComment(filePath, comment.id)"
        >
          {{ t('annotamd.comments.markResolved') }}
        </button>
      </div>

      <div class="annotamd-document-thread-message annotamd-document-root-message">
        <span class="annotamd-document-message-author">{{ t('annotamd.comments.userAuthor') }}</span>
        <time
          class="annotamd-document-message-time"
          :datetime="new Date(comment.createdAt).toISOString()"
        >{{ formatMessageTime(comment.createdAt) }}</time>
        <textarea
          v-if="editingId === comment.id"
          v-model="editBody"
          class="annotamd-document-editor"
          rows="3"
        />
        <p v-else>{{ comment.body }}</p>
        <div class="annotamd-document-message-actions">
          <template v-if="editingId === comment.id">
            <button
              type="button"
              :disabled="!editBody.trim()"
              @click="saveEdit(comment.id)"
            >
              {{ t('annotamd.comments.save') }}
            </button>
            <button type="button" @click="cancelEdit">
              {{ t('annotamd.comments.cancel') }}
            </button>
          </template>
          <template v-else>
            <button type="button" @click="startCommentEdit(comment.id, comment.body)">
              {{ t('annotamd.comments.edit') }}
            </button>
            <button type="button" @click="commentStore.deleteComment(filePath, comment.id)">
              {{ t('annotamd.comments.delete') }}
            </button>
          </template>
        </div>
      </div>

      <div
        v-if="comment.replies.length"
        class="annotamd-document-replies"
      >
        <article
          v-for="reply in comment.replies"
          :key="reply.id"
          :data-reply-id="reply.id"
          class="annotamd-document-thread-message annotamd-document-reply-message"
          :class="`author-${reply.author}`"
        >
          <span class="annotamd-document-message-author">
            {{ t(reply.author === 'agent'
              ? 'annotamd.comments.agentAuthor'
              : 'annotamd.comments.userAuthor') }}
          </span>
          <time
            class="annotamd-document-message-time"
            :datetime="new Date(reply.createdAt).toISOString()"
          >{{ formatMessageTime(reply.createdAt) }}</time>
          <textarea
            v-if="editingReplyId === reply.id"
            v-model="editReplyBody"
            class="annotamd-document-editor"
            rows="3"
          />
          <p v-else>{{ reply.body }}</p>
          <div
            v-if="reply.author === 'user'"
            class="annotamd-document-message-actions"
          >
            <template v-if="editingReplyId === reply.id">
              <button
                type="button"
                :disabled="!editReplyBody.trim()"
                @click="saveReplyEdit(comment.id, reply.id)"
              >
                {{ t('annotamd.comments.save') }}
              </button>
              <button type="button" @click="cancelReplyEdit">
                {{ t('annotamd.comments.cancel') }}
              </button>
            </template>
            <template v-else>
              <button type="button" @click="startReplyEdit(reply.id, reply.body)">
                {{ t('annotamd.comments.edit') }}
              </button>
              <button type="button" @click="deleteReply(comment.id, reply.id)">
                {{ t('annotamd.comments.delete') }}
              </button>
            </template>
          </div>
        </article>
      </div>

      <div
        v-if="replyingId === comment.id"
        class="annotamd-document-reply-editor"
      >
        <textarea
          v-model="replyBody"
          rows="2"
          :placeholder="t('annotamd.comments.replyPlaceholder')"
        />
        <button
          type="button"
          :disabled="!replyBody.trim()"
          @click="saveReply(comment.id)"
        >
          {{ t('annotamd.comments.reply') }}
        </button>
      </div>

      <div class="annotamd-document-actions">
        <button
          type="button"
          @click="startReply(comment.id)"
        >
          {{ t('annotamd.comments.reply') }}
        </button>
      </div>
    </article>

    <div class="annotamd-document-composer">
      <textarea
        v-model="draftBody"
        rows="4"
        :placeholder="t('annotamd.comments.documentPlaceholder')"
        @keydown.meta.enter.prevent="submitComment"
        @keydown.ctrl.enter.prevent="submitComment"
      />
      <div class="annotamd-document-composer-footer">
        <button
          type="button"
          :disabled="!draftBody.trim()"
          @click="submitComment"
        >
          {{ t('annotamd.comments.send') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'
import { useI18n } from 'vue-i18n'
import { formatCommentTimestamp } from '@/util/annotamdCommentTime'

const editorStore = useEditorStore()
const commentStore = useAnnotaMDCommentsStore()
const { t, locale } = useI18n()

const formatMessageTime = (createdAt: number): string =>
  formatCommentTimestamp(createdAt, locale.value)
const { currentFile } = storeToRefs(editorStore)

const draftBody = ref('')
const editingId = ref<string | null>(null)
const editBody = ref('')
const editingReplyId = ref<string | null>(null)
const editReplyBody = ref('')
const replyingId = ref<string | null>(null)
const replyBody = ref('')

const filePath = computed(() => currentFile.value?.pathname ?? '')
const documentComments = computed(() =>
  commentStore.commentsForFile(filePath.value).filter((comment) => comment.scope === 'document')
)

const submitComment = (): void => {
  if (!filePath.value || !draftBody.value.trim()) return
  commentStore.addDocumentComment(filePath.value, draftBody.value)
  draftBody.value = ''
}

const saveEdit = (id: string): void => {
  if (!filePath.value) return
  commentStore.updateComment(filePath.value, id, editBody.value)
  cancelEdit()
}

const cancelEdit = (): void => {
  editingId.value = null
  editBody.value = ''
}

const startCommentEdit = (commentId: string, body: string): void => {
  cancelEdit()
  cancelReplyEdit()
  editingId.value = commentId
  editBody.value = body
}

const startReplyEdit = (replyId: string, body: string): void => {
  cancelEdit()
  cancelReplyEdit()
  editingReplyId.value = replyId
  editReplyBody.value = body
}

const saveReplyEdit = (commentId: string, replyId: string): void => {
  if (!filePath.value) return
  commentStore.updateReply(filePath.value, commentId, replyId, editReplyBody.value)
  cancelReplyEdit()
}

const cancelReplyEdit = (): void => {
  editingReplyId.value = null
  editReplyBody.value = ''
}

const deleteReply = (commentId: string, replyId: string): void => {
  if (!filePath.value) return
  if (editingReplyId.value === replyId) cancelReplyEdit()
  commentStore.deleteReply(filePath.value, commentId, replyId)
}

const startReply = (id: string): void => {
  replyingId.value = replyingId.value === id ? null : id
  replyBody.value = ''
}

const saveReply = (id: string): void => {
  if (!filePath.value) return
  commentStore.addReply(filePath.value, id, replyBody.value)
  replyingId.value = null
  replyBody.value = ''
}
</script>

<style scoped>
.annotamd-document-comments {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
  margin: 34px 0 0;
  padding: 18px 0 72px;
  border-top: 1px solid #eceff3;
  color: #2f3437;
  font-size: 14px;
  line-height: 1.55;
  user-select: text;
}

.annotamd-document-comment,
.annotamd-document-composer {
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid #dee0e3;
  border-radius: 10px;
  background: #ffffff;
}

.annotamd-document-comment {
  margin-bottom: 12px;
  padding: 12px 14px;
  background: #fbfcfd;
  border-color: #eceff3;
}

.annotamd-document-comment-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 6px;
}

.annotamd-document-comment-top span {
  color: #3370ff;
  font-size: 12px;
  font-weight: 700;
}

.annotamd-document-comment p {
  margin: 0;
  padding: 0 0 8px;
  color: #2f3437;
  font-size: 14px;
  line-height: 1.55;
}

.annotamd-document-thread-message {
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid #dee0e3;
  border-radius: 7px;
  background: #fff;
}

.annotamd-document-root-message {
  margin-bottom: 10px;
}

.annotamd-document-thread-message p {
  padding: 6px 0 7px;
  white-space: pre-wrap;
}

.annotamd-document-thread-message .annotamd-document-editor {
  width: 100%;
  margin: 7px 0;
}

.annotamd-document-message-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  min-height: 26px;
}

.annotamd-document-message-author {
  display: inline-flex;
  padding: 1px 5px;
  border-radius: 4px;
  background: #eaf2ff;
  color: #3370ff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}

.annotamd-document-message-time {
  margin-left: 5px;
  color: #8f959e;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
}

.annotamd-document-replies {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 12px;
}

.annotamd-document-reply-message p {
  font-size: 13px;
}

.annotamd-document-reply-message.author-agent {
  background: #f7f9ff;
}

.annotamd-document-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0;
}

.annotamd-document-comment-top button,
.annotamd-document-actions button,
.annotamd-document-message-actions button,
.annotamd-document-reply-editor button,
.annotamd-document-composer button {
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #3370ff;
  font-size: 12px;
}

.annotamd-document-comment-top button:hover,
.annotamd-document-actions button:hover,
.annotamd-document-message-actions button:hover {
  background: #e8f1ff;
}

.annotamd-document-editor,
.annotamd-document-reply-editor textarea,
.annotamd-document-composer textarea {
  width: calc(100% - 24px);
  box-sizing: border-box;
  margin: 10px 12px;
  padding: 9px 10px;
  resize: vertical;
  border: 1px solid #dee0e3;
  border-radius: 8px;
  outline: none;
  background: #ffffff;
  color: #2f3437;
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
}

.annotamd-document-editor:focus,
.annotamd-document-reply-editor textarea:focus,
.annotamd-document-composer textarea:focus {
  border-color: #3370ff;
  box-shadow: 0 0 0 2px rgba(51, 112, 255, 0.12);
}

.annotamd-document-reply-editor {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}

.annotamd-document-reply-editor button,
.annotamd-document-composer button {
  margin-right: 12px;
  background: #3370ff;
  color: #fff;
}

.annotamd-document-reply-editor button:disabled,
.annotamd-document-composer button:disabled {
  background: #edf1f7;
  color: #a0a6b0;
}

.annotamd-document-composer {
  display: flex;
  flex-direction: column;
  padding-top: 2px;
  border-color: #dee0e3;
  background: #fbfcfd;
  box-shadow: none;
}

.annotamd-document-composer-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 0;
  padding: 0 0 12px 12px;
}
</style>
