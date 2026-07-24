<template>
  <div class="pref-agent">
    <h4>{{ t('preferences.agent.title') }}</h4>

    <compound>
      <template #head>
        <div class="agent-step-head">
          <h6 class="title">{{ t('preferences.agent.commentAccessTitle') }}</h6>
          <el-switch
            :model-value="commentMcpEnabled"
            @change="setMcpEnabled"
          />
        </div>
      </template>
      <template #children>
        <p class="agent-comment-access-description">
          {{ t('preferences.agent.enableComments') }}：{{ t('preferences.agent.enableCommentsDescription') }}
        </p>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.agent.directUseTitle') }}</h6>
      </template>
      <template #children>
        <p class="agent-section-description">
          {{ t('preferences.agent.directUseDescription') }}
        </p>
        <direct-agent-setup />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.agent.appUseTitle') }}</h6>
      </template>
      <template #children>
        <p class="agent-section-description">
          {{ t('preferences.agent.appUseDescription') }}
        </p>
        <mcp-client-setup />
      </template>
    </compound>

    <advanced
      class="agent-usage-advanced"
      :title="t('preferences.agent.usageGuideTitle')"
      :description="t('preferences.agent.usageGuideDescription')"
    >
      <div class="agent-usage-guide">
        <p class="agent-usage-intro">
          {{ t('preferences.agent.usageGuideSummary') }}
        </p>

        <div class="agent-usage-methods">
          <section>
            <strong class="agent-usage-method-title">
              {{ t('preferences.agent.usageDirectTitle') }}
            </strong>
            <p>{{ t('preferences.agent.usageDirectDescription') }}</p>
            <small>{{ t('preferences.agent.usageDirectRequirement') }}</small>

            <div class="agent-prompt-template">
              <div class="agent-prompt-template-head">
                <div>
                  <strong>{{ t('preferences.agent.promptTemplateTitle') }}</strong>
                  <small>{{ t('preferences.agent.promptTemplateDescription') }}</small>
                </div>
                <el-button size="small" @click="resetPromptTemplate">
                  {{ t('preferences.agent.promptTemplateReset') }}
                </el-button>
              </div>
              <el-input
                :model-value="agentPromptTemplate"
                type="textarea"
                :autosize="{ minRows: 7, maxRows: 11 }"
                @update:model-value="savePromptTemplate"
              />
              <div class="agent-prompt-variables">
                <button
                  v-for="variable in AGENT_PROMPT_VARIABLES"
                  :key="variable"
                  type="button"
                  @click="appendPromptVariable(variable)"
                >
                  {{ variable }}
                </button>
              </div>
              <p class="agent-prompt-output-note">
                {{ t('preferences.agent.promptTemplateOutputNote') }}
              </p>
            </div>
          </section>
          <section>
            <strong class="agent-usage-method-title">
              {{ t('preferences.agent.usageAppTitle') }}
            </strong>
            <p>{{ t('preferences.agent.usageAppDescription') }}</p>
            <small>{{ t('preferences.agent.usageAppRequirement') }}</small>

            <div class="agent-usage-app-details">
              <div class="agent-usage-section">
                <strong>{{ t('preferences.agent.usageBehaviorTitle') }}</strong>
                <ul>
                  <li>{{ t('preferences.agent.capabilityDocument') }}</li>
                  <li>{{ t('preferences.agent.capabilityComments') }}</li>
                  <li>{{ t('preferences.agent.capabilityActions') }}</li>
                </ul>
              </div>

              <div class="agent-usage-section">
                <strong>{{ t('preferences.agent.usagePromptTitle') }}</strong>
                <div class="agent-usage-prompts">
                  <span>{{ t('preferences.agent.usagePromptHandle') }}</span>
                  <span>{{ t('preferences.agent.usagePromptReplyOnly') }}</span>
                  <span>{{ t('preferences.agent.usagePromptReviewFirst') }}</span>
                </div>
              </div>

            </div>
          </section>
        </div>
      </div>
    </advanced>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import {
  AGENT_PROMPT_VARIABLES,
  DEFAULT_AGENT_PROMPT_TEMPLATE
} from '@shared/types/agentTurns'
import Advanced from '../common/advanced/index.vue'
import Compound from '../common/compound/index.vue'
import DirectAgentSetup from './DirectAgentSetup.vue'
import McpClientSetup from './McpClientSetup.vue'

const { t } = useI18n()
const preferences = usePreferencesStore()
const { agentPromptTemplate, commentMcpEnabled } = storeToRefs(preferences)

const setMcpEnabled = (value: boolean | string | number): void => {
  preferences.SET_SINGLE_PREFERENCE({ type: 'commentMcpEnabled', value: Boolean(value) })
}

