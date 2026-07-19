<template>
  <section
    class="annotamd-document-comments"
    contenteditable="false"
    :aria-label="t('annotamd.comments.documentAriaLabel')"
    @click.stop
    @mousedown.stop
  >
    <header class="annotamd-document-comments-header">
      <h2>{{ t('annotamd.comments.documentTitle') }}</h2>
      <span>{{ t('annotamd.comments.documentSummary', { count: documentComments.length }) }}</span>
    </header>

    <article
      v-for="comment in documentComments"
      :key="comment.id"
      class="annotamd-document-comment"
      :class="{ resolved: comment.resolved }"
    >
      <div class="annotamd-document-comment-top">
        <span>{{ t(comment.resolved ? 'annotamd.comments.resolved' : 'annotamd.comments.documentScope') }}</span>
        <button
          type="button"
          @click="commentStore.toggleResolved(filePath, comment.id)"
        >
          {{ t(comment.resolved ? 'annotamd.comments.restore' : 'annotamd.comments.markResolved') }}
        </button>
      </div>

      <textarea
        v-if="editingId === comment.id"
        v-model="editBody"
        class="annotamd-document-editor"
        rows="3"
      />
      <p v-else>{{ comment.body }}</p>

      <div
        v-if="comment.replies.length"
        class="annotamd-document-replies"
      >
        <p
          v-for="reply in comment.replies"
          :key="reply.id"
        >
          <span
            v-if="reply.author === 'agent'"
            class="annotamd-document-reply-author"
          >{{ t('annotamd.comments.agentAuthor') }}</span>
          {{ reply.body }}
        </p>
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
          v-if="editingId === comment.id"
          type="button"
          :disabled="!editBody.trim()"
          @click="saveEdit(comment.id)"
        >
          {{ t('annotamd.comments.save') }}
        </button>
        <button
          v-else
          type="button"
          @click="startEdit(comment.id, comment.body)"
        >
          {{ t('annotamd.comments.edit') }}
        </button>
        <button
          type="button"
          @click="startReply(comment.id)"
        >
          {{ t('annotamd.comments.reply') }}
        </button>
        <button
          type="button"
          @click="commentStore.deleteComment(filePath, comment.id)"
        >
          {{ t('annotamd.comments.delete') }}
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
        <span>{{ t('annotamd.comments.documentStorageDescription') }}</span>
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

const editorStore = useEditorStore()
const commentStore = useAnnotaMDCommentsStore()
const { t } = useI18n()
const { currentFile } = storeToRefs(editorStore)

const draftBody = ref('')
const editingId = ref<string | null>(null)
const editBody = ref('')
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

const startEdit = (id: string, body: string): void => {
  editingId.value = id
  editBody.value = body
}

const saveEdit = (id: string): void => {
  if (!filePath.value) return
  commentStore.updateComment(filePath.value, id, editBody.value)
  editingId.value = null
  editBody.value = ''
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

.annotamd-document-comments-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.annotamd-document-comments-header h2 {
  margin: 0;
  color: #1f2329;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.35;
}

.annotamd-document-comments-header span {
  color: #8f959e;
  font-size: 12px;
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

.annotamd-document-comment.resolved {
  opacity: 0.68;
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

.annotamd-document-replies {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 12px 12px;
  padding: 8px 10px;
  border-left: 2px solid #dee0e3;
  border-radius: 0 6px 6px 0;
  background: #fafbfc;
}

.annotamd-document-replies p {
  padding: 0;
  font-size: 13px;
}

.annotamd-document-reply-author {
  display: inline-flex;
  margin-right: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #eaf2ff;
  color: #3370ff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}

.annotamd-document-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0;
}

.annotamd-document-comment-top button,
.annotamd-document-actions button,
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
.annotamd-document-actions button:hover {
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
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 0 0 12px 12px;
}

.annotamd-document-composer-footer span {
  min-width: 0;
  color: #8f959e;
  font-size: 12px;
}
</style>