const savePromptTemplate = (value: string): void => {
  preferences.SET_SINGLE_PREFERENCE({ type: 'agentPromptTemplate', value })
}

const resetPromptTemplate = (): void => {
  savePromptTemplate(DEFAULT_AGENT_PROMPT_TEMPLATE)
}

const appendPromptVariable = (variable: string): void => {
  const separator = agentPromptTemplate.value.endsWith('\n') ? '' : '\n'
  savePromptTemplate(`${agentPromptTemplate.value}${separator}${variable}`)
}

</script>

<style scoped>
.pref-agent {
  --agent-body-font-size: 13px;
  --agent-card-title-font-size: 14px;
  --agent-meta-font-size: 12px;
  --agent-text-line-height: 1.4;
}

.pref-agent > h4 {
  font-size: 16px;
  line-height: 1.35;
}

.pref-agent :deep(.pref-compound-item) {
  margin: 10px 0;
}

.pref-agent :deep(.pref-compound-head h6.title) {
  margin-bottom: 4px;
  font-size: 14px;
  line-height: 1.35;
}

.pref-agent :deep(.agent-usage-advanced) {
  overflow: hidden;
  margin: 12px 0 6px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
  background: var(--editorBgColor);
}

.pref-agent :deep(.agent-usage-advanced summary) {
  min-height: 58px;
  padding: 0 13px;
}

.pref-agent :deep(.agent-usage-advanced .pref-advanced-body) {
  padding: 0 13px 13px;
}

.agent-step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-step-head .title {
  margin-bottom: 0 !important;
}

.agent-step-head :deep(.el-switch) {
  --el-switch-on-color: #20a162;
  flex: 0 0 auto;
  height: 20px;
}

.agent-comment-access-description {
  margin: 4px 0 8px;
  color: var(--editorColor);
  font-size: var(--agent-body-font-size);
  line-height: var(--agent-text-line-height);
}

.agent-section-description {
  margin: 4px 0 8px;
  color: var(--editorColor80);
  font-size: var(--agent-body-font-size);
  line-height: var(--agent-text-line-height);
}

.agent-usage-guide {
  margin: 0;
  color: var(--editorColor);
  font-size: var(--agent-body-font-size);
  line-height: 1.45;
}

.agent-usage-intro,
.agent-usage-methods p,
.agent-usage-section {
  margin: 0;
}

.agent-usage-methods {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.agent-usage-methods section {
  padding: 10px 11px;
  border: 1px solid var(--editorColor10);
  border-radius: 7px;
  background: var(--editorBgColor);
}

.agent-usage-methods strong,
.agent-usage-section > strong {
  display: block;
  font-size: var(--agent-card-title-font-size);
  line-height: var(--agent-text-line-height);
}

.agent-usage-methods .agent-usage-method-title {
  margin: -10px -11px 0;
  padding: 8px 11px;
  border-bottom: 1px solid var(--editorColor10);
  border-radius: 7px 7px 0 0;
  background: color-mix(in srgb, var(--editorColor) 5%, var(--editorBgColor));
}

.agent-usage-methods p {
  margin-top: 5px;
  color: var(--editorColor80);
}

.agent-usage-methods small {
  display: block;
  margin-top: 7px;
  color: var(--editorColor60);
  font-size: var(--agent-meta-font-size);
  line-height: var(--agent-text-line-height);
}

.agent-prompt-template {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--editorColor10);
}

.agent-prompt-template-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.agent-prompt-template-head > div > strong,
.agent-prompt-template-head > div > small {
  display: block;
}

.agent-prompt-template-head > div > small,
.agent-prompt-output-note {
  color: var(--editorColor60);
  font-size: var(--agent-meta-font-size);
  line-height: var(--agent-text-line-height);
}

.agent-prompt-output-note {
  margin: 8px 0 0 !important;
}

.agent-prompt-variables {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.agent-prompt-variables button {
  padding: 3px 6px;
  border: 0;
  border-radius: 5px;
  background: color-mix(in srgb, var(--editorColor) 6%, transparent);
  color: var(--editorColor80);
  font: inherit;
  font-size: var(--agent-meta-font-size);
  cursor: pointer;
}

.agent-usage-section {
  margin-top: 13px;
}

.agent-usage-app-details {
  margin-top: 11px;
}

.agent-usage-section ul {
  margin: 7px 0 0;
  padding-left: 19px;
  color: var(--editorColor80);
}

.agent-usage-section li + li {
  margin-top: 3px;
}

.agent-usage-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
}

.agent-usage-prompts span {
  padding: 4px 8px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--editorColor) 5%, transparent);
  color: var(--editorColor80);
}

</style>
