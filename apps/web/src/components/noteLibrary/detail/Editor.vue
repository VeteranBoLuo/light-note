<template>
  <div id="editor-container" class="note-editor" :class="{ 'is-readonly': readonly, 'is-mobile': isMobile }">
    <!-- HTML 模式：TinyMCE -->
    <template v-if="currentType === 'html'">
      <div id="editor-toolbar" class="note-editor-toolbar" v-show="!readonly">
        <EditorToolbarV2
          compact
          :mobile="isMobile"
          :ariaLabel="t('noteDetail.editor.toolbarLabel')"
          v-bind="editorToolbarProps"
          @action="handleEditorToolbarAction"
        />
      </div>
      <EditorFindBar
        v-if="richFindVisible && !readonly"
        ref="richFindInputRef"
        v-model:query="richFindText"
        v-model:replacement="richReplaceText"
        v-model:match-case="richFindMatchCase"
        v-model:whole-word="richFindWholeWord"
        :match-count="richFindCount"
        :status-text="richFindStatusText"
        @next="runRichFind('next')"
        @previous="runRichFind('previous')"
        @replace="replaceRichFindMatch"
        @replace-all="replaceAllRichFindMatches"
        @close="closeRichFind"
      />
      <div v-auto-scrollbar class="note-editor-scroll" @scroll="closeRichMediaTextToolbar">
        <Transition name="note-editor-warmup">
          <NoteDetailLoadingState
            v-if="editorWarmupPhase === 'skeleton'"
            key="rich-editor-skeleton"
            class="note-editor-runtime-skeleton"
            variant="editor"
          />
          <NoteEditorWarmupPreview
            v-else-if="editorWarmupPhase === 'preview' && Boolean(content)"
            key="rich-editor-preview"
            :content="content"
            note-type="html"
            :resource-refs="resourceRefs"
          />
        </Transition>
        <TinyMceEditor
          v-if="editorReady"
          :key="editorKey"
          :model-value="content"
          @update:model-value="handleRichContentUpdate"
          tag-name="div"
          class="note-editor-body note-editor-rich-content"
          :init="editorInit"
          license-key="gpl"
        />
      </div>
    </template>

    <!-- Markdown 模式：textarea + 预览 -->
    <template v-else>
      <div class="md-editor-container">
        <div class="md-editor-toolbar" v-if="!readonly && isMobile">
          <BTabs v-model:active-tab="mdView" class="md-view-toggle" :options="mdViewOptions" variant="line" />
        </div>
        <EditorToolbarV2
          v-if="!readonly && (!isMobile || mdView !== 'preview')"
          compact
          :mobile="isMobile"
          :ariaLabel="t('noteDetail.editor.toolbarLabel')"
          v-bind="editorToolbarProps"
          @action="handleEditorToolbarAction"
        >
          <template v-if="!isMobile" #trailing>
            <div class="md-view-switch" role="group" :aria-label="t('noteDetail.editor.viewMode')">
              <BTooltip v-for="option in desktopMdViewOptions" :key="option.key" :title="option.label">
                <BButton
                  class="md-view-switch__button"
                  :class="{ 'is-active': mdView === option.key }"
                  size="small"
                  :aria-label="option.label"
                  :aria-pressed="mdView === option.key"
                  @click="mdView = option.key"
                >
                  <SvgIcon :src="option.icon" size="17" aria-hidden="true" />
                </BButton>
              </BTooltip>
            </div>
          </template>
        </EditorToolbarV2>
        <EditorFindBar
          v-if="richFindVisible && !readonly"
          ref="richFindInputRef"
          v-model:query="richFindText"
          v-model:replacement="richReplaceText"
          v-model:match-case="richFindMatchCase"
          v-model:whole-word="richFindWholeWord"
          :match-count="richFindCount"
          :status-text="richFindStatusText"
          @next="runRichFind('next')"
          @previous="runRichFind('previous')"
          @replace="replaceRichFindMatch"
          @replace-all="replaceAllRichFindMatches"
          @close="closeRichFind"
        />
        <!-- 工具栏的「插入图片」走这里;正文粘贴图片仍是原来的 onMarkdownPaste 通道 -->
        <BUpload
          ref="markdownImageInputRef"
          accept="image/*"
          multiple
          raw-file
          :max-total-size="null"
          triggerless
          @change="onMarkdownImagePicked"
        />
        <BUpload
          ref="markdownMediaTextImageInputRef"
          accept="image/*"
          :multiple="false"
          raw-file
          :max-total-size="null"
          triggerless
          @change="onMarkdownMediaTextImagePicked"
        />
        <div class="md-editor-body" :class="`md-view-${mdView}`">
          <div class="md-editor-pane" v-show="mdView === 'edit' || mdView === 'split'">
            <Transition name="note-editor-warmup">
              <NoteDetailLoadingState
                v-if="editorWarmupPhase === 'skeleton'"
                key="markdown-editor-skeleton"
                class="note-editor-runtime-skeleton"
                variant="editor"
              />
              <NoteEditorWarmupPreview
                v-else-if="editorWarmupPhase === 'preview' && Boolean(mdContent)"
                key="markdown-editor-preview"
                :content="mdContent"
                note-type="markdown"
              />
            </Transition>
            <MarkdownCodeMirror
              ref="mdCodeMirrorRef"
              :model-value="mdContent"
              class="md-textarea"
              :mobile="isMobile"
              :locale="currentLang"
              @update:model-value="onMdInput"
              @scroll="syncMdScroll('edit')"
              @keydown="onMarkdownEditorKeydown"
              @command="runMarkdownToolbarAction"
              @selection-change="syncMarkdownInlineMenus"
              @history-change="markdownHistoryState = $event"
              @ready="handleMarkdownRuntimeReady"
              @paste="onMarkdownPaste"
              @blur="closeEditorInlineMenus"
              :readonly="readonly"
              :placeholder="$t('note.mdPlaceholder')"
            />
          </div>
          <div class="md-preview-pane" v-show="mdView === 'preview' || mdView === 'split'">
            <div
              ref="mdPreviewRef"
              v-auto-scrollbar
              class="md-preview note-rich-content is-image-preview-enabled"
              @scroll="syncMdScroll('preview')"
              @click="handleMarkdownPreviewClick"
              @keydown="handleMarkdownPreviewClick"
              v-html="renderedMd"
              v-mermaid
            ></div>
          </div>
        </div>
      </div>
    </template>
    <BUpload
      v-if="currentType === 'html'"
      ref="richImageInputRef"
      accept="image/*"
      multiple
      raw-file
      :max-total-size="null"
      triggerless
      @change="onRichImagePicked"
    />
    <BUpload
      v-if="currentType === 'html'"
      ref="richMediaTextImageInputRef"
      accept="image/*"
      :multiple="false"
      raw-file
      :max-total-size="null"
      triggerless
      @change="onRichMediaTextImagePicked"
    />
    <BUpload
      v-if="props.context === 'note'"
      ref="noteFileInputRef"
      :multiple="false"
      raw-file
      :max-total-size="null"
      triggerless
      @change="onNoteFilePicked"
    />
    <BPopover
      v-if="currentType === 'html' && !readonly"
      v-model:open="richMediaTextToolbarVisible"
      class="rich-media-text-anchor"
      :style="richMediaTextAnchorStyle"
      trigger="click"
      placement="top-left"
      overlay-class-name="rich-media-text-popover"
      @open-change="handleRichMediaTextToolbarOpenChange"
    >
      <span aria-hidden="true"></span>
      <template #content>
        <div class="rich-media-text-toolbar" role="toolbar" :aria-label="t('noteDetail.editor.mediaTextSettings')">
          <div class="rich-media-text-toolbar__heading">
            <SvgIcon :src="icon.noteDetail.toolbar.mediaText" size="18" aria-hidden="true" />
            <strong>{{ t('noteDetail.editor.mediaText') }}</strong>
          </div>
          <label class="rich-media-text-toolbar__field">
            <span>{{ t('noteDetail.editor.mediaTextPosition') }}</span>
            <BSelect
              v-model:value="richMediaTextPosition"
              :options="richMediaTextPositionOptions"
              :aria-label="t('noteDetail.editor.mediaTextPosition')"
              @change="applyRichMediaTextPosition"
            />
          </label>
          <label class="rich-media-text-toolbar__field">
            <span>{{ t('noteDetail.editor.mediaTextImageWidth') }}</span>
            <BSelect
              v-model:value="richMediaTextWidth"
              :options="richMediaTextWidthOptions"
              :aria-label="t('noteDetail.editor.mediaTextImageWidth')"
              @change="applyRichMediaTextWidth"
            />
          </label>
          <div class="rich-media-text-toolbar__actions">
            <BButton size="small" @click="previewSelectedRichMediaTextImage">
              <SvgIcon :src="icon.noteDetail.diagramTools.zoom" size="15" aria-hidden="true" />
              {{ t('noteDetail.editor.imagePreview') }}
            </BButton>
            <BButton size="small" :disabled="richMediaTextUploading" @click="replaceRichMediaTextImage">
              <SvgIcon :src="icon.noteDetail.toolbar.image" size="15" aria-hidden="true" />
              {{ t('noteDetail.editor.mediaTextReplaceImage') }}
            </BButton>
            <BButton size="small" :disabled="richMediaTextUploading" @click="addRichMediaTextItem">
              <SvgIcon :src="icon.noteDetail.toolbar.insert" size="15" aria-hidden="true" />
              {{ t('noteDetail.editor.mediaTextAddGroup') }}
            </BButton>
            <BButton size="small" type="danger" @click="deleteRichMediaTextItem">
              <SvgIcon :src="icon.noteDetail.imageToolbar.delete" size="15" aria-hidden="true" />
              {{ t('noteDetail.editor.mediaTextDeleteGroup') }}
            </BButton>
          </div>
        </div>
      </template>
    </BPopover>
    <BPopover
      v-if="!readonly"
      v-model:open="slashCommandVisible"
      class="editor-slash-command-anchor"
      :style="slashCommandAnchorStyle"
      trigger="manual"
      placement="bottom-left"
      overlay-class-name="editor-slash-command-popover"
    >
      <span aria-hidden="true"></span>
      <template #content>
        <EditorSlashCommandMenu
          ref="slashCommandMenuRef"
          :commands="slashCommands"
          :keyword="slashCommandQuery"
          :code-languages="currentType === 'markdown' ? SLASH_CODE_LANGUAGES : []"
          @select="applySlashCommand"
        />
      </template>
    </BPopover>
    <BPopover
      v-if="!isMobile"
      v-model:open="inlineMentionVisible"
      class="resource-mention-inline-anchor"
      :style="inlineMentionAnchorStyle"
      trigger="manual"
      placement="bottom-left"
      :overlay-class-name="
        inlineMentionHasResults ? 'resource-mention-inline-popover' : 'resource-mention-inline-popover is-empty'
      "
    >
      <span aria-hidden="true"></span>
      <template #content>
        <!--
          mousedown.prevent:不让点击把焦点从正文抢走。
          正文一失焦就会触发 focusout → 关掉浮层,click 落到空处 —— 表现就是"鼠标点条目没反应,
          只有回车能选"。按下不移焦点,click 才能正常派发,同时正文光标也还在原位。
        -->
        <ResourcePickerPanel
          ref="inlineMentionSuggestionsRef"
          :allowed-types="['bookmark', 'note', 'file']"
          :show-search="false"
          :keyword="inlineMentionQuery"
          @mousedown.prevent
          @select="insertInlineResourceMention"
          @close="closeInlineMention"
          @results-count="inlineMentionHasResults = $event > 0"
        />
      </template>
    </BPopover>
    <BModal
      v-model:visible="mentionPickerVisible"
      :title="t('note.resourceMention.title')"
      width="460px"
      :show-footer="false"
      @close="closeMentionPicker"
    >
      <ResourcePickerPanel
        class="note-resource-picker-modal"
        :allowed-types="['bookmark', 'note', 'file']"
        @select="handleMentionPickerSelect"
        @close="closeMentionPicker"
      />
    </BModal>
    <NoteFileUploadModal
      v-model:visible="noteFileUploadVisible"
      :file="noteFileUploadFile"
      :saved-file="noteFileUploadSavedFile"
      @uploaded="handleNoteFileUploaded"
      @retry-insert="retryNoteFileInsert"
      @close="resetNoteFileUpload"
    />
    <BModal
      v-model:visible="shortcutHelpVisible"
      :title="t('noteDetail.editor.shortcutsTitle')"
      width="min(560px, calc(100vw - 24px))"
      :show-footer="false"
    >
      <div class="note-shortcuts">
        <div class="note-shortcuts__intro">
          <span class="note-shortcuts__intro-icon" aria-hidden="true">
            <SvgIcon :src="icon.settings.shortcuts" size="22" />
          </span>
          <div>
            <strong>{{ shortcutHelpModeLabel }}</strong>
            <p>{{ t('noteDetail.editor.shortcutsHint') }}</p>
          </div>
        </div>

        <section v-for="section in shortcutHelpSections" :key="section.key" class="note-shortcuts__section">
          <h3>{{ section.title }}</h3>
          <dl class="note-shortcuts__list">
            <div v-for="item in section.items" :key="item.key" class="note-shortcuts__row">
              <dt>
                <span>{{ item.label }}</span>
                <small v-if="item.description">{{ item.description }}</small>
              </dt>
              <dd>
                <template v-for="(keys, index) in item.keys" :key="keys">
                  <span v-if="index" class="note-shortcuts__or">/</span>
                  <kbd>{{ keys }}</kbd>
                </template>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </BModal>
    <BModal
      v-model:visible="richMermaidEditorVisible"
      :title="t('noteDetail.editor.diagramEditTitle')"
      width="min(720px, calc(100vw - 24px))"
      :show-footer="false"
      :mask-closable="false"
      @close="closeRichMermaidEditor"
    >
      <div class="rich-mermaid-editor">
        <p>{{ t('noteDetail.editor.diagramEditHint') }}</p>
        <label for="note-rich-mermaid-source">{{ t('noteDetail.editor.diagramSourceLabel') }}</label>
        <BInput
          id="note-rich-mermaid-source"
          v-model:value="richMermaidSource"
          type="textarea"
          :rows="14"
          :maxlength="50000"
          :placeholder="t('noteDetail.editor.diagramSourcePlaceholder')"
        />
        <div class="rich-mermaid-editor__actions">
          <BButton @click="richMermaidEditorVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" @click="applyRichMermaidSource">{{ t('common.save') }}</BButton>
        </div>
      </div>
    </BModal>
    <BModal
      v-model:visible="richColorDialogVisible"
      :title="
        richColorMode === 'text' ? t('noteDetail.editor.customTextColor') : t('noteDetail.editor.customBackgroundColor')
      "
      width="420px"
      :show-footer="false"
      :mask-closable="false"
      @close="closeRichColorDialog"
    >
      <div class="rich-color-dialog">
        <p>{{ t('noteDetail.editor.colorDialogHint') }}</p>
        <div class="rich-color-dialog__palette" role="list" :aria-label="t('noteDetail.editor.colorPalette')">
          <BButton
            v-for="color in richColorPalette"
            :key="color"
            class="rich-color-dialog__swatch"
            :class="{ 'is-active': richColorValue.toLowerCase() === color.toLowerCase() }"
            :style="{ '--rich-color-swatch': color }"
            :aria-label="color"
            @click="richColorValue = color"
          >
            <span aria-hidden="true"></span>
          </BButton>
        </div>
        <label for="note-rich-custom-color">{{ t('noteDetail.editor.colorHexLabel') }}</label>
        <BInput
          id="note-rich-custom-color"
          v-model:value="richColorValue"
          :placeholder="t('noteDetail.editor.colorHexPlaceholder')"
          :maxlength="9"
          submit-on-enter
          @enter="applyRichCustomColor"
        />
        <div class="rich-color-dialog__actions">
          <BButton @click="removeRichColor">
            {{
              richColorMode === 'text'
                ? t('noteDetail.editor.removeTextColor')
                : t('noteDetail.editor.removeBackgroundColor')
            }}
          </BButton>
          <BButton @click="richColorDialogVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" @click="applyRichCustomColor">{{ t('noteDetail.editor.applyColor') }}</BButton>
        </div>
      </div>
    </BModal>
    <BModal
      v-model:visible="richTextGradientDialogVisible"
      :title="t('noteDetail.editor.gradientText')"
      width="460px"
      :show-footer="false"
      :mask-closable="false"
      @close="closeRichTextGradientDialog"
    >
      <div class="rich-text-gradient-dialog">
        <p>{{ t('noteDetail.editor.gradientTextHint') }}</p>
        <div class="rich-text-gradient-dialog__preview" :aria-label="t('noteDetail.editor.gradientTextPreview')">
          <span class="ln-text-gradient" :style="richTextGradientPreviewStyle">
            {{ t('noteDetail.editor.gradientTextPreview') }}
          </span>
        </div>
        <div>
          <strong class="rich-text-gradient-dialog__palette-title">{{
            t('noteDetail.editor.gradientPresetPalette')
          }}</strong>
          <div
            class="rich-text-gradient-dialog__palette"
            role="list"
            :aria-label="t('noteDetail.editor.gradientPresetPalette')"
          >
            <BButton
              v-for="preset in richTextGradientPresets"
              :key="preset.key"
              class="rich-text-gradient-dialog__preset"
              :class="{
                'is-active':
                  richTextGradientFrom.toLowerCase() === preset.from && richTextGradientTo.toLowerCase() === preset.to,
              }"
              :style="{ '--gradient-preset-from': preset.from, '--gradient-preset-to': preset.to }"
              :aria-label="t(preset.labelKey)"
              @click="applyRichTextGradientPreset(preset)"
            >
              <span aria-hidden="true"></span>
              <small>{{ t(preset.labelKey) }}</small>
            </BButton>
          </div>
        </div>
        <div class="rich-text-gradient-dialog__fields">
          <template v-if="bookmark.isDesktop">
            <label for="note-rich-gradient-from">{{ t('noteDetail.editor.gradientStartColor') }}</label>
            <div class="rich-text-gradient-dialog__color-control">
              <BInput
                id="note-rich-gradient-from"
                v-model:value="richTextGradientFrom"
                :placeholder="t('noteDetail.editor.colorHexPlaceholder')"
                :maxlength="7"
              />
              <BTooltip
                class="rich-text-gradient-dialog__color-picker-tooltip"
                :title="t('noteDetail.editor.gradientStartColorPicker')"
              >
                <BInput
                  id="note-rich-gradient-from-picker"
                  v-model:value="richTextGradientFrom"
                  class="rich-text-gradient-dialog__color-picker"
                  type="color"
                  height="36px"
                />
              </BTooltip>
            </div>
            <label for="note-rich-gradient-to">{{ t('noteDetail.editor.gradientEndColor') }}</label>
            <div class="rich-text-gradient-dialog__color-control">
              <BInput
                id="note-rich-gradient-to"
                v-model:value="richTextGradientTo"
                :placeholder="t('noteDetail.editor.colorHexPlaceholder')"
                :maxlength="7"
              />
              <BTooltip
                class="rich-text-gradient-dialog__color-picker-tooltip"
                :title="t('noteDetail.editor.gradientEndColorPicker')"
              >
                <BInput
                  id="note-rich-gradient-to-picker"
                  v-model:value="richTextGradientTo"
                  class="rich-text-gradient-dialog__color-picker"
                  type="color"
                  height="36px"
                />
              </BTooltip>
            </div>
          </template>
          <label id="note-rich-gradient-direction-label">{{ t('noteDetail.editor.gradientDirection') }}</label>
          <BSelect
            v-model:value="richTextGradientAngle"
            :options="richTextGradientDirectionOptions"
            :aria-label="t('noteDetail.editor.gradientDirection')"
          />
        </div>
        <div class="rich-text-gradient-dialog__actions">
          <BButton :disabled="!richTextGradientEditingExisting" @click="removeRichTextGradient">
            {{ t('noteDetail.editor.removeGradientText') }}
          </BButton>
          <BButton @click="richTextGradientDialogVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" @click="applyRichTextGradient">
            {{ t('noteDetail.editor.applyGradientText') }}
          </BButton>
        </div>
      </div>
    </BModal>
    <BModal
      v-model:visible="conversionPreviewVisible"
      :title="conversionTargetType === 'markdown' ? t('note.switchToMd') : t('note.switchToHtml')"
      :show-footer="false"
      :mask-closable="false"
      width="min(860px, calc(100vw - 24px))"
    >
      <div v-if="conversionReport" class="note-conversion-preview">
        <p class="note-conversion-preview__notice">{{ t('noteDetail.editor.conversion.restorePoint') }}</p>
        <div class="note-conversion-preview__summary">
          <div class="is-preserved">
            <strong>{{ t('noteDetail.editor.conversion.preserved', { count: conversionReport.preserved }) }}</strong>
            <span>{{ t('noteDetail.editor.conversion.preservedHint') }}</span>
          </div>
          <div class="is-standardized">
            <strong>{{
              t('noteDetail.editor.conversion.standardized', { count: conversionReport.standardized })
            }}</strong>
            <span>{{ t('noteDetail.editor.conversion.standardizedHint') }}</span>
          </div>
          <div class="is-risk">
            <strong>{{
              t('noteDetail.editor.conversion.potentialLoss', { count: conversionReport.potentialLoss })
            }}</strong>
            <span>{{ t('noteDetail.editor.conversion.potentialLossHint') }}</span>
          </div>
        </div>
        <div v-if="conversionIssueRows.length" class="note-conversion-preview__issues">
          <div v-for="issue in conversionIssueRows" :key="issue.key">
            <span>{{ issue.label }}</span>
            <strong>{{ issue.count }}</strong>
          </div>
        </div>
        <p v-else class="note-conversion-preview__safe">{{ t('noteDetail.editor.conversion.noKnownLoss') }}</p>
        <section class="note-conversion-preview__content">
          <strong>{{ t('noteDetail.editor.conversion.preview') }}</strong>
          <div
            v-if="conversionTargetType === 'html'"
            class="note-conversion-preview__rendered"
            v-html="conversionConvertedContent"
            v-mermaid
          ></div>
          <pre v-else>{{ conversionConvertedContent }}</pre>
        </section>
        <div class="note-conversion-preview__actions">
          <BButton @click="cancelModeSwitch">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="conversionSaving" @click="confirmModeSwitch">
            {{ t('note.confirmSwitch') }}
          </BButton>
        </div>
      </div>
    </BModal>
    <BModal
      v-model:visible="mobileResourcePreviewVisible"
      :title="t('note.resourceMention.resourceActionsTitle')"
      width="360px"
      :show-footer="false"
      @close="closeMobileResourcePreview"
    >
      <div v-if="mobileResourcePreview" class="resource-mention-mobile-preview">
        <div class="resource-mention-mobile-preview__summary">
          <strong>{{ mobileResourcePreviewTitle }}</strong>
          <span>{{ mobileResourcePreviewType }}</span>
        </div>
        <p
          class="resource-mention-mobile-preview__status"
          :class="{ 'is-unavailable': mobileResourcePreviewState?.available === false }"
        >
          {{ mobileResourcePreviewStatus }}
        </p>
        <div class="resource-mention-mobile-preview__actions">
          <template v-if="mobileResourcePreview.ref.type === 'file'">
            <BButton
              type="primary"
              :loading="inlineFilePreviewLoading"
              :disabled="!mobileResourcePreviewCanOpen"
              @click="openReferencedFileInlinePreview"
            >
              {{ t('note.resourceMention.previewHere') }}
            </BButton>
            <BButton
              :disabled="!mobileResourcePreviewCanOpen || inlineFilePreviewLoading"
              @click="openMobileResourcePreviewTarget"
            >
              {{ t('note.resourceMention.openInCloudSpace') }}
            </BButton>
          </template>
          <BButton
            v-else
            type="primary"
            :disabled="!mobileResourcePreviewCanOpen"
            @click="openMobileResourcePreviewTarget"
          >
            {{ mobileResourcePreviewOpenLabel }}
          </BButton>
        </div>
      </div>
    </BModal>
    <BDrawer
      :open="mobileImageSettingsVisible"
      :title="t('noteDetail.editor.imageSettingsTitle')"
      placement="bottom"
      height="auto"
      body-padding="12px 16px max(18px, env(safe-area-inset-bottom))"
      @close="closeMobileImageSettings"
    >
      <div class="mobile-image-settings">
        <div class="mobile-image-settings__preview">
          <BButton
            v-if="mobileImageSettingsPreview.src"
            class="mobile-image-settings__preview-button"
            :aria-label="t('noteDetail.editor.imagePreview')"
            @click="previewMobileImage"
          >
            <img
              :src="mobileImageSettingsPreview.src"
              :alt="mobileImageSettingsPreview.alt"
              :data-ln-size="mobileImageSettingsSize"
            />
          </BButton>
        </div>
        <p>{{ t('noteDetail.editor.imageSettingsHint') }}</p>
        <div class="mobile-image-settings__options" role="group" :aria-label="t('noteDetail.editor.imageSize')">
          <BButton
            v-for="option in mobileImageSizeOptions"
            :key="option.key"
            class="mobile-image-settings__option"
            :class="[`is-${option.key}`, { 'is-active': mobileImageSettingsSize === option.key }]"
            :aria-label="option.label"
            :aria-pressed="mobileImageSettingsSize === option.key"
            @click="applyMobileImageSize(option.key)"
          >
            <span class="mobile-image-settings__size-mark" aria-hidden="true"></span>
            <span>{{ option.label }}</span>
            <SvgIcon
              v-if="mobileImageSettingsSize === option.key"
              class="mobile-image-settings__check"
              :src="icon.filterPanel.check"
              size="14"
              aria-hidden="true"
            />
          </BButton>
        </div>
      </div>
    </BDrawer>
    <FilePreview
      v-if="inlineFilePreviewInfo"
      v-model:visible="inlineFilePreviewVisible"
      :file-info="inlineFilePreviewInfo"
      @close="closeReferencedFileInlinePreview"
    />
  </div>
</template>

<script setup lang="ts">
  import {
    computed,
    defineAsyncComponent,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
    watchEffect,
    type PropType,
  } from 'vue';
  import { useRouter } from 'vue-router';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import i18n from '@/i18n';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { bookmarkStore } from '@/store';
  import icon from '@/config/icon';
  import {
    getHeadingShortcutLabels,
    getRepeatLastActionShortcutLabels,
    matchEditorInlineFormatShortcut,
    matchHeadingShortcut,
    matchesRepeatLastActionShortcut,
  } from '@/config/keyboardShortcuts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import EditorFindBar, { type EditorFindBarExpose } from './EditorFindBar.vue';
  import EditorToolbarV2, { type EditorToolbarAction } from './EditorToolbarV2.vue';
  import NoteDetailLoadingState from './NoteDetailLoadingState.vue';
  import NoteEditorWarmupPreview from './NoteEditorWarmupPreview.vue';
  import NoteFileUploadModal from './NoteFileUploadModal.vue';
  import { useDelayedEditorWarmup } from './useDelayedEditorWarmup';
  import type { MarkdownCodeMirrorExpose, MarkdownSearchRequest } from './MarkdownCodeMirror.vue';
  import { MERMAID_TEMPLATES, mermaidTemplateMarkdown } from '@/config/mermaidTemplates.ts';
  import {
    MERMAID_EDIT_EVENT,
    inlineCachedMermaid,
    renderMermaidBlocks,
    stripTransientMermaidMarkers,
  } from '@/utils/mermaidRender.ts';
  import {
    applyEditResult,
    buildCodeBlock,
    buildMarkdownTable,
    insertMarkdownLink,
    insertBlock,
    setLinePrefix,
    toggleLinePrefix,
    wrapSelection,
    type EditResult,
    type EditorSelection,
  } from '@/utils/markdownEditing.ts';
  import { configureMarkdownRenderer } from '@/utils/markdownRenderer.ts';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import EditorSlashCommandMenu, { type EditorSlashCommand } from './EditorSlashCommandMenu.vue';
  import { useDismissOnOutside } from '@/composables/useDismissOnOutside';
  import {
    normalizeMarkdownTaskListHtml,
    noteHtmlToMarkdown,
    promoteEmptyMarkdownTaskToken,
  } from '@/utils/noteHtmlToMarkdown';
  import { scrollIntoContainer } from '@/utils/zoom.ts';
  import { getRootZoom } from '@/utils/zoom.ts';
  import {
    applyContentImageSizeToElement,
    decorateRenderedMarkdownImageIndexes,
    MARKDOWN_IMAGE_INDEX_ATTRIBUTE,
    normalizeContentImageSize,
    readContentImageSizeFromElement,
    resizeMarkdownContentImage,
    type ContentImageSize,
  } from '@/utils/contentImageSize.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { resolveMentionQuery } from '@/utils/resourceMentionTrigger';
  import { resolveSlashCommandQuery } from '@/utils/editorSlashCommand';
  import {
    applyResourceReferenceChipPresentation,
    buildResourceAnchorAttrs,
    buildResourceHref,
    collectResourceRefsFromHtml,
    decorateInternalResourceLinks,
    parseResourceHref,
    presentResourceReferenceChips,
    resourceRefKey,
    serializeResourceReferenceSnapshots,
    type ResourceRef,
  } from '@/utils/noteResourceRefs';
  import type { ResolvedResourceReference } from '@/api/noteReferences';
  import { loadMarkdownRuntime, loadTinyMceRuntime, preloadNoteEditorRuntime } from './editorRuntimeLoader';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { openNoteContentImagePreview, prepareNoteContentPreviewImages } from '@/utils/noteImagePreview';
  import { runOrderedBatch } from '@/utils/orderedBatch';
  import {
    buildNoteReturnFocusLocation,
    normalizeReferencedFilePreviewInfo,
    type ReferencedFilePreviewInfo,
  } from '@/utils/noteResourceNavigation';
  import {
    resolveAiSourceNavigation,
    type AiSource,
    type AiSourceTarget,
  } from '@/components/aiAssistant/aiSourceNavigation';
  import {
    analyzeNoteFormatConversion,
    buildNoteFormatConversionAnalysisHash,
    type NoteFormat,
    type NoteFormatConversionReport,
  } from '@/utils/noteFormatConversion';
  import {
    createMarkdownRichMediaTextBlockHtml,
    createRichMediaTextBlockHtml,
    createRichMediaTextItemHtml,
    normalizeRichMediaTextHtml,
    normalizeRichMediaTextPosition,
    normalizeRichMediaTextWidth,
    type RichMediaTextPosition,
    type RichMediaTextWidth,
  } from '@/utils/richMediaText';
  import {
    DEFAULT_TEXT_GRADIENT,
    applyTextGradientConfig,
    createTextGradientHtml,
    normalizeTextGradientConfig,
    readTextGradientConfig,
    type TextGradientAngle,
  } from '@/utils/richTextEffects';
  import type { CloudUploadResult } from '@/api/cloudFileUploadApi';

  // 两套重型编辑引擎按笔记类型分包，Markdown 不再下载 TinyMCE，富文本也不下载 CodeMirror。
  const TinyMceEditor = defineAsyncComponent({
    loader: loadTinyMceRuntime,
    delay: 0,
    suspensible: false,
  });
  const MarkdownCodeMirror = defineAsyncComponent({
    loader: loadMarkdownRuntime,
    delay: 0,
    suspensible: false,
  });
  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));

  const CODE_LANGUAGES = [
    { value: 'plaintext', text: 'Plain Text' },
    { value: 'javascript', text: 'JavaScript' },
    { value: 'typescript', text: 'TypeScript' },
    { value: 'html', text: 'HTML' },
    { value: 'css', text: 'CSS' },
    { value: 'json', text: 'JSON' },
    { value: 'bash', text: 'Bash' },
    { value: 'python', text: 'Python' },
    { value: 'java', text: 'Java' },
    { value: 'go', text: 'Go' },
    { value: 'rust', text: 'Rust' },
    { value: 'cpp', text: 'C++' },
    { value: 'sql', text: 'SQL' },
  ];
  const SLASH_CODE_LANGUAGES = CODE_LANGUAGES.map((language) => ({
    value: language.value,
    label: language.text,
  }));

  const props = defineProps({
    value: {
      type: String,
      default: () => '',
    },
    editable_root: {
      type: Boolean,
      default: true,
    },
    readonly: {
      type: Boolean,
      default: false,
    },
    noteId: {
      type: String,
      default: '',
    },
    // 父组件传入：新建笔记还没 id 时，先确保笔记已创建并返回其 id（守卫式，防重复建）
    ensureNoteId: {
      type: Function,
      default: null,
    },
    imageUploadMode: {
      type: String as () => 'api' | 'base64',
      default: 'api',
    },
    context: {
      type: String as () => 'note' | 'template',
      default: 'note',
    },
    type: {
      type: String as () => 'html' | 'markdown',
      default: 'html',
    },
    revision: {
      type: Number,
      default: 1,
    },
    persistModeConversion: {
      type: Function as PropType<
        (payload: {
          targetType: NoteFormat;
          convertedContent: string;
          baseRevision: number;
          analysisHash: string;
        }) => Promise<{
          content: string;
          type: NoteFormat;
          revision: number;
          updateTime?: number | string | null;
        } | null>
      >,
      default: null,
    },
    // 父级在打开笔记时一次批量解析；Editor 只消费展示状态，不自行按 chip 发请求。
    resourceRefs: {
      type: Array as PropType<ResolvedResourceReference[]>,
      default: () => [],
    },
  });

  void preloadNoteEditorRuntime(props.type).catch(() => {
    // 异步组件挂载时会重试，并交由统一的 chunk 错误链路处理。
  });

  const emits = defineEmits([
    'update:modelValue',
    'setHtml',
    'setNoteId',
    'saveData',
    'ready',
    'update:type',
    'switch-backup-change',
    'mode-converted',
    'markdown-rendered',
    'resource-refs-change',
  ]);
  const content = defineModel<string>('content');
  const editorRef = shallowRef<any>(null);
  const editorReady = ref(false);
  const richEditorRuntimeReady = ref(false);
  const markdownRuntimeReady = ref(false);
  const editorKey = ref(0);
  const richFindVisible = ref(false);
  const richFindText = ref('');
  const richReplaceText = ref('');
  const richFindMatchCase = ref(false);
  const richFindWholeWord = ref(false);
  const richFindCount = ref(0);
  const richFindInputRef = ref<EditorFindBarExpose | null>(null);
  const richFindSignature = ref('');
  let applyingRichFindReplacement = false;
  const richToolbarState = ref({
    canUndo: false,
    canRedo: false,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    todo: false,
    bulletList: false,
    orderedList: false,
    block: 'p',
  });
  const markdownHistoryState = ref({ canUndo: false, canRedo: false });
  type RichColorMode = 'text' | 'background';
  const richColorDialogVisible = ref(false);
  const richColorMode = ref<RichColorMode>('text');
  const richColorValue = ref('#2563eb');
  const richColorPalette = [
    '#111827',
    '#6b7280',
    '#dc2626',
    '#ea580c',
    '#ca8a04',
    '#16a34a',
    '#0891b2',
    '#2563eb',
    '#7c3aed',
    '#db2777',
    '#fef3c7',
    '#dbeafe',
  ] as const;
  let richColorBookmark: unknown = null;
  const richTextGradientDialogVisible = ref(false);
  const richTextGradientFrom = ref(DEFAULT_TEXT_GRADIENT.from);
  const richTextGradientTo = ref(DEFAULT_TEXT_GRADIENT.to);
  const richTextGradientAngle = ref<TextGradientAngle>(DEFAULT_TEXT_GRADIENT.angle as TextGradientAngle);
  const richTextGradientEditingExisting = ref(false);
  const richTextGradientPresets = [
    { key: 'brand', from: '#615ced', to: '#00a884', labelKey: 'noteDetail.editor.gradientPresetBrand' },
    { key: 'ocean', from: '#2563eb', to: '#06b6d4', labelKey: 'noteDetail.editor.gradientPresetOcean' },
    { key: 'sunset', from: '#f97316', to: '#ec4899', labelKey: 'noteDetail.editor.gradientPresetSunset' },
    { key: 'aurora', from: '#7c3aed', to: '#22c55e', labelKey: 'noteDetail.editor.gradientPresetAurora' },
    { key: 'gold', from: '#f59e0b', to: '#ef4444', labelKey: 'noteDetail.editor.gradientPresetGold' },
    { key: 'ink', from: '#111827', to: '#6b7280', labelKey: 'noteDetail.editor.gradientPresetInk' },
  ] as const;
  let richTextGradientBookmark: unknown = null;
  let richTextGradientTarget: HTMLElement | null = null;
  const richMermaidEditorVisible = ref(false);
  const richMermaidSource = ref('');
  let richMermaidSourceElement: HTMLElement | null = null;
  let richMermaidOriginalSource = '';
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const router = useRouter();
  const { t, locale } = useI18n();
  const isMobile = computed(() => bookmark.isMobile);
  const richTextGradientDirectionOptions = computed(() => [
    { value: '90deg', label: t('noteDetail.editor.gradientDirectionHorizontal') },
    { value: '135deg', label: t('noteDetail.editor.gradientDirectionDiagonal') },
    { value: '180deg', label: t('noteDetail.editor.gradientDirectionVertical') },
    { value: '45deg', label: t('noteDetail.editor.gradientDirectionReverseDiagonal') },
  ]);
  const richTextGradientPreviewStyle = computed<Record<string, string>>(() => {
    const config =
      normalizeTextGradientConfig({
        from: richTextGradientFrom.value,
        to: richTextGradientTo.value,
        angle: richTextGradientAngle.value,
      }) || DEFAULT_TEXT_GRADIENT;
    return {
      '--ln-gradient-from': config.from,
      '--ln-gradient-to': config.to,
      '--ln-gradient-angle': config.angle,
    };
  });
  const usesNativeTextSelectionMenu = computed(() => bookmark.isMobile || bookmark.isTouchDevice);
  // 普通游客只能阅读已有引用；管理员进入“游客内容维护”工作区时沿用现有维护权限放行。
  const canEditResourceMentions = computed(
    () => props.context === 'note' && !props.readonly && (user.role !== 'visitor' || user.visitorWorkspace),
  );
  type MarkdownView = 'edit' | 'split' | 'preview';
  // MD 编辑器视图：edit / split / preview
  // 模板编辑优先提供完整写作宽度；仍保留右上角入口按需切换分栏和预览。
  const mdView = ref<MarkdownView>(isMobile.value || props.context === 'template' ? 'edit' : 'split');
  const desktopMdViewOptions = computed<Array<{ key: MarkdownView; label: string; icon: string }>>(() => [
    { key: 'edit', label: t('note.mdEdit'), icon: icon.noteDetail.toolbar.viewEdit },
    { key: 'split', label: t('note.mdEditPreview'), icon: icon.noteDetail.toolbar.viewSplit },
    { key: 'preview', label: t('note.mdPreview'), icon: icon.noteDetail.toolbar.viewPreview },
  ]);
  const mdViewOptions = computed(() => {
    return desktopMdViewOptions.value
      .filter((option) => !isMobile.value || option.key !== 'split')
      .map(({ key, label }) => ({ key, label }));
  });
  watch(isMobile, (mobile) => {
    if (mobile && mdView.value === 'split') mdView.value = 'edit';
    if (!mobile && mobileImageSettingsVisible.value) closeMobileImageSettings();
  });
  let visibilityObserver: IntersectionObserver | null = null;

  const currentType = ref(props.type);
  const switchBackup = ref<{ content: string; type: NoteFormat } | null>(null);
  const conversionPreviewVisible = ref(false);
  const conversionTargetType = ref<NoteFormat>('markdown');
  const conversionBackup = ref<{ content: string; type: NoteFormat } | null>(null);
  const conversionConvertedContent = ref('');
  const conversionReport = ref<NoteFormatConversionReport | null>(null);
  const conversionAnalysisHash = ref('');
  const conversionBaseRevision = ref(1);
  const conversionSaving = ref(false);
  const conversionIssueRows = computed(() =>
    (conversionReport.value?.issues || []).map((issue) => ({
      ...issue,
      label: t(`noteDetail.editor.conversion.issues.${issue.key}`),
    })),
  );

  // 备份状态变化时通知父组件
  watch(
    switchBackup,
    (val) => {
      emits('switch-backup-change', !!val);
    },
    { immediate: true },
  );

  watch(
    () => props.type,
    (val) => {
      if (mobileImageSettingsVisible.value) closeMobileImageSettings();
      closeRichMediaTextToolbar();
      if (currentType.value === 'html' && val !== 'html') prepareRichEditorForUnmount();
      currentType.value = val;
    },
  );

  watch(
    () => props.resourceRefs,
    () => {
      if (currentType.value === 'markdown') {
        void renderMd();
        return;
      }
      window.setTimeout(() => decorateTinyMceResourceRefs(), 0);
    },
    { deep: true },
  );

  watch(
    () => props.noteId,
    () => {
      if (mobileImageSettingsVisible.value) closeMobileImageSettings();
      closeRichMediaTextToolbar();
      // 新建草稿拿到真实 id 后必须重新发布同一批链接，让父级用真实上下文批量解析。
      lastPublishedResourceRefSignature = '';
      if (currentType.value === 'markdown') {
        void renderMd();
        return;
      }
      window.setTimeout(() => {
        const editor = editorRef.value;
        if (!editor) return;
        publishResourceRefs(editor.getContent({ format: 'html' }));
        decorateTinyMceResourceRefs();
      }, 0);
    },
  );

  // Markdown 编辑器状态
  const mdContent = ref('');
  const activeEditorRuntimeReady = computed(() =>
    currentType.value === 'markdown' ? markdownRuntimeReady.value : richEditorRuntimeReady.value,
  );
  const hasActiveEditorContent = computed(() =>
    Boolean(currentType.value === 'markdown' ? mdContent.value : content.value),
  );
  const editorWarmupIdentity = computed(() => `${props.noteId || 'new'}:${currentType.value}`);
  const { phase: editorWarmupPhase } = useDelayedEditorWarmup({
    runtimeReady: activeEditorRuntimeReady,
    hasContent: hasActiveEditorContent,
    identity: editorWarmupIdentity,
  });
  const markdownImageUploading = ref(false);
  const markdownImageInputRef = ref<{ open: () => void } | null>(null);
  const markdownMediaTextImageInputRef = ref<{ open: () => void } | null>(null);
  interface MarkdownMediaTextUploadIntent {
    source: string;
    start: number;
    end: number;
    caption: string;
  }
  const markdownMediaTextUploadIntent = shallowRef<MarkdownMediaTextUploadIntent | null>(null);
  type RichImageUploadIntent = { editor: any; noteId: string; bookmark: any };
  const richImageInputRef = ref<{ open: () => void } | null>(null);
  const richImageUploading = ref(false);
  const richImageUploadIntent = shallowRef<RichImageUploadIntent | null>(null);
  type NoteFileInsertIntent =
    | { kind: 'markdown'; noteId: string; source: string; from: number; to: number }
    | { kind: 'html'; noteId: string; editor: any; bookmark: any };
  const noteFileInputRef = ref<{ open: () => void } | null>(null);
  const noteFileUploadVisible = ref(false);
  const noteFileUploadFile = shallowRef<File | null>(null);
  const noteFileUploadSavedFile = shallowRef<CloudUploadResult | null>(null);
  const noteFileInsertIntent = shallowRef<NoteFileInsertIntent | null>(null);
  type RichMediaTextUploadContext = { editor: any; noteId: string };
  type RichMediaTextUploadIntent =
    | ({ kind: 'insert' } & RichMediaTextUploadContext)
    | ({ kind: 'add'; block: HTMLElement; item: HTMLElement } & RichMediaTextUploadContext)
    | ({ kind: 'replace'; block: HTMLElement; item: HTMLElement } & RichMediaTextUploadContext);
  const richMediaTextImageInputRef = ref<{ open: () => void } | null>(null);
  const richMediaTextUploading = ref(false);
  const richMediaTextUploadIntent = shallowRef<RichMediaTextUploadIntent | null>(null);
  const richMediaTextToolbarVisible = ref(false);
  const richMediaTextAnchorStyle = ref<Record<string, string>>({});
  const richMediaTextBlock = shallowRef<HTMLElement | null>(null);
  const richMediaTextItem = shallowRef<HTMLElement | null>(null);
  const richMediaTextPosition = ref<RichMediaTextPosition>('left');
  const richMediaTextWidth = ref<RichMediaTextWidth>(36);
  const richMediaTextPositionOptions = computed(() => [
    { value: 'left', label: t('noteDetail.editor.mediaTextPositionLeft') },
    { value: 'right', label: t('noteDetail.editor.mediaTextPositionRight') },
  ]);
  const richMediaTextWidthOptions = computed(() =>
    ([30, 36, 42] as RichMediaTextWidth[]).map((value) => ({
      value,
      label: t('noteDetail.editor.mediaTextWidthOption', { width: value }),
    })),
  );
  type MobileImageTarget =
    { kind: 'markdown'; imageIndex: number } | { kind: 'html'; editor: any; element: HTMLImageElement };
  const mobileImageSettingsVisible = ref(false);
  const mobileImageSettingsSize = ref<ContentImageSize>('original');
  const mobileImageSettingsPreview = ref({ src: '', alt: '' });
  const mobileImageTarget = shallowRef<MobileImageTarget | null>(null);
  const mobileImageSizeOptions = computed<Array<{ key: ContentImageSize; label: string }>>(() => [
    { key: 'original', label: t('noteDetail.editor.imageSizes.original') },
    { key: 'small', label: t('noteDetail.editor.imageSizes.small') },
    { key: 'medium', label: t('noteDetail.editor.imageSizes.medium') },
    { key: 'large', label: t('noteDetail.editor.imageSizes.large') },
    { key: 'full', label: t('noteDetail.editor.imageSizes.full') },
  ]);
  let markedLib: any = null;
  let dompurifyLib: any = null;
  const mentionPickerVisible = ref(false);
  const inlineMentionVisible = ref(false);
  const slashCommandVisible = ref(false);
  const slashCommandQuery = ref('');
  const slashCommandAnchorStyle = ref<Record<string, string>>({});
  const slashCommandMenuRef = ref<{
    moveActive: (offset: number) => void;
    chooseActive: () => void;
    handleEscape: () => boolean;
    reset: () => void;
  } | null>(null);
  // 搜不到结果就不弹出;面板仍挂载继续搜,退回能匹配的词时自动重现
  const inlineMentionHasResults = ref(false);
  const inlineMentionQuery = ref('');
  const mobileResourcePreviewVisible = ref(false);
  const mobileResourcePreview = ref<{ ref: ResourceRef; title: string } | null>(null);
  const inlineFilePreviewVisible = ref(false);
  const inlineFilePreviewLoading = ref(false);
  const inlineFilePreviewInfo = ref<ReferencedFilePreviewInfo | null>(null);
  let inlineFilePreviewRequestId = 0;
  const inlineMentionAnchorStyle = ref<Record<string, string>>({});
  const inlineMentionSuggestionsRef = ref<{ moveActive: (offset: number) => void; chooseActive: () => void } | null>(
    null,
  );
  const slashCommands = computed<EditorSlashCommand[]>(() => [
    {
      key: 'paragraph',
      label: t('noteDetail.editor.slash.commands.paragraph.label'),
      description: t('noteDetail.editor.slash.commands.paragraph.description'),
      keywords: ['text', 'paragraph', '正文', '文本'],
      icon: icon.noteDetail.toolbar.heading,
      group: 'basic',
    },
    ...([1, 2, 3] as const).map((level) => ({
      key: `heading${level}`,
      label: t(`noteDetail.editor.slash.commands.heading${level}.label`),
      description: t(`noteDetail.editor.slash.commands.heading${level}.description`),
      keywords: [`h${level}`, `heading ${level}`, `标题${level}`],
      icon: icon.noteDetail.toolbar.heading,
      group: 'basic' as const,
      syntax: '#'.repeat(level),
    })),
    {
      key: 'bulletList',
      label: t('noteDetail.editor.slash.commands.bulletList.label'),
      description: t('noteDetail.editor.slash.commands.bulletList.description'),
      keywords: ['bullet', 'list', '无序', '列表'],
      icon: icon.noteDetail.toolbar.bulletList,
      group: 'list',
      syntax: '-',
    },
    {
      key: 'orderedList',
      label: t('noteDetail.editor.slash.commands.orderedList.label'),
      description: t('noteDetail.editor.slash.commands.orderedList.description'),
      keywords: ['ordered', 'numbered', '有序', '编号'],
      icon: icon.noteDetail.toolbar.orderedList,
      group: 'list',
      syntax: '1.',
    },
    {
      key: 'todo',
      label: t('noteDetail.editor.slash.commands.todo.label'),
      description: t('noteDetail.editor.slash.commands.todo.description'),
      keywords: ['todo', 'task', '待办', '任务'],
      icon: icon.noteDetail.toolbar.todo,
      group: 'list',
      syntax: '- [ ]',
    },
    {
      key: 'quote',
      label: t('noteDetail.editor.slash.commands.quote.label'),
      description: t('noteDetail.editor.slash.commands.quote.description'),
      keywords: ['quote', 'blockquote', '引用'],
      icon: icon.noteDetail.toolbar.quote,
      group: 'block',
      syntax: '>',
    },
    {
      key: 'insertCodeBlock',
      label: t('noteDetail.editor.slash.commands.codeBlock.label'),
      description: t('noteDetail.editor.slash.commands.codeBlock.description'),
      keywords: ['code', 'highlight', '代码', '高亮'],
      icon: icon.noteDetail.toolbar.codeBlock,
      group: 'block',
      syntax: '```',
    },
    {
      key: 'insertDivider',
      label: t('noteDetail.editor.slash.commands.divider.label'),
      description: t('noteDetail.editor.slash.commands.divider.description'),
      keywords: ['divider', 'separator', '分割线'],
      icon: icon.noteDetail.toolbar.divider,
      group: 'insert',
      syntax: '---',
    },
    {
      key: 'insertTable',
      label: t('noteDetail.editor.slash.commands.table.label'),
      description: t('noteDetail.editor.slash.commands.table.description'),
      keywords: ['table', 'grid', '表格'],
      icon: icon.noteDetail.toolbar.table,
      group: 'insert',
      syntax: '|',
    },
  ]);
  let lastPublishedResourceRefSignature = '';

  function resourcePresentationOptions(liveEditor = false) {
    return {
      liveEditor,
      unavailableLabel: (snapshotTitle: string) => t('note.resourceRefUnavailable', { title: snapshotTitle }),
      linkTitle: (title: string, state: 'pending' | 'available' | 'unavailable') => {
        if (state === 'available') return t('note.resourceMention.openResource', { title });
        if (state === 'unavailable') return t('note.resourceMention.resourceUnavailable');
        return t('note.resourceMention.checkingResource');
      },
    };
  }

  function publishResourceRefs(html: string) {
    const refs = collectResourceRefsFromHtml(html).slice(0, 100);
    const signature = `${props.noteId}|${refs.map(resourceRefKey).join('|')}`;
    if (signature === lastPublishedResourceRefSignature) return;
    lastPublishedResourceRefSignature = signature;
    emits('resource-refs-change', refs);
  }

  // 只记录用户显式打开/插入这两个动作，不记录资源名称、URL、正文，也不在自动保存时刷日志。
  function recordResourceMentionOperation(operation: string) {
    void recordOperation({ module: '笔记', operation });
  }

  function decorateTinyMceResourceRefs() {
    const editor = editorRef.value;
    const body = editor?.getBody?.();
    if (!body) return;
    const apply = () =>
      applyResourceReferenceChipPresentation(body, props.resourceRefs, resourcePresentationOptions(true));
    // 展示层替换当前名称不能进入 TinyMCE undo 栈，也不能触发正文保存。
    if (editor.undoManager?.ignore) editor.undoManager.ignore(apply);
    else apply();
    editor.nodeChanged?.();
  }

  function resolvedResourceRef(ref: ResourceRef) {
    return props.resourceRefs.find((item) => item.type === ref.type && item.id === ref.id);
  }

  const mobileResourcePreviewState = computed(() => {
    const preview = mobileResourcePreview.value;
    return preview ? resolvedResourceRef(preview.ref) || null : null;
  });
  const mobileResourcePreviewTitle = computed(() => {
    const preview = mobileResourcePreview.value;
    if (!preview) return '';
    return mobileResourcePreviewState.value?.title || preview.title || preview.ref.id;
  });
  const mobileResourcePreviewType = computed(() => {
    const type = mobileResourcePreview.value?.ref.type;
    return type ? t(`ai.sourceTypes.${type}`) : '';
  });
  const mobileResourcePreviewCanOpen = computed(() => {
    const preview = mobileResourcePreview.value;
    const state = mobileResourcePreviewState.value;
    if (!preview || !state?.available) return false;
    return preview.ref.type !== 'bookmark' || Boolean(state.url);
  });
  const mobileResourcePreviewStatus = computed(() => {
    const preview = mobileResourcePreview.value;
    const state = mobileResourcePreviewState.value;
    if (!preview || !state || (preview.ref.type === 'bookmark' && !state.url)) {
      return t('note.resourceMention.checkingResource');
    }
    return state.available ? t('note.resourceMention.resourceReady') : t('note.resourceMention.resourceUnavailable');
  });
  const mobileResourcePreviewOpenLabel = computed(() => {
    const type = mobileResourcePreview.value?.ref.type;
    if (type === 'bookmark') return t('note.resourceMention.openWebsite');
    if (type === 'file') return t('note.resourceMention.openFile');
    return t('note.resourceMention.openNote');
  });
  async function navigateResourceRef(ref: ResourceRef) {
    const state = resolvedResourceRef(ref);
    if (state && !state.available) {
      message.warning(t('note.resourceMention.resourceUnavailable'));
      return;
    }
    // 书签网址只能来自已完成归属校验的解析结果。解析尚未返回时不降级跳到编辑页，
    // 避免一次点击因竞态违背“打开原站”的引用语义。
    if (ref.type === 'bookmark' && !state?.url) return;
    const source: AiSource = {
      // 刚插入时批量解析尚未返回，也应能立即按 canonical href 打开；真正的数据权限仍由目标页面接口校验。
      type: ref.type,
      id: ref.id,
      title: state?.title || ref.id,
      url: state?.url,
      target: state?.navigation?.target as AiSourceTarget | undefined,
      fileId: state?.navigation?.fileId,
    };
    const navigation = resolveAiSourceNavigation(source);
    if (navigation.kind === 'external') {
      window.open(navigation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (navigation.kind !== 'internal') return;
    const returnFocusLocation = buildNoteReturnFocusLocation(router.currentRoute.value, ref);
    if (returnFocusLocation) await router.replace(returnFocusLocation);
    await router.push(navigation.target);
  }

  function showMobileResourcePreview(ref: ResourceRef, anchor: HTMLAnchorElement | null) {
    mobileResourcePreview.value = {
      ref,
      title: String(anchor?.textContent || '').trim() || ref.id,
    };
    mobileResourcePreviewVisible.value = true;
  }

  function closeMobileResourcePreview() {
    inlineFilePreviewRequestId += 1;
    inlineFilePreviewLoading.value = false;
    mobileResourcePreviewVisible.value = false;
    mobileResourcePreview.value = null;
  }

  async function openMobileResourcePreviewTarget() {
    const preview = mobileResourcePreview.value;
    if (!preview) return;
    if (!mobileResourcePreviewCanOpen.value) {
      message.warning(mobileResourcePreviewStatus.value);
      return;
    }
    await closeCurrentMobileOverlayThen(closeMobileResourcePreview, () => navigateResourceRef(preview.ref));
  }

  async function openReferencedFileInlinePreview() {
    const preview = mobileResourcePreview.value;
    if (!preview || preview.ref.type !== 'file' || inlineFilePreviewLoading.value) return;
    if (!mobileResourcePreviewCanOpen.value) {
      message.warning(mobileResourcePreviewStatus.value);
      return;
    }
    const expectedRefKey = resourceRefKey(preview.ref);
    const requestId = ++inlineFilePreviewRequestId;
    inlineFilePreviewLoading.value = true;
    try {
      const res = await apiBasePost('/api/file/getFileInfo', { id: preview.ref.id }, { silent: true });
      const currentPreview = mobileResourcePreview.value;
      // 请求期间用户可能已关闭弹框或选择了其他引用；旧响应不得重新打开预览。
      if (
        requestId !== inlineFilePreviewRequestId ||
        !mobileResourcePreviewVisible.value ||
        !currentPreview ||
        resourceRefKey(currentPreview.ref) !== expectedRefKey
      ) {
        return;
      }
      const fileInfo =
        res?.status === 200 ? normalizeReferencedFilePreviewInfo(res.data, { id: preview.ref.id }) : null;
      if (!fileInfo) {
        message.warning(t('note.resourceMention.resourceUnavailable'));
        return;
      }
      await closeCurrentMobileOverlayThen(closeMobileResourcePreview, () => {
        inlineFilePreviewInfo.value = fileInfo;
        inlineFilePreviewVisible.value = true;
        recordResourceMentionOperation('在笔记内预览引用文件');
      });
    } catch {
      if (requestId === inlineFilePreviewRequestId) {
        message.warning(t('note.resourceMention.resourceUnavailable'));
      }
    } finally {
      if (requestId === inlineFilePreviewRequestId) {
        inlineFilePreviewLoading.value = false;
      }
    }
  }

  function closeReferencedFileInlinePreview() {
    inlineFilePreviewVisible.value = false;
    inlineFilePreviewInfo.value = null;
  }

  function handleResourceRefClick(ref: ResourceRef, anchor: HTMLAnchorElement | null) {
    // 引用点击先展示资源详情；真正跳转由详情中的显式按钮触发，避免 PC 端误点后直接离开当前笔记。
    showMobileResourcePreview(ref, anchor);
  }

  let lastMobileResourceActivation: { anchor: HTMLAnchorElement; at: number } | null = null;

  function isDuplicateMobileResourceActivation(anchor: HTMLAnchorElement) {
    if (!isMobile.value) return false;
    const now = Date.now();
    if (lastMobileResourceActivation?.anchor === anchor && now - lastMobileResourceActivation.at < 500) return true;
    lastMobileResourceActivation = { anchor, at: now };
    return false;
  }

  function handleTinyMceResourceReferenceActivation(event: Event) {
    const target = event.target;
    const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
    const ref = anchor ? parseResourceHref(anchor.getAttribute('href')) : null;
    if (!ref || !anchor) return false;

    event.preventDefault();
    event.stopPropagation();
    // 移动端一次触摸通常会紧跟一个合成 click；两者只处理一次，避免重复打开资源详情弹窗。
    if (isDuplicateMobileResourceActivation(anchor)) return true;
    handleResourceRefClick(ref, anchor);
    return true;
  }

  function handleRenderedResourceLinkClick(event: Event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    const ref = anchor ? parseResourceHref(anchor.getAttribute('href')) : null;
    if (!ref || !anchor) return;
    event.preventDefault();
    event.stopPropagation();
    if (isDuplicateMobileResourceActivation(anchor)) return;
    handleResourceRefClick(ref, anchor);
  }

  function openMobileImageSettings(target: MobileImageTarget, image: HTMLImageElement) {
    if (!isMobile.value || props.readonly) return;
    mobileImageTarget.value = target;
    mobileImageSettingsSize.value = readContentImageSizeFromElement(image);
    mobileImageSettingsPreview.value = {
      src: image.currentSrc || image.getAttribute('src') || '',
      alt: image.getAttribute('alt') || t('note.mdImageAlt'),
    };
    mobileImageSettingsVisible.value = true;
  }

  function closeMobileImageSettings() {
    mobileImageSettingsVisible.value = false;
    mobileImageTarget.value = null;
  }

  async function previewMobileImage() {
    const src = mobileImageSettingsPreview.value.src;
    if (!src) return;
    await closeCurrentMobileOverlayThen(closeMobileImageSettings, () => openNoteContentImagePreview(src));
  }

  function handleMarkdownPreviewClick(event: Event) {
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    const image = target instanceof Element ? target.closest<HTMLImageElement>('img') : null;
    const rawIndex = image?.getAttribute(MARKDOWN_IMAGE_INDEX_ATTRIBUTE);
    const imageIndex = rawIndex === null || rawIndex === undefined ? Number.NaN : Number(rawIndex);
    if (image && isMobile.value && !props.readonly && Number.isSafeInteger(imageIndex) && imageIndex >= 0) {
      event.preventDefault();
      event.stopPropagation();
      openMobileImageSettings({ kind: 'markdown', imageIndex }, image);
      return;
    }
    if (image && openNoteContentImagePreview(image)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    handleRenderedResourceLinkClick(event);
  }

  function applyMobileImageSize(size: ContentImageSize) {
    const target = mobileImageTarget.value;
    if (!target || props.readonly) return;
    const normalizedSize = normalizeContentImageSize(size);

    if (target.kind === 'markdown') {
      const result = resizeMarkdownContentImage(mdContent.value, target.imageIndex, normalizedSize);
      if (result.start < 0) {
        message.warning(t('noteDetail.editor.imageResizeFailed'));
        closeMobileImageSettings();
        return;
      }
      if (result.changed) {
        const nextCursor = result.start + result.replacement.length;
        if (mdCodeMirrorRef.value) {
          mdCodeMirrorRef.value.replaceRange(result.start, result.end, result.replacement, nextCursor, nextCursor);
        } else {
          onMdInput(result.markdown);
        }
      }
    } else {
      const { editor, element } = target;
      const body = editor?.getBody?.() as HTMLElement | null;
      if (!body || !element.isConnected || !body.contains(element)) {
        message.warning(t('noteDetail.editor.imageResizeFailed'));
        closeMobileImageSettings();
        return;
      }
      editor.undoManager.transact(() => {
        applyContentImageSizeToElement(element, normalizedSize);
        editor.nodeChanged?.();
        editor.setDirty?.(true);
        if (editor.dispatch) editor.dispatch('input');
        else editor.fire?.('input');
      });
    }

    mobileImageSettingsSize.value = normalizedSize;
  }

  // Markdown 编辑器与预览的滚动同步
  const mdCodeMirrorRef = ref<MarkdownCodeMirrorExpose | null>(null);
  const mdPreviewRef = ref<HTMLElement | null>(null);
  let isSyncingMdScroll = false;
  let isProgrammaticMdScroll = false;
  let mdScrollUnlockTimer: number | null = null;

  function scheduleProgrammaticMarkdownScrollUnlock(delay = 180) {
    if (mdScrollUnlockTimer) window.clearTimeout(mdScrollUnlockTimer);
    mdScrollUnlockTimer = window.setTimeout(() => {
      isProgrammaticMdScroll = false;
      mdScrollUnlockTimer = null;
    }, delay);
  }

  function getMarkdownSelection() {
    return mdCodeMirrorRef.value?.getSelection() || { from: mdContent.value.length, to: mdContent.value.length };
  }

  /**
   * TinyMCE searchreplace 在 inline 编辑器中会给当前命中项加上
   * `.mce-match-marker-selected`。它自带的 `selection.scrollIntoView(span)`
   * 在我们的 `.note-editor-scroll` 容器里会误用原来的光标位置，导致“找到了但没跳过去”。
   * 这里统一按当前蓝色命中项滚动，保证查找、上一个、下一个和替换后的下一个命中项都可见。
   */
  function scrollTinyMceFindMatchIntoView() {
    const content = editorRef.value?.getBody?.();
    if (!(content instanceof HTMLElement)) return;

    const selectedMatch = content.querySelector<HTMLElement>('.mce-match-marker-selected');
    const scrollContainer = content.closest<HTMLElement>('.note-editor-scroll');
    if (!selectedMatch || !scrollContainer) return;

    // 让命中项落在编辑区中部偏上的安全位置，查找栏展开后也能保留充足上下文。
    const offset = Math.min(240, Math.max(80, Math.round(scrollContainer.clientHeight * 0.35)));
    scrollIntoContainer(scrollContainer, selectedMatch, offset);
  }

  function scheduleTinyMceFindMatchScroll() {
    // TinyMCE 的按钮处理会在当前事件循环内更新 marker；双帧后再读才能拿到新的当前命中项。
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollTinyMceFindMatchIntoView);
    });
  }

  type RichFindDirection = 'current' | 'next' | 'previous';
  type RichSearchReplaceApi = {
    done: (select?: boolean) => void;
    find: (text: string, matchCase: boolean, wholeWord: boolean, inSelection?: boolean) => number;
    next: () => void;
    prev: () => void;
    replace: (replacement: string, forward: boolean, all: boolean) => boolean;
  };

  const richFindStatusText = computed(() => {
    if (!richFindSignature.value) return '';
    if (richFindCount.value <= 0) return t('noteDetail.editor.noFindResults');
    return t('noteDetail.editor.findResults', { count: richFindCount.value });
  });

  function getRichSearchReplaceApi(editor = editorRef.value): RichSearchReplaceApi | null {
    const api = editor?.plugins?.searchreplace as RichSearchReplaceApi | undefined;
    return api?.find && api?.done ? api : null;
  }

  function currentRichFindSignature() {
    return JSON.stringify({
      text: richFindText.value,
      matchCase: richFindMatchCase.value,
      wholeWord: richFindWholeWord.value,
    });
  }

  function currentMarkdownSearchRequest(): MarkdownSearchRequest {
    return {
      query: richFindText.value,
      replacement: richReplaceText.value,
      matchCase: richFindMatchCase.value,
      wholeWord: richFindWholeWord.value,
    };
  }

  function resetRichFindState() {
    richFindSignature.value = '';
    richFindCount.value = 0;
  }

  function clearRichFindMatches(select = false) {
    getRichSearchReplaceApi()?.done(select);
    mdCodeMirrorRef.value?.clearSearch();
    resetRichFindState();
  }

  function prepareRichEditorForUnmount(editor = editorRef.value) {
    richEditorRuntimeReady.value = false;
    if (!editor) return;
    // TinyMCE 的 remove 事件发生时，selection/searchreplace 已进入销毁流程；
    // 此时再调用 searchreplace.done() 会访问已经脱离 DOM 的 marker.parentNode。
    // 必须在 Vue 切走 HTML 分支前清理，remove 回调只重置无 DOM 副作用的状态。
    if (richFindVisible.value || richFindSignature.value) {
      try {
        getRichSearchReplaceApi(editor)?.done(false);
      } catch {
        // 路由可能正在同步卸载编辑器；销毁阶段不再尝试修复选区 DOM。
      }
    }
    resetRichFindState();
    richFindVisible.value = false;
    if (editorRef.value === editor) editorRef.value = null;
  }

  function openRichFind(editor = editorRef.value) {
    if (props.readonly || (currentType.value === 'html' && !editor)) return;
    if (!richFindVisible.value) {
      const selectedText = String(
        currentType.value === 'markdown'
          ? mdCodeMirrorRef.value?.getSelectedText() || ''
          : editor?.selection?.getContent?.({ format: 'text' }) || '',
      ).trim();
      if (selectedText && selectedText.length <= 200 && !/[\r\n]/u.test(selectedText)) {
        richFindText.value = selectedText;
      }
    }
    richFindVisible.value = true;
    void nextTick(() => richFindInputRef.value?.focusAndSelect());
  }

  function closeRichFind() {
    const editor = editorRef.value;
    clearRichFindMatches();
    richFindVisible.value = false;
    void nextTick(() => {
      if (currentType.value === 'markdown') mdCodeMirrorRef.value?.focus({ preventScroll: true });
      else editor?.focus?.();
    });
  }

  function runRichFind(direction: Exclude<RichFindDirection, 'current'> = 'next') {
    const query = richFindText.value;
    if (!query) {
      clearRichFindMatches();
      return false;
    }

    const signature = currentRichFindSignature();
    if (currentType.value === 'markdown') {
      const api = mdCodeMirrorRef.value;
      if (!api) return false;
      richFindCount.value = api.runSearch(currentMarkdownSearchRequest(), direction);
      richFindSignature.value = signature;
      return richFindCount.value > 0;
    }

    const api = getRichSearchReplaceApi();
    if (!api) return false;
    if (signature !== richFindSignature.value) {
      api.done(false);
      richFindCount.value = api.find(query, richFindMatchCase.value, richFindWholeWord.value, false);
      richFindSignature.value = signature;
      // find() 默认定位第一项；“上一个”首次触发时应从第一项向前循环到最后一项。
      if (richFindCount.value > 0 && direction === 'previous') api.prev();
    } else if (richFindCount.value > 0) {
      if (direction === 'previous') api.prev();
      else api.next();
    }
    scheduleTinyMceFindMatchScroll();
    return richFindCount.value > 0;
  }

  function ensureRichFindMatches() {
    if (richFindSignature.value === currentRichFindSignature() && richFindCount.value > 0) return true;
    const query = richFindText.value;
    if (!query) return false;
    if (currentType.value === 'markdown') {
      const api = mdCodeMirrorRef.value;
      if (!api) return false;
      richFindCount.value = api.runSearch(currentMarkdownSearchRequest(), 'next');
      richFindSignature.value = currentRichFindSignature();
      return richFindCount.value > 0;
    }

    const api = getRichSearchReplaceApi();
    if (!api) return false;
    api.done(false);
    richFindCount.value = api.find(query, richFindMatchCase.value, richFindWholeWord.value, false);
    richFindSignature.value = currentRichFindSignature();
    scheduleTinyMceFindMatchScroll();
    return richFindCount.value > 0;
  }

  function replaceRichFindMatch() {
    if (currentType.value === 'markdown') {
      const api = mdCodeMirrorRef.value;
      if (!api || !ensureRichFindMatches()) return;
      richFindCount.value = api.replaceSearchMatch(currentMarkdownSearchRequest());
      richFindSignature.value = richFindCount.value > 0 ? currentRichFindSignature() : '';
      return;
    }

    const api = getRichSearchReplaceApi();
    if (!api || !ensureRichFindMatches()) return;
    const editor = editorRef.value;
    let hasRemaining = false;
    applyingRichFindReplacement = true;
    try {
      editor.undoManager.transact(() => {
        hasRemaining = api.replace(richReplaceText.value, true, false);
      });
      richFindCount.value = hasRemaining ? Math.max(0, richFindCount.value - 1) : 0;
      editor.nodeChanged?.();
      editor.setDirty?.(true);
      if (editor.dispatch) editor.dispatch('input');
      else editor.fire?.('input');
    } finally {
      applyingRichFindReplacement = false;
    }
    scheduleTinyMceFindMatchScroll();
  }

  function replaceAllRichFindMatches() {
    if (currentType.value === 'markdown') {
      const api = mdCodeMirrorRef.value;
      if (!api || !ensureRichFindMatches()) return;
      api.replaceAllSearchMatches(currentMarkdownSearchRequest());
      richFindCount.value = 0;
      richFindSignature.value = '';
      return;
    }

    const api = getRichSearchReplaceApi();
    if (!api || !ensureRichFindMatches()) return;
    const editor = editorRef.value;
    applyingRichFindReplacement = true;
    try {
      editor.undoManager.transact(() => {
        api.replace(richReplaceText.value, true, true);
      });
      editor.nodeChanged?.();
      editor.setDirty?.(true);
      if (editor.dispatch) editor.dispatch('input');
      else editor.fire?.('input');
    } finally {
      applyingRichFindReplacement = false;
    }
    richFindCount.value = 0;
    richFindSignature.value = '';
  }

  watch([richFindText, richFindMatchCase, richFindWholeWord], () => {
    if (!richFindVisible.value || !richFindSignature.value) return;
    clearRichFindMatches();
  });
  watch(currentType, () => {
    if (!richFindVisible.value) return;
    clearRichFindMatches();
    richFindVisible.value = false;
  });
  watch(
    currentType,
    (type) => {
      // 两种编辑器会在格式切换时重新挂载；不能沿用上一次实例的 ready 状态。
      if (type === 'markdown') markdownRuntimeReady.value = false;
      else richEditorRuntimeReady.value = false;
    },
    { flush: 'sync' },
  );
  watch([currentType, () => props.readonly], () => closeEditorInlineMenus());
  watch(
    () => props.readonly,
    (readonly) => {
      if (!readonly || !richFindVisible.value) return;
      clearRichFindMatches();
      richFindVisible.value = false;
    },
  );

  type MarkdownMentionRange = { start: number; end: number };
  type HtmlMentionSelection = {
    range: Range;
    bookmark: any | null;
    markerId: string | null;
    text: string;
  };
  type InlineSlashRange = { start: number; end: number };
  type HtmlSlashSelection = { range: Range; text: string };
  let markdownMentionRange: MarkdownMentionRange | null = null;
  let markdownSlashRange: InlineSlashRange | null = null;
  let htmlSlashSelection: HtmlSlashSelection | null = null;
  // 弹窗会把焦点从 TinyMCE iframe 移走。临时锚点放在完整 @查询 前面，
  // 让恢复逻辑能重新精确选中待替换文本，而不是仅凭已经可能漂移的 Range/bookmark 猜位置。
  let htmlMentionSelection: HtmlMentionSelection | null = null;
  let htmlMentionMarkerSequence = 0;

  function escapeMarkdownLinkTitle(title: string) {
    return String(title || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/([\\\[\]])/g, '\\$1')
      .trim();
  }

  function escapeHtmlText(value: string) {
    return String(value || '').replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char,
    );
  }

  function rangeBelongsToTinyMce(editor: any, range: Range | null | undefined) {
    const body = editor?.getBody?.() as HTMLElement | null;
    return Boolean(body && range && body.contains(range.startContainer) && body.contains(range.endContainer));
  }

  function stripTransientMentionMarkers(html: string) {
    if (!html.includes('data-ln-resource-mention-marker')) return html;
    if (typeof DOMParser === 'undefined') {
      return html.replace(/<span\b[^>]*\bdata-ln-resource-mention-marker=["'][^"']*["'][^>]*><\/span>/giu, '');
    }
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    doc.body.querySelectorAll('[data-ln-resource-mention-marker]').forEach((marker) => marker.remove());
    return doc.body.innerHTML;
  }

  function findTinyMceMentionMarker(editor: any, markerId: string | null) {
    const body = editor?.getBody?.() as HTMLElement | null;
    if (!body || !markerId) return null;
    const markers = body.querySelectorAll<HTMLElement>('[data-ln-resource-mention-marker]');
    return (
      Array.from(markers).find((marker) => marker.getAttribute('data-ln-resource-mention-marker') === markerId) || null
    );
  }

  function isValidTinyMceMentionText(text: string) {
    return text.startsWith('@') && !/[\s@]/u.test(text.slice(1));
  }

  function getTinyMceMentionRangeFromMarker(editor: any, markerId: string | null, expectedText = '@') {
    const marker = findTinyMceMentionMarker(editor, markerId);
    const triggerNode = marker?.nextSibling;
    if (
      !marker ||
      triggerNode?.nodeType !== Node.TEXT_NODE ||
      !String(triggerNode.textContent || '').startsWith(expectedText)
    ) {
      return null;
    }
    try {
      const range = editor.dom.createRng();
      range.setStartAfter(marker);
      range.setEnd(triggerNode, expectedText.length);
      return range;
    } catch {
      return null;
    }
  }

  function selectionIsExactTinyMceMention(editor: any, range: Range | null | undefined, expectedText = '@') {
    return Boolean(
      isValidTinyMceMentionText(expectedText) &&
      rangeBelongsToTinyMce(editor, range) &&
      range?.toString() === expectedText,
    );
  }

  function clearTinyMceMentionSelection(editor = editorRef.value) {
    const marker = findTinyMceMentionMarker(editor, htmlMentionSelection?.markerId || null);
    marker?.remove();
    htmlMentionSelection = null;
  }

  function captureTinyMceMentionSelection(editor: any, replacementRange: Range): HtmlMentionSelection {
    let bookmark: any | null = null;
    let markerId: string | null = null;
    let selectionRange = replacementRange;
    const text = replacementRange.toString();
    try {
      const markerRange = replacementRange.cloneRange();
      markerRange.collapse(true);
      const marker = editor.getDoc?.().createElement('span') as HTMLElement | undefined;
      if (marker) {
        markerId = `ln-resource-mention-${Date.now()}-${++htmlMentionMarkerSequence}`;
        marker.setAttribute('data-ln-resource-mention-marker', markerId);
        marker.setAttribute('data-mce-bogus', 'all');
        marker.setAttribute('contenteditable', 'false');
        marker.setAttribute('aria-hidden', 'true');
        marker.style.display = 'none';
        markerRange.insertNode(marker);
        selectionRange = getTinyMceMentionRangeFromMarker(editor, markerId, text) || replacementRange;
      }
      // bookmark 必须记录完整“@查询”被选中的区间，而不是输入后的折叠光标；否则恢复后会留下触发文本。
      editor.selection.setRng(selectionRange);
      bookmark = editor.selection.getBookmark?.(2, true) ?? null;
    } catch {
      // 极少数 TinyMCE 版本不支持 path bookmark 时，下面的 Range 仍可作为同一轮会话的兜底。
      bookmark = null;
    }
    return { range: selectionRange, bookmark, markerId, text };
  }

  function restoreTinyMceMentionSelection(editor: any) {
    const selection = htmlMentionSelection;
    if (!selection) return false;

    const markerRange = getTinyMceMentionRangeFromMarker(editor, selection.markerId, selection.text);
    if (selectionIsExactTinyMceMention(editor, markerRange, selection.text)) {
      try {
        editor.selection.setRng(markerRange);
        return true;
      } catch {
        // 临时标记仍可能被 TinyMCE 的外部 setContent 清掉，继续走 bookmark/Range 兜底。
      }
    }

    if (selection.bookmark) {
      try {
        editor.selection.moveToBookmark(selection.bookmark);
        if (selectionIsExactTinyMceMention(editor, editor.selection.getRng?.(), selection.text)) return true;
      } catch {
        // bookmark 可能因编辑器被外部重置而失效，继续尝试本轮保存的原始 Range。
      }
    }

    if (!selectionIsExactTinyMceMention(editor, selection.range, selection.text)) return false;
    try {
      editor.selection.setRng(selection.range);
      return true;
    } catch {
      return false;
    }
  }

  function moveTinyMceCaretAfterResourceMention(editor: any, item: ResourceRef) {
    const body = editor.getBody?.() as HTMLElement | null;
    if (!body) return;
    const anchor = Array.from(body.querySelectorAll<HTMLAnchorElement>('a[data-ln-resource-type][data-ln-resource-id]'))
      .reverse()
      .find(
        (element) =>
          element.getAttribute('data-ln-resource-type') === item.type &&
          element.getAttribute('data-ln-resource-id') === item.id,
      );
    if (!anchor) return;
    try {
      const range = editor.dom.createRng();
      range.setStartAfter(anchor);
      range.collapse(true);
      editor.selection.setRng(range);
    } catch {
      // 插入本身已成功；极少数浏览器无法定位光标时，不让这一步影响正文保存。
    }
  }

  function setInlineMentionAnchor(rect: Pick<DOMRect, 'top' | 'left' | 'height'>) {
    const zoom = getRootZoom();
    // 锚点比光标行高多留 6px:浮层贴着光标展开会压住正在写的那一行,看不见自己刚打的字
    const anchorHeight = (Math.max(rect.height, 18) + 6) / zoom;
    inlineMentionAnchorStyle.value = {
      position: 'fixed',
      left: `${rect.left / zoom}px`,
      top: `${rect.top / zoom}px`,
      width: '1px',
      height: `${anchorHeight}px`,
      pointerEvents: 'none',
    };
  }

  function setSlashCommandAnchor(rect: Pick<DOMRect, 'top' | 'left' | 'height'>) {
    const zoom = getRootZoom();
    slashCommandAnchorStyle.value = {
      position: 'fixed',
      left: `${rect.left / zoom}px`,
      top: `${rect.top / zoom}px`,
      width: '1px',
      height: `${(Math.max(rect.height, 18) + 6) / zoom}px`,
      pointerEvents: 'none',
    };
  }

  let dismissedSlashSignature = '';

  function closeSlashCommand(options?: { dismissed?: boolean }) {
    if (options?.dismissed && markdownSlashRange) {
      dismissedSlashSignature = `${markdownSlashRange.start}:${markdownSlashRange.end}`;
    }
    slashCommandVisible.value = false;
    slashCommandQuery.value = '';
    markdownSlashRange = null;
    htmlSlashSelection = null;
    slashCommandMenuRef.value?.reset();
  }

  function closeEditorInlineMenus() {
    closeInlineMention();
    closeSlashCommand();
  }

  function syncOrOpenMarkdownSlashCommand() {
    if (props.readonly || currentType.value !== 'markdown' || mdView.value === 'preview') return false;
    const markdownEditor = mdCodeMirrorRef.value;
    if (!markdownEditor) return false;
    const selection = markdownEditor.getSelection();
    if (selection.from !== selection.to) {
      closeSlashCommand();
      return false;
    }
    const query = resolveSlashCommandQuery(markdownEditor.getValue(), selection.to);
    if (!query) {
      dismissedSlashSignature = '';
      closeSlashCommand();
      return false;
    }
    const signature = `${query.start}:${query.end}`;
    if (dismissedSlashSignature === signature) return false;
    dismissedSlashSignature = '';
    markdownSlashRange = { start: query.start, end: query.end };
    slashCommandQuery.value = query.keyword;
    const anchorRect = markdownEditor.coordsAtPos(query.start);
    if (anchorRect) setSlashCommandAnchor(anchorRect);
    if (inlineMentionVisible.value) closeInlineMention();
    slashCommandVisible.value = true;
    return true;
  }

  function syncMarkdownInlineMenus() {
    if (syncOrOpenMarkdownSlashCommand()) return;
    syncOrOpenMarkdownMention();
  }

  function getTinyMceSlashContext(editor: any) {
    const range = editor.selection?.getRng?.() as Range | null;
    if (!range?.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    if (editor.dom?.getParent?.(range.startContainer, 'pre,code,a')) return null;
    const block = editor.dom?.getParent?.(range.startContainer, 'p,div,li,blockquote') as HTMLElement | null;
    if (!block) return null;
    try {
      const before = editor.dom.createRng();
      before.selectNodeContents(block);
      before.setEnd(range.startContainer, range.startOffset);
      const textBefore = before.toString();
      const query = resolveSlashCommandQuery(textBefore, textBefore.length);
      if (!query) return null;
      const replacementLength = textBefore.length - query.start;
      // 跨格式节点时无法安全构造单一文本 Range，保守放弃，避免误删相邻内容。
      if (replacementLength < 1 || range.startOffset < replacementLength) return null;
      const replacementRange = range.cloneRange();
      replacementRange.setStart(range.startContainer, range.startOffset - replacementLength);
      return { query, replacementRange };
    } catch {
      return null;
    }
  }

  function syncTinyMceSlashCommand(editor: any) {
    if (props.readonly || currentType.value !== 'html') return closeSlashCommand();
    const context = getTinyMceSlashContext(editor);
    if (!context) return closeSlashCommand();
    htmlSlashSelection = { range: context.replacementRange, text: context.replacementRange.toString() };
    slashCommandQuery.value = context.query.keyword;
    const anchorRange = context.replacementRange.cloneRange();
    anchorRange.collapse(true);
    const rect = anchorRange.getBoundingClientRect();
    setSlashCommandAnchor({ left: rect.left, top: rect.top, height: rect.height || 20 });
    if (inlineMentionVisible.value) closeInlineMention();
    slashCommandVisible.value = true;
  }

  function markdownSlashReplacement(command: EditorSlashCommand) {
    if (command.key === 'paragraph') return { text: '', caretOffset: 0 };
    if (/^heading[1-3]$/u.test(command.key)) {
      const prefix = `${'#'.repeat(Number(command.key.slice(-1)))} `;
      return { text: prefix, caretOffset: prefix.length };
    }
    const prefixes: Record<string, string> = {
      bulletList: '- ',
      orderedList: '1. ',
      todo: '- [ ] ',
      quote: '> ',
    };
    if (prefixes[command.key]) return { text: prefixes[command.key], caretOffset: prefixes[command.key].length };
    if (command.key === 'insertCodeBlock') {
      const text = `${buildCodeBlock(command.language || 'plaintext')}\n`;
      return { text, caretOffset: text.indexOf('\n') + 1 };
    }
    if (command.key === 'insertDivider') return { text: '---\n', caretOffset: 4 };
    if (command.key === 'insertTable') {
      const text = `${buildMarkdownTable([
        t('note.mdTableColumn', { index: 1 }),
        t('note.mdTableColumn', { index: 2 }),
      ])}\n`;
      return { text, caretOffset: text.length };
    }
    return null;
  }

  function applyMarkdownSlashCommand(command: EditorSlashCommand) {
    const editor = mdCodeMirrorRef.value;
    const range = markdownSlashRange;
    const replacement = markdownSlashReplacement(command);
    if (!editor || !range || !replacement) return;
    const caret = range.start + replacement.caretOffset;
    editor.replaceRange(range.start, range.end, replacement.text, caret, caret);
    closeSlashCommand();
  }

  function applyRichSlashCommand(command: EditorSlashCommand) {
    const editor = editorRef.value;
    const selection = htmlSlashSelection;
    if (!editor || !selection || !rangeBelongsToTinyMce(editor, selection.range)) return closeSlashCommand();
    editor.focus();
    try {
      editor.selection.setRng(selection.range);
      editor.undoManager.transact(() => editor.selection.setContent(''));
    } catch {
      closeSlashCommand();
      return;
    }
    closeSlashCommand();
    if (command.key === 'insertCodeBlock') return editor.execCommand('codesample');
    if (command.key === 'insertTable') return editor.execCommand('mceInsertTableDialog');
    if (command.key === 'insertDivider') return editor.insertContent('<hr><p></p>');
    runRichToolbarAction(command.key, { remember: false });
  }

  function applySlashCommand(command: EditorSlashCommand) {
    if (currentType.value === 'markdown') applyMarkdownSlashCommand(command);
    else applyRichSlashCommand(command);
  }

  /*
   * 用户主动关掉浮层(Esc / 点外面)后,这个 @ 的位置要记下来。
   * 否则 CodeMirror 里的 @ 还在,下一次选区更新又会把它当成「正在提及」重新弹出来 ——
   * 表现就是按了 Esc 浮层立刻又冒出来,关不掉。
   * 只抑制同一个 @ 位置;继续打字或换个地方再敲 @,位置变了自然恢复。
   */
  let dismissedMentionStart: number | null = null;

  function closeInlineMention(options?: { dismissed?: boolean }) {
    if (options?.dismissed) dismissedMentionStart = markdownMentionRange?.start ?? null;
    if (!inlineMentionVisible.value) return;
    inlineMentionVisible.value = false;
    inlineMentionHasResults.value = false;
  }

  // 与 AI 输入区、待办说明共用同一套关闭规则;笔记浮层 teleport 到 body,按选择器判定内部
  useDismissOnOutside({
    isActive: () => inlineMentionVisible.value,
    // 富文本用的是 TinyMCE inline 模式,编辑区是 .mce-content-body 而非 iframe 的 .tox-edit-area;
    // 漏掉它会导致在正文里打字/点击被判成「点击外部」,浮层被关掉后就再也回不来
    ignoreSelectors: [
      '.resource-mention-inline-popover',
      '.md-textarea',
      '.note-editor-body',
      '.mce-content-body',
      '.tox-edit-area',
    ],
    onDismiss: () => closeInlineMention({ dismissed: true }),
  });

  useDismissOnOutside({
    isActive: () => slashCommandVisible.value,
    ignoreSelectors: [
      '.editor-slash-command-popover',
      '.md-textarea',
      '.note-editor-body',
      '.mce-content-body',
      '.tox-edit-area',
    ],
    onDismiss: () => closeSlashCommand({ dismissed: true }),
  });

  function closeMentionPicker() {
    mentionPickerVisible.value = false;
    markdownMentionRange = null;
    clearTinyMceMentionSelection();
  }

  /**
   * 只要光标处在 `@关键词` 上下文里就打开或更新浮层。
   * 原实现只认「刚敲下 @」,浮层一旦收起(例如中途搜不到结果),
   * 必须把字删到只剩 @ 才能重新唤起;改用通用解析后,退回到能匹配的词即可重现。
   */
  function syncOrOpenMarkdownMention() {
    if (
      !canEditResourceMentions.value ||
      mentionPickerVisible.value ||
      slashCommandVisible.value ||
      currentType.value !== 'markdown'
    )
      return;
    const markdownEditor = mdCodeMirrorRef.value;
    if (!markdownEditor) return;
    const selection = markdownEditor.getSelection();
    const query = resolveMentionQuery(markdownEditor.getValue(), selection.to);
    if (!query) {
      dismissedMentionStart = null;
      return closeInlineMention();
    }
    // 这个 @ 刚被用户关掉过就别再自动弹;换个位置或继续输入让起点变了才恢复
    if (dismissedMentionStart === query.start) return;
    dismissedMentionStart = null;
    markdownMentionRange = { start: query.start, end: query.end };
    if (isMobile.value) {
      if (!mentionPickerVisible.value) {
        mentionPickerVisible.value = true;
        recordResourceMentionOperation('打开资源提及选择器');
      }
      return;
    }
    inlineMentionQuery.value = query.keyword;
    // 锚定在 @ 起点:继续输入时光标在动,浮层不应跟着漂
    const anchorRect = markdownEditor.coordsAtPos(query.start);
    if (anchorRect) setInlineMentionAnchor(anchorRect);
    if (!inlineMentionVisible.value) {
      inlineMentionVisible.value = true;
      recordResourceMentionOperation('打开资源提及选择器');
    }
  }

  function tryOpenTinyMceMention(editor: any) {
    if (
      !canEditResourceMentions.value ||
      mentionPickerVisible.value ||
      inlineMentionVisible.value ||
      slashCommandVisible.value
    )
      return;
    const range = editor.selection?.getRng?.() as Range | null;
    if (!range?.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE || range.startOffset < 1) return;
    if (editor.dom?.getParent?.(range.startContainer, 'pre,code,a')) return;
    const allBefore = editor.dom.createRng();
    allBefore.selectNodeContents(editor.getBody());
    allBefore.setEnd(range.startContainer, range.startOffset);
    const textBefore = allBefore.toString();
    // 原来只认「刚敲下 @」;改用通用解析,浮层收起后退回到能匹配的词也能重新唤起
    const mention = resolveMentionQuery(textBefore, textBefore.length);
    if (!mention) return;
    const backspaces = textBefore.length - mention.start;
    // 跨文本节点的 @(例如中间夹着格式标记)保守放弃,避免构造出错误的替换区间
    if (backspaces < 1 || range.startOffset < backspaces) return;
    const replacementRange = range.cloneRange();
    replacementRange.setStart(range.startContainer, range.startOffset - backspaces);
    if (isMobile.value) {
      htmlMentionSelection = captureTinyMceMentionSelection(editor, replacementRange);
      mentionPickerVisible.value = true;
    } else {
      htmlMentionSelection = { range: replacementRange, bookmark: null, markerId: null, text: '@' };
      syncTinyMceInlineMention(editor);
      inlineMentionVisible.value = true;
    }
    recordResourceMentionOperation('打开资源提及选择器');
  }

  function syncTinyMceInlineMention(editor: any) {
    if (!htmlMentionSelection) return;
    const currentRange = editor.selection?.getRng?.() as Range | null;
    if (!currentRange?.collapsed || !rangeBelongsToTinyMce(editor, currentRange)) return closeInlineMention();
    try {
      const mentionRange = htmlMentionSelection.range.cloneRange();
      mentionRange.setEnd(currentRange.startContainer, currentRange.startOffset);
      const text = mentionRange.toString();
      if (!isValidTinyMceMentionText(text)) return closeInlineMention();
      htmlMentionSelection = { range: mentionRange, bookmark: null, markerId: null, text };
      inlineMentionQuery.value = text.slice(1);
      // 锚定在 @ 起点(mentionRange 的起始),继续输入时浮层保持不动;
      // TinyMCE 的 Range rect 已是页面视口坐标,不能再叠加 iframe 偏移。
      const anchorRange = mentionRange.cloneRange();
      anchorRange.collapse(true);
      const anchorRect = anchorRange.getBoundingClientRect();
      setInlineMentionAnchor({
        left: anchorRect.left,
        top: anchorRect.top,
        height: anchorRect.height || 20,
      });
    } catch {
      closeInlineMention();
    }
  }

  function onMarkdownEditorKeydown(event: KeyboardEvent) {
    const isRedo =
      !event.isComposing &&
      (event.metaKey || event.ctrlKey) &&
      (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'));
    if (isRedo) {
      event.preventDefault();
      mdCodeMirrorRef.value?.redo();
      return;
    }
    if (event.isComposing) return;
    if (slashCommandVisible.value) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        slashCommandMenuRef.value?.moveActive(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        slashCommandMenuRef.value?.moveActive(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        slashCommandMenuRef.value?.chooseActive();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (!slashCommandMenuRef.value?.handleEscape()) closeSlashCommand({ dismissed: true });
      }
      return;
    }
    if (!inlineMentionVisible.value) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      inlineMentionSuggestionsRef.value?.moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      inlineMentionSuggestionsRef.value?.moveActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      inlineMentionSuggestionsRef.value?.chooseActive();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeInlineMention({ dismissed: true });
    }
  }

  function replaceMarkdownMention(text: string) {
    const markdownEditor = mdCodeMirrorRef.value;
    const selection = markdownEditor?.getSelection();
    const range = markdownMentionRange || (selection ? { start: selection.from, end: selection.to } : null);
    if (!range) return false;
    const source = String(markdownEditor?.getValue() ?? mdContent.value ?? content.value ?? '');
    const start = Math.max(0, Math.min(range.start, source.length));
    const end = Math.max(start, Math.min(range.end, source.length));
    const caret = start + text.length;
    markdownEditor?.replaceRange(start, end, text, caret, caret);
    return true;
  }

  function insertResourceMention(item: ResourceRef & { title: string }) {
    if (!canEditResourceMentions.value) return false;
    const href = buildResourceHref(item);
    if (!href) return false;
    if (currentType.value === 'markdown') {
      const title = escapeMarkdownLinkTitle(item.title) || item.id;
      const inserted = replaceMarkdownMention(`[${title}](${href})`);
      markdownMentionRange = null;
      if (inserted) recordResourceMentionOperation('插入资源提及成功');
      return inserted;
    }
    const editor = editorRef.value;
    if (!editor) return false;
    let inserted = false;
    try {
      editor.focus();
      if (!restoreTinyMceMentionSelection(editor)) throw new Error('mention selection expired');
      inserted = insertRichResourceReferenceAtSelection(editor, item);
    } catch {
      message.warning(t('note.resourceMention.insertFailed'));
    } finally {
      clearTinyMceMentionSelection(editor);
    }
    if (!inserted) return false;
    recordResourceMentionOperation('插入资源提及成功');
    return true;
  }

  function resourceReferenceHtml(item: ResourceRef & { title: string }) {
    const href = buildResourceHref(item);
    if (!href) return '';
    const attrs = buildResourceAnchorAttrs(item);
    return `<a href="${href}" contenteditable="false" data-ln-resource-type="${attrs['data-ln-resource-type']}" data-ln-resource-id="${attrs['data-ln-resource-id']}">${escapeHtmlText(item.title || item.id)}</a>`;
  }

  function insertRichResourceReferenceAtSelection(editor: any, item: ResourceRef & { title: string }) {
    const html = resourceReferenceHtml(item);
    if (!html) return false;
    const insert = () => {
      if (typeof editor.insertContent === 'function') editor.insertContent(html);
      else editor.selection.setContent(html);
      moveTinyMceCaretAfterResourceMention(editor, item);
    };
    if (editor.undoManager?.transact) editor.undoManager.transact(insert);
    else insert();

    // TinyMCE 的插入事件在不同版本中不一定会同步 v-model；显式更新正文事实源。
    const nextHtml = editor.getContent({ format: 'html' });
    if (!collectResourceRefsFromHtml(nextHtml).some((ref) => resourceRefKey(ref) === resourceRefKey(item))) {
      throw new Error('resource insertion missing from editor content');
    }
    content.value = nextHtml;
    window.setTimeout(() => {
      publishResourceRefs(editor.getContent({ format: 'html' }));
      decorateTinyMceResourceRefs();
    }, 0);
    return true;
  }

  function captureNoteFileInsertIntent(): NoteFileInsertIntent | null {
    if (props.readonly || props.context !== 'note') return null;
    if (currentType.value === 'markdown') {
      const editor = mdCodeMirrorRef.value;
      const source = editor?.getValue() ?? mdContent.value ?? '';
      const selection = editor?.getSelection() || { from: source.length, to: source.length };
      return {
        kind: 'markdown',
        noteId: props.noteId || '',
        source,
        from: selection.from,
        to: selection.to,
      };
    }
    const editor = editorRef.value;
    if (!editor) return null;
    editor.focus?.();
    return {
      kind: 'html',
      noteId: props.noteId || '',
      editor,
      bookmark: editor.selection?.getBookmark?.(2, true),
    };
  }

  function openNoteFileUpload() {
    if (noteFileUploadVisible.value || props.readonly || props.context !== 'note') return;
    const intent = captureNoteFileInsertIntent();
    if (!intent) return;
    noteFileInsertIntent.value = intent;
    noteFileInputRef.value?.open();
  }

  function onNoteFilePicked(files: File[]) {
    const file = files[0];
    if (!file || !noteFileInsertIntent.value) return;
    noteFileUploadFile.value = file;
    noteFileUploadSavedFile.value = null;
    noteFileUploadVisible.value = true;
  }

  function insertUploadedFileReference(file: CloudUploadResult, intent: NoteFileInsertIntent | null) {
    if (!intent || (intent.noteId && intent.noteId !== props.noteId)) return false;
    const item: ResourceRef & { title: string } = { type: 'file', id: file.fileId, title: file.filename };
    const href = buildResourceHref(item);
    if (!href) return false;
    try {
      if (intent.kind === 'markdown') {
        const editor = mdCodeMirrorRef.value;
        const source = editor?.getValue() ?? mdContent.value ?? '';
        // 上传期间只要正文发生过变化，就不再猜测旧偏移；文件已安全保存在云空间，交给用户重试插入。
        if (currentType.value !== 'markdown' || source !== intent.source) return false;
        const title = escapeMarkdownLinkTitle(item.title) || item.id;
        const markdown = `[${title}](${href})`;
        const caret = intent.from + markdown.length;
        if (editor) editor.replaceRange(intent.from, intent.to, markdown, caret, caret);
        else onMdInput(`${source.slice(0, intent.from)}${markdown}${source.slice(intent.to)}`);
        return true;
      }

      const editor = editorRef.value;
      if (currentType.value !== 'html' || !editor || editor !== intent.editor) return false;
      editor.focus?.();
      if (intent.bookmark) editor.selection?.moveToBookmark?.(intent.bookmark);
      const range = editor.selection?.getRng?.() as Range | null;
      if (!rangeBelongsToTinyMce(editor, range)) return false;
      return insertRichResourceReferenceAtSelection(editor, item);
    } catch {
      return false;
    }
  }

  async function handleNoteFileUploaded(file: CloudUploadResult) {
    noteFileUploadSavedFile.value = file;
    if (!insertUploadedFileReference(file, noteFileInsertIntent.value)) {
      message.warning(t('noteDetail.editor.fileUpload.insertPending'));
      return;
    }
    void recordOperation({ module: '笔记', operation: '上传文件并插入资源引用' }).catch(() => {});
    message.success(t('noteDetail.editor.fileUpload.success', { name: file.filename }));
    resetNoteFileUpload();
  }

  function retryNoteFileInsert() {
    const file = noteFileUploadSavedFile.value;
    if (!file) return;
    const currentIntent = captureNoteFileInsertIntent();
    if (!insertUploadedFileReference(file, currentIntent)) {
      message.warning(t('note.resourceMention.insertFailed'));
      return;
    }
    void recordOperation({ module: '笔记', operation: '插入已上传文件引用' }).catch(() => {});
    message.success(t('noteDetail.editor.fileUpload.inserted'));
    resetNoteFileUpload();
  }

  function resetNoteFileUpload() {
    noteFileUploadVisible.value = false;
    noteFileUploadFile.value = null;
    noteFileUploadSavedFile.value = null;
    noteFileInsertIntent.value = null;
  }

  function handleMentionPickerSelect(item: ResourceRef & { title: string }) {
    insertResourceMention(item);
    // 一次选择只消费一次当前编辑器位置。即使位置已在弹窗期间失效，也关闭选择器并要求重新触发，
    // 避免用户继续点列表时复用过期的 Range/bookmark。
    closeMentionPicker();
  }

  function insertInlineResourceMention(item: ResourceRef & { title: string }) {
    insertResourceMention(item);
    inlineMentionVisible.value = false;
  }

  function syncMdScroll(source: 'edit' | 'preview') {
    if (isProgrammaticMdScroll) {
      // 平滑定位期间两个面板都会连续触发 scroll。等最后一次滚动真正结束后再解锁，
      // 避免百分比同步把刚刚精确定位到顶部的标题重新推回页面中部。
      scheduleProgrammaticMarkdownScrollUnlock();
      return;
    }
    if (isSyncingMdScroll) return;
    isSyncingMdScroll = true;

    const editorScroll = mdCodeMirrorRef.value?.getScrollElement();
    const preview = mdPreviewRef.value;
    if (!editorScroll || !preview) {
      isSyncingMdScroll = false;
      return;
    }

    if (source === 'edit') {
      // CodeMirror → preview：按百分比同步
      const ratio = editorScroll.scrollHeight - editorScroll.clientHeight;
      if (ratio > 0) {
        preview.scrollTop = (editorScroll.scrollTop / ratio) * (preview.scrollHeight - preview.clientHeight);
      }
    } else {
      // preview → CodeMirror：按百分比同步
      const ratio = preview.scrollHeight - preview.clientHeight;
      if (ratio > 0) {
        editorScroll.scrollTop = (preview.scrollTop / ratio) * (editorScroll.scrollHeight - editorScroll.clientHeight);
      }
    }

    requestAnimationFrame(() => {
      isSyncingMdScroll = false;
    });
  }

  // Markdown 模式下同步外部内容
  watch(
    [() => props.type, content],
    async ([type]) => {
      if (type === 'markdown' && content.value !== mdContent.value) {
        mdContent.value = content.value || '';
        if (!markedLib) await ensureMdLib();
        renderMd();
      }
    },
    { immediate: true },
  );

  // 懒加载 marked + dompurify
  async function ensureMdLib() {
    if (markedLib) return;
    const mods = await Promise.all([import('marked'), import('dompurify')]);
    markedLib = configureMarkdownRenderer(mods[0].marked);
    dompurifyLib = mods[1].default;
  }

  // MD → HTML 统一收口：marked 渲染 + DOMPurify 消毒 + 站内链接增强属性(N0)。
  // 集中一处避免多条渲染路径口径漂移；decorate 只给站内链接补 data-ln-*,无站内链接则原样返回(零改写)。
  // 调用方须先 await ensureMdLib()（本函数同步使用已加载的 markedLib/dompurifyLib）。
  function mdToSafeHtml(mdText: string, editableTaskLists = false): string {
    if (!markedLib || !dompurifyLib) throw new Error('MARKDOWN_RENDERER_NOT_READY');
    const raw = markedLib.parse(mdText || '', { walkTokens: promoteEmptyMarkdownTaskToken });
    const safe = dompurifyLib.sanitize(raw);
    return decorateInternalResourceLinks(normalizeMarkdownTaskListHtml(safe, editableTaskLists));
  }

  const renderedMd = ref('');
  let mdRenderTimer: ReturnType<typeof setTimeout> | null = null;
  // 富文本里图表装饰块的重渲染节流(编辑器的 NodeChange 触发很密)
  const MERMAID_COMPANION_DEBOUNCE_MS = 260;
  let mermaidCompanionTimer: number | null = null;

  function onMdInput(value: string | number) {
    const val = String(value ?? '');
    mdContent.value = val;
    content.value = val;
    debounceRenderMd();
    void nextTick().then(() => {
      syncMarkdownInlineMenus();
    });
  }

  const NOTE_IMAGE_UPLOAD_CONCURRENCY = 3;

  async function prepareNoteImageUploadNoteId() {
    if (props.imageUploadMode === 'base64') return '';
    let noteId = props.noteId;
    if (!noteId && typeof props.ensureNoteId === 'function') {
      noteId = await (props.ensureNoteId as () => Promise<string>)();
    }
    return noteId || '';
  }

  async function uploadNoteImageFile(file: Blob, fileName: string, preparedNoteId?: string) {
    let noteId = preparedNoteId ?? props.noteId;
    if (preparedNoteId === undefined && !noteId && typeof props.ensureNoteId === 'function') {
      noteId = await (props.ensureNoteId as () => Promise<string>)();
    }
    const formData = new FormData();
    formData.append('file', file, fileName);
    formData.append('noteId', noteId || '');
    const res = await apiBasePost('/api/note/uploadImage', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    if (res.data?.noteId) emits('setNoteId', res.data.noteId);
    if (!res.data?.url) throw new Error('NOTE_IMAGE_UPLOAD_FAILED');
    return String(res.data.url);
  }

  function escapeMarkdownImageAlt(fileName: string) {
    return String(fileName || t('note.mdImageAlt'))
      .replace(/\.[^.]+$/u, '')
      .replace(/([\\[\]])/gu, '\\$1')
      .replace(/[\r\n]+/gu, ' ')
      .trim();
  }

  function getPastedMarkdownImage(event: ClipboardEvent): File | null {
    const files = Array.from(event.clipboardData?.files || []);
    const directImage = files.find((file) => file.type.startsWith('image/'));
    if (directImage) return directImage;

    const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'));
    return imageItem?.getAsFile() || null;
  }

  function readImageAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = typeof reader.result === 'string' ? reader.result : '';
        if (value.startsWith('data:image/')) resolve(value);
        else reject(new Error('INVALID_IMAGE_DATA_URL'));
      };
      reader.onerror = () => reject(reader.error || new Error('IMAGE_READ_FAILED'));
      reader.readAsDataURL(file);
    });
  }

  function pastedImageFileName(file: File) {
    if (file.name) return file.name;
    const extension = file.type.split('/')[1]?.replace(/[^a-z0-9]/giu, '') || 'png';
    return `pasted-image.${extension}`;
  }

  function onMarkdownPaste(event: ClipboardEvent) {
    if (props.readonly) return;
    const file = getPastedMarkdownImage(event);
    if (!file) return;
    // 只拦截图片粘贴；文本与普通 Markdown 内容仍走浏览器默认行为。
    event.preventDefault();
    if (markdownImageUploading.value) return;
    void uploadMarkdownImage(file, pastedImageFileName(file));
  }

  function openMarkdownImageInsert() {
    if (props.readonly || markdownImageUploading.value) return;
    markdownMediaTextUploadIntent.value = null;
    markdownImageInputRef.value?.open();
  }

  function openMarkdownMediaTextInsert() {
    if (props.readonly || markdownImageUploading.value) return;
    const markdownEditor = mdCodeMirrorRef.value;
    const source = markdownEditor?.getValue() ?? mdContent.value ?? '';
    const selection = markdownEditor?.getSelection() || { from: source.length, to: source.length };
    markdownMediaTextUploadIntent.value = {
      source,
      start: selection.from,
      end: selection.to,
      caption: source.slice(selection.from, selection.to).trim() || t('noteDetail.editor.mediaTextMarkdownPlaceholder'),
    };
    markdownMediaTextImageInputRef.value?.open();
  }

  async function uploadMarkdownImage(file: File, fileName = file.name) {
    if (markdownImageUploading.value) return;
    const selection = getMarkdownSelection();
    const start = selection.from;
    const end = selection.to;
    markdownImageUploading.value = true;
    try {
      // 模板编辑器没有真实 noteId，图片必须内嵌进模板正文；禁止为了上传图片偷偷创建一篇无主笔记。
      const imageUrl =
        props.imageUploadMode === 'base64' ? await readImageAsDataUrl(file) : await uploadNoteImageFile(file, fileName);
      const source = mdContent.value || '';
      const linePrefix = start > 0 && source[start - 1] !== '\n' ? '\n' : '';
      const lineSuffix = end < source.length && source[end] !== '\n' ? '\n' : '';
      const markdown = `${linePrefix}![${escapeMarkdownImageAlt(fileName)}](${imageUrl})${lineSuffix}`;
      const nextCursor = start + markdown.length;
      mdCodeMirrorRef.value?.replaceRange(start, end, markdown, nextCursor, nextCursor);
    } catch {
      message.warning(t('note.uploadFailed'));
    } finally {
      markdownImageUploading.value = false;
    }
  }

  async function uploadMarkdownMediaText(file: File, intent: MarkdownMediaTextUploadIntent) {
    if (markdownImageUploading.value) return;
    markdownImageUploading.value = true;
    try {
      const imageUrl =
        props.imageUploadMode === 'base64'
          ? await readImageAsDataUrl(file)
          : await uploadNoteImageFile(file, file.name || 'note-image.png');
      const currentSource = mdCodeMirrorRef.value?.getValue() ?? mdContent.value ?? '';
      if (currentSource !== intent.source) {
        message.warning(t('noteDetail.editor.mediaTextTargetChanged'));
        return;
      }
      const block = createMarkdownRichMediaTextBlockHtml(imageUrl, richMediaTextImageAlt(file.name), intent.caption);
      const result = insertBlock(
        {
          value: currentSource,
          selectionStart: intent.start,
          selectionEnd: intent.end,
        },
        block,
      );
      if (mdCodeMirrorRef.value) mdCodeMirrorRef.value.applyEdit(result);
      else onMdInput(applyEditResult(currentSource, result));
      void recordOperation({ module: '笔记', operation: '在 Markdown 中插入图文组合' });
    } catch {
      message.warning(t('note.uploadFailed'));
    } finally {
      markdownImageUploading.value = false;
      markdownMediaTextUploadIntent.value = null;
    }
  }

  /** 工具栏操作统一收口为一次 CodeMirror transaction，原生进入 history 并精确恢复选区。 */
  async function applyMarkdownEdit(transform: (input: EditorSelection) => EditResult) {
    if (props.readonly) return;
    const markdownEditor = mdCodeMirrorRef.value;
    const value = markdownEditor?.getValue() ?? mdContent.value ?? '';
    const selection = markdownEditor?.getSelection() || { from: value.length, to: value.length };
    const input: EditorSelection = {
      value,
      selectionStart: selection.from,
      selectionEnd: selection.to,
    };
    const result = transform(input);
    if (markdownEditor) markdownEditor.applyEdit(result);
    else onMdInput(applyEditResult(value, result));
  }

  /** 插入 mermaid 图表模板。图表代码块必须自成段落,交给 insertBlock 统一补空行 */
  function insertDiagramTemplate(templateKey: string) {
    const template = MERMAID_TEMPLATES.find((item) => item.key === templateKey);
    if (!template) return;
    const snippet = mermaidTemplateMarkdown(template, locale.value);
    void applyMarkdownEdit((input) => insertBlock(input, snippet));
  }

  /**
   * 工具栏点「插入资源」:等价于在光标处敲一个 @,复用整套提及流程。
   * 桌面端走贴着光标的内联浮层(和输入 @ 完全一致);只有手机才用弹窗 ——
   * 桌面用弹窗的话,一个只有几行的列表被撑进 460px 的框里,底下全是空白。
   */
  function openResourceMentionPicker() {
    if (!canEditResourceMentions.value) return;
    const markdownEditor = mdCodeMirrorRef.value;
    const selection = markdownEditor?.getSelection() || { from: mdContent.value.length, to: mdContent.value.length };

    if (isMobile.value || !markdownEditor) {
      markdownMentionRange = { start: selection.from, end: selection.to };
      dismissedMentionStart = null;
      recordResourceMentionOperation('打开资源提及选择器');
      mentionPickerVisible.value = true;
      return;
    }

    /*
     * 桌面端**真的往正文里敲一个 @**,而不是凭空开一个浮层。
     * 之前那样开出来的浮层背后没有 @ 文本,光标一动 resolveMentionQuery 就找不到提及、
     * 立刻把浮层关掉 —— 表现就是"按上下键菜单直接消失"。插入真实字符后,
     * 后续筛选、上下键、Esc、选中替换全部复用手敲 @ 的那一套,行为完全一致。
     * 由 CodeMirror transaction 插入，能与后续资源替换分别撤销。
     */
    dismissedMentionStart = null;
    const caret = selection.from + 1;
    markdownEditor.replaceRange(selection.from, selection.to, '@', caret, caret);
    void nextTick().then(syncOrOpenMarkdownMention);
  }

  async function onMarkdownImagePicked(files: File[]) {
    if (!files.length || markdownImageUploading.value) return;
    const selection = getMarkdownSelection();
    const source = mdCodeMirrorRef.value?.getValue() ?? mdContent.value ?? '';
    markdownImageUploading.value = true;
    try {
      // 新建笔记只在批次开始时创建一次，后续并发上传复用同一个 noteId。
      const noteId = await prepareNoteImageUploadNoteId();
      const results = await runOrderedBatch(
        files,
        async (file) => ({
          file,
          url:
            props.imageUploadMode === 'base64'
              ? await readImageAsDataUrl(file)
              : await uploadNoteImageFile(file, file.name || 'note-image.png', noteId),
        }),
        NOTE_IMAGE_UPLOAD_CONCURRENCY,
      );
      const uploaded = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      if (uploaded.length) {
        const linePrefix = selection.from > 0 && source[selection.from - 1] !== '\n' ? '\n' : '';
        const lineSuffix = selection.to < source.length && source[selection.to] !== '\n' ? '\n' : '';
        const images = uploaded.map(({ file, url }) => `![${escapeMarkdownImageAlt(file.name)}](${url})`).join('\n');
        const markdown = `${linePrefix}${images}${lineSuffix}`;
        const nextCursor = selection.from + markdown.length;
        if (mdCodeMirrorRef.value) {
          mdCodeMirrorRef.value.replaceRange(selection.from, selection.to, markdown, nextCursor, nextCursor);
        } else {
          onMdInput(`${source.slice(0, selection.from)}${markdown}${source.slice(selection.to)}`);
        }
      }
      if (uploaded.length !== files.length) message.warning(t('note.uploadFailed'));
    } catch {
      message.warning(t('note.uploadFailed'));
    } finally {
      markdownImageUploading.value = false;
    }
  }

  async function onMarkdownMediaTextImagePicked(files: File[]) {
    const file = files[0];
    const intent = markdownMediaTextUploadIntent.value;
    if (!file || !intent) return;
    await uploadMarkdownMediaText(file, intent);
  }

  function notifyRichMediaTextMutation(editor = editorRef.value) {
    if (!editor) return;
    editor.nodeChanged?.();
    editor.setDirty?.(true);
    if (editor.dispatch) editor.dispatch('input');
    else editor.fire?.('input');
  }

  function getLiveRichMediaTextTarget(block: HTMLElement | null, item: HTMLElement | null) {
    const body = editorRef.value?.getBody?.() as HTMLElement | null;
    if (
      !body ||
      !block?.isConnected ||
      !item?.isConnected ||
      !body.contains(block) ||
      item.parentElement !== block ||
      !block.classList.contains('ln-media-text') ||
      !item.classList.contains('ln-media-text__item')
    ) {
      return null;
    }
    return { block, item };
  }

  function decorateRichMediaTextCaptions(editor = editorRef.value) {
    const body = editor?.getBody?.() as HTMLElement | null;
    if (!body) return;
    const decorate = () => {
      body.querySelectorAll<HTMLElement>('.ln-media-text__content').forEach((caption) => {
        if (String(caption.textContent || '').trim()) caption.removeAttribute('data-mce-placeholder');
        else caption.setAttribute('data-mce-placeholder', t('noteDetail.editor.mediaTextTextPlaceholder'));
      });
    };
    if (editor.undoManager?.ignore) editor.undoManager.ignore(decorate);
    else decorate();
  }

  function clearRichMediaTextSelection() {
    richMediaTextBlock.value?.removeAttribute('data-ln-media-selected');
    richMediaTextItem.value?.removeAttribute('data-ln-media-item-selected');
  }

  function closeRichMediaTextToolbar() {
    clearRichMediaTextSelection();
    richMediaTextToolbarVisible.value = false;
    richMediaTextBlock.value = null;
    richMediaTextItem.value = null;
  }

  function escapeHtmlAttribute(value: string) {
    return String(value)
      .replace(/&/gu, '&amp;')
      .replace(/</gu, '&lt;')
      .replace(/>/gu, '&gt;')
      .replace(/"/gu, '&quot;')
      .replace(/'/gu, '&#39;');
  }

  function openRichImageInsert() {
    const editor = editorRef.value;
    if (!editor || props.readonly || richImageUploading.value) return;
    editor.focus?.();
    richImageUploadIntent.value = {
      editor,
      noteId: props.noteId || '',
      bookmark: editor.selection?.getBookmark?.(2, true),
    };
    richImageInputRef.value?.open();
  }

  async function onRichImagePicked(files: File[]) {
    const intent = richImageUploadIntent.value;
    if (!files.length || !intent || richImageUploading.value) return;
    richImageUploading.value = true;
    try {
      const noteId = await prepareNoteImageUploadNoteId();
      const results = await runOrderedBatch(
        files,
        async (file) => ({
          file,
          url:
            props.imageUploadMode === 'base64'
              ? await readImageAsDataUrl(file)
              : await uploadNoteImageFile(file, file.name || 'note-image.png', noteId),
        }),
        NOTE_IMAGE_UPLOAD_CONCURRENCY,
      );
      const uploaded = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      const editor = editorRef.value;
      if (!editor || editor !== intent.editor || (intent.noteId && intent.noteId !== props.noteId)) {
        message.warning(t('noteDetail.editor.mediaTextTargetChanged'));
        return;
      }
      if (uploaded.length) {
        const html = uploaded
          .map(
            ({ file, url }) =>
              `<p><img src="${escapeHtmlAttribute(url)}" alt="${escapeHtmlAttribute(richMediaTextImageAlt(file.name))}"></p>`,
          )
          .join('');
        editor.focus?.();
        if (intent.bookmark) editor.selection?.moveToBookmark?.(intent.bookmark);
        editor.undoManager?.transact(() => editor.insertContent(html));
        notifyRichMediaTextMutation(editor);
      }
      if (uploaded.length !== files.length) message.warning(t('note.uploadFailed'));
    } catch {
      message.warning(t('note.uploadFailed'));
    } finally {
      richImageUploading.value = false;
      richImageUploadIntent.value = null;
    }
  }

  function handleRichMediaTextToolbarOpenChange(open: boolean) {
    if (!open) closeRichMediaTextToolbar();
  }

  function openRichMediaTextToolbar(block: HTMLElement, item: HTMLElement, anchor?: { x: number; y: number }) {
    if (props.readonly || !getLiveRichMediaTextTarget(block, item)) return;
    const wasSameItem = richMediaTextItem.value === item;
    clearRichMediaTextSelection();
    richMediaTextBlock.value = block;
    richMediaTextItem.value = item;
    block.setAttribute('data-ln-media-selected', 'true');
    item.setAttribute('data-ln-media-item-selected', 'true');
    richMediaTextPosition.value = normalizeRichMediaTextPosition(block.getAttribute('data-ln-media-position'));
    richMediaTextWidth.value = normalizeRichMediaTextWidth(block.getAttribute('data-ln-media-width'));

    const rect = item.getBoundingClientRect();
    richMediaTextAnchorStyle.value = {
      position: 'fixed',
      left: `${anchor?.x ?? Math.max(8, rect.left + 12)}px`,
      top: `${anchor?.y ?? Math.max(8, rect.top + 8)}px`,
      width: '1px',
      height: '1px',
      pointerEvents: 'none',
      zIndex: '2',
    };
    if (richMediaTextToolbarVisible.value && !wasSameItem) {
      richMediaTextToolbarVisible.value = false;
      void nextTick().then(() => {
        if (richMediaTextItem.value === item) richMediaTextToolbarVisible.value = true;
      });
      return;
    }
    richMediaTextToolbarVisible.value = true;
  }

  function openRichMediaTextInsert() {
    const editor = editorRef.value;
    if (!editor || props.readonly || richMediaTextUploading.value) return;
    richMediaTextUploadIntent.value = { kind: 'insert', editor, noteId: props.noteId || '' };
    richMediaTextImageInputRef.value?.open();
  }

  function replaceRichMediaTextImage() {
    const target = getLiveRichMediaTextTarget(richMediaTextBlock.value, richMediaTextItem.value);
    if (!target || richMediaTextUploading.value) return;
    richMediaTextUploadIntent.value = {
      kind: 'replace',
      ...target,
      editor: editorRef.value,
      noteId: props.noteId || '',
    };
    richMediaTextImageInputRef.value?.open();
  }

  function previewSelectedRichMediaTextImage() {
    const target = getLiveRichMediaTextTarget(richMediaTextBlock.value, richMediaTextItem.value);
    const image = target?.item.querySelector<HTMLImageElement>('.ln-media-text__media img');
    if (!image) return;
    closeRichMediaTextToolbar();
    openNoteContentImagePreview(image);
  }

  function addRichMediaTextItem() {
    const target = getLiveRichMediaTextTarget(richMediaTextBlock.value, richMediaTextItem.value);
    if (!target || richMediaTextUploading.value) return;
    richMediaTextUploadIntent.value = {
      kind: 'add',
      ...target,
      editor: editorRef.value,
      noteId: props.noteId || '',
    };
    richMediaTextImageInputRef.value?.open();
  }

  function focusRichMediaTextCaption(editor: any, item: HTMLElement) {
    const caption = item.querySelector<HTMLElement>('.ln-media-text__content');
    if (!caption) return;
    const paragraph = caption.querySelector<HTMLElement>('p') || caption;
    editor.focus?.();
    editor.selection?.select?.(paragraph, true);
    editor.selection?.collapse?.(false);
    editor.selection?.scrollIntoView?.(item);
  }

  function richMediaTextImageAlt(fileName: string) {
    return String(fileName || t('note.mdImageAlt'))
      .replace(/\.[^.]+$/u, '')
      .replace(/[\r\n]+/gu, ' ')
      .trim();
  }

  async function onRichMediaTextImagePicked(files: File[]) {
    const file = files[0];
    const intent = richMediaTextUploadIntent.value;
    if (!file || !intent || richMediaTextUploading.value) return;
    richMediaTextUploading.value = true;
    try {
      const imageUrl =
        props.imageUploadMode === 'base64'
          ? await readImageAsDataUrl(file)
          : await uploadNoteImageFile(file, file.name || 'note-image.png');
      const editor = editorRef.value;
      const body = editor?.getBody?.() as HTMLElement | null;
      if (!editor || !body || editor !== intent.editor || (intent.noteId && intent.noteId !== props.noteId)) {
        message.warning(t('noteDetail.editor.mediaTextTargetChanged'));
        return;
      }
      const imageAlt = richMediaTextImageAlt(file.name);
      let targetBlock: HTMLElement | null = null;
      let targetItem: HTMLElement | null = null;

      if (intent.kind === 'insert') {
        const token = `ln-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const blockHtml = createRichMediaTextBlockHtml(imageUrl, imageAlt).replace(
          '<section class="ln-media-text"',
          `<section class="ln-media-text" data-ln-media-inserting="${token}"`,
        );
        editor.focus();
        editor.undoManager?.transact(() => editor.insertContent(blockHtml));
        targetBlock = body.querySelector<HTMLElement>(`section.ln-media-text[data-ln-media-inserting="${token}"]`);
        targetBlock?.removeAttribute('data-ln-media-inserting');
        targetItem = targetBlock?.querySelector<HTMLElement>('.ln-media-text__item') || null;
        if (targetBlock && targetItem) {
          void recordOperation({ module: '笔记', operation: '插入图文组合' });
        }
      } else {
        const liveTarget = getLiveRichMediaTextTarget(intent.block, intent.item);
        if (!liveTarget) {
          message.warning(t('noteDetail.editor.mediaTextTargetChanged'));
          return;
        }
        targetBlock = liveTarget.block;
        if (intent.kind === 'replace') {
          targetItem = liveTarget.item;
          const image = targetItem.querySelector<HTMLImageElement>('.ln-media-text__media img');
          if (!image) throw new Error('RICH_MEDIA_TEXT_IMAGE_MISSING');
          editor.undoManager?.transact(() => {
            image.setAttribute('src', imageUrl);
            image.setAttribute('alt', imageAlt);
            image.removeAttribute('style');
            image.removeAttribute('width');
            image.removeAttribute('height');
            image.removeAttribute('data-ln-size');
          });
        } else {
          const holder = editor.getDoc().createElement('div');
          holder.innerHTML = createRichMediaTextItemHtml(imageUrl, imageAlt);
          targetItem = holder.firstElementChild as HTMLElement | null;
          if (!targetItem) throw new Error('RICH_MEDIA_TEXT_ITEM_CREATE_FAILED');
          editor.undoManager?.transact(() => liveTarget.item.after(targetItem as HTMLElement));
        }
      }

      if (!targetBlock || !targetItem) throw new Error('RICH_MEDIA_TEXT_INSERT_FAILED');
      decorateRichMediaTextCaptions(editor);
      notifyRichMediaTextMutation(editor);
      focusRichMediaTextCaption(editor, targetItem);
      void nextTick().then(() => openRichMediaTextToolbar(targetBlock as HTMLElement, targetItem as HTMLElement));
    } catch {
      message.warning(t('note.uploadFailed'));
    } finally {
      richMediaTextUploading.value = false;
      richMediaTextUploadIntent.value = null;
    }
  }

  function applyRichMediaTextPosition(value: unknown) {
    const target = getLiveRichMediaTextTarget(richMediaTextBlock.value, richMediaTextItem.value);
    if (!target) return closeRichMediaTextToolbar();
    const position = normalizeRichMediaTextPosition(value);
    richMediaTextPosition.value = position;
    editorRef.value?.undoManager?.transact(() => target.block.setAttribute('data-ln-media-position', position));
    notifyRichMediaTextMutation();
  }

  function applyRichMediaTextWidth(value: unknown) {
    const target = getLiveRichMediaTextTarget(richMediaTextBlock.value, richMediaTextItem.value);
    if (!target) return closeRichMediaTextToolbar();
    const width = normalizeRichMediaTextWidth(value);
    richMediaTextWidth.value = width;
    editorRef.value?.undoManager?.transact(() => target.block.setAttribute('data-ln-media-width', String(width)));
    notifyRichMediaTextMutation();
  }

  function deleteRichMediaTextItem() {
    const editor = editorRef.value;
    const target = getLiveRichMediaTextTarget(richMediaTextBlock.value, richMediaTextItem.value);
    if (!editor || !target) return closeRichMediaTextToolbar();
    const items = Array.from(target.block.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('ln-media-text__item'),
    );
    const itemIndex = items.indexOf(target.item);
    const nextItem = items[itemIndex + 1] || items[itemIndex - 1] || null;
    const nextBlock = nextItem ? target.block : null;
    closeRichMediaTextToolbar();

    editor.undoManager?.transact(() => {
      if (nextItem) {
        target.item.remove();
        return;
      }
      const body = editor.getBody() as HTMLElement;
      let paragraph = target.block.nextElementSibling as HTMLElement | null;
      if (!paragraph?.matches('p,div')) {
        paragraph = editor.dom.create('p', {}) as HTMLElement;
        paragraph.appendChild(editor.dom.create('br', { 'data-mce-bogus': '1' }));
        target.block.after(paragraph);
      }
      target.block.remove();
      editor.selection?.setCursorLocation?.(paragraph, 0);
      if (!body.children.length) body.appendChild(paragraph);
    });
    notifyRichMediaTextMutation(editor);
    if (nextBlock && nextItem) {
      focusRichMediaTextCaption(editor, nextItem);
      void nextTick().then(() => openRichMediaTextToolbar(nextBlock, nextItem));
    }
  }

  interface NoteShortcutItem {
    key: string;
    label: string;
    keys: string[];
    description?: string;
  }

  interface NoteShortcutSection {
    key: string;
    title: string;
    items: NoteShortcutItem[];
  }

  type RepeatableEditorMode = 'html' | 'markdown';

  interface StoredTextGradient {
    from: string;
    to: string;
    angle: TextGradientAngle;
  }

  interface RepeatableEditorAction {
    key: string;
    gradient?: StoredTextGradient;
  }

  const repeatableEditorActions = ref<Record<RepeatableEditorMode, RepeatableEditorAction | null>>({
    html: null,
    markdown: null,
  });
  const currentRepeatableAction = computed(() => repeatableEditorActions.value[currentType.value]);

  function rememberRepeatableAction(mode: RepeatableEditorMode, action: RepeatableEditorAction) {
    repeatableEditorActions.value = { ...repeatableEditorActions.value, [mode]: action };
  }

  function repeatableActionLabel(action: RepeatableEditorAction | null) {
    if (!action) return '';
    if (/^heading[1-6]$/u.test(action.key)) {
      return t(`noteDetail.editor.heading${action.key.slice(-1)}`);
    }
    if (action.key.startsWith('textColor:')) return t('noteDetail.editor.textColor');
    if (action.key.startsWith('backgroundColor:')) return t('noteDetail.editor.backgroundColor');
    const labelKeys: Record<string, string> = {
      paragraph: 'noteDetail.editor.paragraph',
      bold: 'noteDetail.editor.bold',
      italic: 'noteDetail.editor.italic',
      underline: 'noteDetail.editor.underline',
      strike: 'noteDetail.editor.strike',
      inlineCode: 'noteDetail.editor.inlineCode',
      quote: 'noteDetail.editor.quote',
      todo: 'noteDetail.editor.todo',
      bulletList: 'noteDetail.editor.bulletList',
      orderedList: 'noteDetail.editor.orderedList',
      alignLeft: 'noteDetail.editor.alignLeft',
      alignCenter: 'noteDetail.editor.alignCenter',
      alignRight: 'noteDetail.editor.alignRight',
      alignJustify: 'noteDetail.editor.alignJustify',
      indent: 'noteDetail.editor.indent',
      outdent: 'noteDetail.editor.outdent',
      clearFormatting: 'noteDetail.editor.clearFormatting',
      textGradient: 'noteDetail.editor.gradientText',
      removeTextColor: 'noteDetail.editor.removeTextColor',
      removeBackgroundColor: 'noteDetail.editor.removeBackgroundColor',
      removeTextGradient: 'noteDetail.editor.removeGradientText',
    };
    return labelKeys[action.key] ? t(labelKeys[action.key]) : action.key;
  }

  const repeatLastActionDescription = computed(() => {
    const action = currentRepeatableAction.value;
    return action
      ? t('noteDetail.editor.repeatLastReady', { action: repeatableActionLabel(action) })
      : t('noteDetail.editor.repeatLastEmpty');
  });
  const repeatLastActionShortcutKeys = computed(() => getRepeatLastActionShortcutLabels());
  const repeatLastActionShortcut = computed(() => repeatLastActionShortcutKeys.value.join(' / '));
  const headingShortcutKeys = computed(() => getHeadingShortcutLabels());

  const shortcutHelpVisible = ref(false);
  const shortcutHelpModeLabel = computed(() =>
    currentType.value === 'markdown'
      ? t('noteDetail.editor.shortcutsModeMarkdown')
      : t('noteDetail.editor.shortcutsModeRichText'),
  );
  const shortcutHelpSections = computed<NoteShortcutSection[]>(() => {
    const commonItems: NoteShortcutItem[] = [
      ...(props.context === 'note'
        ? [
            {
              key: 'save',
              label: t('common.save'),
              keys: ['Ctrl / ⌘ + S'],
            },
          ]
        : []),
      {
        key: 'undo',
        label: t('noteDetail.editor.undo'),
        keys: ['Ctrl / ⌘ + Z'],
      },
      {
        key: 'redo',
        label: t('noteDetail.editor.redo'),
        description: t('noteDetail.editor.redoDescription'),
        keys: ['Ctrl / ⌘ + Shift + Z', 'Ctrl + Y'],
      },
      {
        key: 'repeatLastAction',
        label: t('noteDetail.editor.repeatLast'),
        description: t('noteDetail.editor.repeatLastDescription'),
        keys: repeatLastActionShortcutKeys.value,
      },
      {
        key: 'find',
        label: t('noteDetail.editor.findReplace'),
        keys: ['Ctrl / ⌘ + F'],
      },
    ];
    const formattingItems: NoteShortcutItem[] = [
      {
        key: 'bold',
        label: t('noteDetail.editor.bold'),
        keys: ['Ctrl / ⌘ + B'],
      },
      {
        key: 'italic',
        label: t('noteDetail.editor.italic'),
        keys: ['Ctrl / ⌘ + I'],
      },
      ...(currentType.value === 'html'
        ? [
            {
              key: 'underline',
              label: t('noteDetail.editor.underline'),
              keys: ['Ctrl / ⌘ + U'],
            },
          ]
        : []),
      {
        key: 'link',
        label: t('noteDetail.editor.link'),
        keys: ['Ctrl / ⌘ + K'],
      },
      {
        key: 'headings',
        label: t('noteDetail.editor.heading1To6'),
        keys: headingShortcutKeys.value,
      },
      ...(currentType.value === 'markdown'
        ? [
            {
              key: 'strike',
              label: t('noteDetail.editor.strike'),
              keys: ['Ctrl / ⌘ + Shift + X'],
            },
            {
              key: 'inlineCode',
              label: t('noteDetail.editor.inlineCode'),
              keys: ['Ctrl / ⌘ + E'],
            },
            {
              key: 'orderedList',
              label: t('noteDetail.editor.orderedList'),
              keys: ['Ctrl / ⌘ + Shift + 7'],
            },
            {
              key: 'bulletList',
              label: t('noteDetail.editor.bulletList'),
              keys: ['Ctrl / ⌘ + Shift + 8'],
            },
          ]
        : []),
    ];

    return [
      {
        key: 'common',
        title: t('noteDetail.editor.shortcutsCommon'),
        items: commonItems,
      },
      {
        key: 'formatting',
        title: t('noteDetail.editor.shortcutsFormatting'),
        items: formattingItems,
      },
    ];
  });

  function toolbarAction(
    key: string,
    label: string,
    actionIcon: string,
    options: Partial<EditorToolbarAction> = {},
  ): EditorToolbarAction {
    return { key, label, icon: actionIcon, ...options };
  }

  const editorToolbarProps = computed(() => {
    const isMarkdown = currentType.value === 'markdown';
    const editingDisabled = props.readonly || (isMarkdown && mdView.value === 'preview');
    const richNotReady = !isMarkdown && !editorRef.value;
    const disabled = editingDisabled || richNotReady;
    const state = richToolbarState.value;
    const action = (key: string, label: string, actionIcon: string, options: Partial<EditorToolbarAction> = {}) =>
      toolbarAction(key, label, actionIcon, { disabled, ...options });

    const headingActions = [
      action('paragraph', t('noteDetail.editor.paragraph'), icon.noteDetail.toolbar.heading, {
        selected: !isMarkdown && state.block === 'p',
      }),
      ...Array.from({ length: 6 }, (_, index) => {
        const level = index + 1;
        return action(`heading${level}`, t(`noteDetail.editor.heading${level}`), icon.noteDetail.toolbar.heading, {
          selected: !isMarkdown && state.block === `h${level}`,
        });
      }),
    ];

    const listActions = [
      action('bulletList', t('noteDetail.editor.bulletList'), icon.noteDetail.toolbar.bulletList, {
        selected: !isMarkdown && state.bulletList,
      }),
      action('orderedList', t('noteDetail.editor.orderedList'), icon.noteDetail.toolbar.orderedList, {
        selected: !isMarkdown && state.orderedList,
      }),
    ];

    const insertActions: EditorToolbarAction[] = [
      action('insertTable', t('noteDetail.editor.table'), icon.noteDetail.toolbar.table),
      action('insertImage', t('noteDetail.editor.image'), icon.noteDetail.toolbar.image, {
        disabled: disabled || (isMarkdown ? markdownImageUploading.value : richImageUploading.value),
      }),
      action('insertMediaText', t('noteDetail.editor.mediaText'), icon.noteDetail.toolbar.mediaText, {
        description: t('noteDetail.editor.mediaTextDescription'),
        disabled: disabled || (isMarkdown ? markdownImageUploading.value : richMediaTextUploading.value),
      }),
      ...(props.context === 'note'
        ? [
            action('insertFile', t('noteDetail.editor.fileUpload.action'), icon.file_upload, {
              disabled: disabled || noteFileUploadVisible.value,
            }),
            action('insertResource', t('noteDetail.editor.resource'), icon.noteDetail.toolbar.mention, {
              disabled: disabled || !canEditResourceMentions.value,
            }),
          ]
        : []),
      action('insertCodeBlock', t('noteDetail.editor.codeBlock'), icon.noteDetail.toolbar.codeBlock),
      ...MERMAID_TEMPLATES.map((template, index) =>
        action(`insertDiagram:${template.key}`, t(template.labelKey), icon.noteDiagram, {
          dividerBefore: index === 0,
          description: t('noteDetail.editor.diagram'),
        }),
      ),
      action('insertDivider', t('noteDetail.editor.divider'), icon.noteDetail.toolbar.divider, {
        dividerBefore: true,
      }),
    ];
    if (!isMarkdown) {
      insertActions.push(action('insertEmoji', t('noteDetail.editor.emoji'), icon.noteDetail.toolbar.emoji));
    }

    const formatMoreActions = isMarkdown
      ? [
          action('quote', t('noteDetail.editor.quote'), icon.noteDetail.toolbar.quote),
          action('strike', t('noteDetail.editor.strike'), icon.noteDetail.toolbar.strike),
          action('inlineCode', t('noteDetail.editor.inlineCode'), icon.noteDetail.toolbar.inlineCode),
          action('findReplace', t('noteDetail.editor.findReplace'), icon.noteDetail.toolbar.search, {
            dividerBefore: true,
          }),
        ]
      : [
          action('underline', t('noteDetail.editor.underline'), icon.noteDetail.toolbar.underline, {
            dividerBefore: false,
          }),
          action('strike', t('noteDetail.editor.strike'), icon.noteDetail.toolbar.strike),
          action('textColorPicker', t('noteDetail.editor.textColor'), icon.noteDetail.toolbar.textColor, {
            dividerBefore: true,
          }),
          action('textGradient', t('noteDetail.editor.gradientText'), icon.noteDetail.toolbar.gradientText),
          action(
            'backgroundColorPicker',
            t('noteDetail.editor.backgroundColor'),
            icon.noteDetail.toolbar.backgroundColor,
          ),
          action('alignLeft', t('noteDetail.editor.alignLeft'), icon.noteDetail.toolbar.align, { dividerBefore: true }),
          action('alignCenter', t('noteDetail.editor.alignCenter'), icon.noteDetail.toolbar.align),
          action('alignRight', t('noteDetail.editor.alignRight'), icon.noteDetail.toolbar.align),
          action('alignJustify', t('noteDetail.editor.alignJustify'), icon.noteDetail.toolbar.align),
          action('indent', t('noteDetail.editor.indent'), icon.noteDetail.toolbar.indent, { dividerBefore: true }),
          action('outdent', t('noteDetail.editor.outdent'), icon.noteDetail.toolbar.outdent),
          action('clearFormatting', t('noteDetail.editor.clearFormatting'), icon.noteDetail.toolbar.clearFormat),
          action('findReplace', t('noteDetail.editor.findReplace'), icon.noteDetail.toolbar.search, {
            dividerBefore: true,
          }),
          action('sourceCode', t('noteDetail.editor.sourceCode'), icon.noteDetail.toolbar.source),
          action('wordCount', t('noteDetail.editor.wordCount'), icon.noteDetail.toolbar.wordCount),
        ];
    const desktopFormatActions = isMarkdown
      ? [
          action('quote', t('noteDetail.editor.quote'), icon.noteDetail.toolbar.quote),
          action('strike', t('noteDetail.editor.strike'), icon.noteDetail.toolbar.strike),
          action('inlineCode', t('noteDetail.editor.inlineCode'), icon.noteDetail.toolbar.inlineCode),
        ]
      : [
          action('underline', t('noteDetail.editor.underline'), icon.noteDetail.toolbar.underline, {
            selected: state.underline,
          }),
          action('strike', t('noteDetail.editor.strike'), icon.noteDetail.toolbar.strike, {
            selected: state.strike,
          }),
          action('textColorPicker', t('noteDetail.editor.textColor'), icon.noteDetail.toolbar.textColor),
          action(
            'backgroundColorPicker',
            t('noteDetail.editor.backgroundColor'),
            icon.noteDetail.toolbar.backgroundColor,
          ),
          action('textGradient', t('noteDetail.editor.gradientText'), icon.noteDetail.toolbar.gradientText),
        ];
    const moreActions = isMobile.value
      ? [
          action('redo', t('noteDetail.editor.redo'), icon.noteDetail.toolbar.redo, {
            disabled: disabled || (isMarkdown ? !markdownHistoryState.value.canRedo : !state.canRedo),
            description: t('noteDetail.editor.redoDescription'),
            shortcut: 'Ctrl / ⌘ + Shift + Z / Ctrl + Y',
          }),
          toolbarAction('repeatLastAction', t('noteDetail.editor.repeatLast'), icon.noteDetail.toolbar.repeat, {
            disabled: disabled || !currentRepeatableAction.value,
            description: repeatLastActionDescription.value,
            shortcut: repeatLastActionShortcut.value,
          }),
          toolbarAction('shortcuts', t('noteDetail.editor.shortcuts'), icon.settings.shortcuts, {
            dividerBefore: true,
            description: t('noteDetail.editor.shortcutsDescription'),
          }),
          action('italic', t('noteDetail.editor.italic'), icon.noteDetail.toolbar.italic, {
            dividerBefore: true,
            selected: !isMarkdown && state.italic,
          }),
          ...listActions,
          action('link', t('noteDetail.editor.link'), icon.noteDetail.toolbar.link),
          ...formatMoreActions.map((item, index) => (index === 0 ? { ...item, dividerBefore: true } : item)),
        ]
      : formatMoreActions;

    return {
      undoAction: action('undo', t('noteDetail.editor.undo'), icon.noteDetail.toolbar.undo, {
        disabled: disabled || (isMarkdown ? !markdownHistoryState.value.canUndo : !state.canUndo),
        shortcut: 'Ctrl / ⌘ + Z',
      }),
      redoAction: action('redo', t('noteDetail.editor.redo'), icon.noteDetail.toolbar.redo, {
        disabled: disabled || (isMarkdown ? !markdownHistoryState.value.canRedo : !state.canRedo),
        description: t('noteDetail.editor.redoDescription'),
        shortcut: 'Ctrl / ⌘ + Shift + Z / Ctrl + Y',
      }),
      repeatAction: toolbarAction(
        'repeatLastAction',
        t('noteDetail.editor.repeatLast'),
        icon.noteDetail.toolbar.repeat,
        {
          disabled: disabled || !currentRepeatableAction.value,
          description: repeatLastActionDescription.value,
          shortcut: repeatLastActionShortcut.value,
        },
      ),
      headingAction: action('headingMenu', t('noteDetail.editor.headingMenu'), icon.noteDetail.toolbar.heading, {
        selected: !isMarkdown && /^h[1-6]$/u.test(state.block),
      }),
      boldAction: action('bold', t('noteDetail.editor.bold'), icon.noteDetail.toolbar.bold, {
        selected: !isMarkdown && state.bold,
        shortcut: 'Ctrl / ⌘ + B',
      }),
      italicAction: action('italic', t('noteDetail.editor.italic'), icon.noteDetail.toolbar.italic, {
        selected: !isMarkdown && state.italic,
        shortcut: 'Ctrl / ⌘ + I',
      }),
      listAction: action('listMenu', t('noteDetail.editor.list'), icon.noteDetail.toolbar.bulletList, {
        selected: !isMarkdown && (state.bulletList || state.orderedList),
      }),
      todoAction: action('todo', t('noteDetail.editor.todo'), icon.noteDetail.toolbar.todo, {
        selected: !isMarkdown && state.todo,
      }),
      linkAction: action('link', t('noteDetail.editor.link'), icon.noteDetail.toolbar.link, {
        shortcut: 'Ctrl / ⌘ + K',
      }),
      insertAction: action('insertMenu', t('noteDetail.editor.insert'), icon.noteDetail.toolbar.insert),
      moreAction: action('moreMenu', t('noteDetail.editor.moreFormatting'), icon.noteDetail.toolbar.more),
      shortcutsAction: toolbarAction('shortcuts', t('noteDetail.editor.shortcuts'), icon.settings.shortcuts, {
        description: t('noteDetail.editor.shortcutsDescription'),
      }),
      headingActions,
      listActions,
      insertActions,
      moreActions,
      desktopFormatActions,
    };
  });

  function markdownHeadingEdit(level: number) {
    const prefix = level > 0 ? `${'#'.repeat(level)} ` : '';
    return applyMarkdownEdit((input) => setLinePrefix(input, prefix, /^#{1,6}\s+/u));
  }

  function openRichResourceMentionPicker(editor: any) {
    if (!canEditResourceMentions.value || !editor) return;
    editor.focus();
    editor.undoManager?.transact(() => editor.insertContent('@'));
    window.setTimeout(() => tryOpenTinyMceMention(editor), 0);
  }

  const markdownRepeatableActionKeys = new Set([
    'bold',
    'italic',
    'todo',
    'bulletList',
    'orderedList',
    'paragraph',
    'quote',
    'strike',
    'inlineCode',
    ...Array.from({ length: 6 }, (_, index) => `heading${index + 1}`),
  ]);
  const richRepeatableActionKeys = new Set([
    'bold',
    'italic',
    'underline',
    'strike',
    'todo',
    'bulletList',
    'orderedList',
    'paragraph',
    'alignLeft',
    'alignCenter',
    'alignRight',
    'alignJustify',
    'indent',
    'outdent',
    'clearFormatting',
    'removeTextColor',
    'removeBackgroundColor',
    'removeTextGradient',
    ...Array.from({ length: 6 }, (_, index) => `heading${index + 1}`),
  ]);

  function runMarkdownToolbarAction(key: string, options: { remember?: boolean } = {}) {
    if (props.readonly || mdView.value === 'preview') return;
    if (options.remember !== false && markdownRepeatableActionKeys.has(key)) {
      rememberRepeatableAction('markdown', { key });
    }
    if (key === 'undo') return void mdCodeMirrorRef.value?.undo();
    if (key === 'redo') return void mdCodeMirrorRef.value?.redo();
    if (key === 'bold')
      return void applyMarkdownEdit((input) => wrapSelection(input, '**', t('note.mdBoldPlaceholder')));
    if (key === 'italic')
      return void applyMarkdownEdit((input) => wrapSelection(input, '*', t('note.mdItalicPlaceholder')));
    if (key === 'todo') return void applyMarkdownEdit((input) => toggleLinePrefix(input, '- [ ] '));
    if (key === 'bulletList') return void applyMarkdownEdit((input) => toggleLinePrefix(input, '- '));
    if (key === 'orderedList') return void applyMarkdownEdit((input) => toggleLinePrefix(input, '1. '));
    if (key === 'paragraph') return void markdownHeadingEdit(0);
    if (/^heading[1-6]$/u.test(key)) return void markdownHeadingEdit(Number(key.slice(-1)));
    if (key === 'link') return void applyMarkdownEdit((input) => insertMarkdownLink(input, t('note.mdLinkText')));
    if (key === 'quote') return void applyMarkdownEdit((input) => toggleLinePrefix(input, '> '));
    if (key === 'strike')
      return void applyMarkdownEdit((input) => wrapSelection(input, '~~', t('note.mdStrikePlaceholder')));
    if (key === 'inlineCode')
      return void applyMarkdownEdit((input) => wrapSelection(input, '`', t('note.mdCodePlaceholder')));
    if (key === 'insertTable') {
      return void applyMarkdownEdit((input) =>
        insertBlock(
          input,
          buildMarkdownTable([t('note.mdTableColumn', { index: 1 }), t('note.mdTableColumn', { index: 2 })]),
        ),
      );
    }
    if (key === 'insertImage') return openMarkdownImageInsert();
    if (key === 'insertMediaText') return openMarkdownMediaTextInsert();
    if (key === 'insertFile') return openNoteFileUpload();
    if (key === 'insertResource') return openResourceMentionPicker();
    if (key === 'insertCodeBlock') return void applyMarkdownEdit((input) => insertBlock(input, buildCodeBlock()));
    if (key.startsWith('insertDiagram:')) return insertDiagramTemplate(key.slice('insertDiagram:'.length));
    if (key === 'insertDivider') return void applyMarkdownEdit((input) => insertBlock(input, '---'));
    if (key === 'findReplace') {
      openRichFind();
      return;
    }
  }

  function runRichToolbarAction(key: string, options: { remember?: boolean } = {}) {
    const editor = editorRef.value;
    if (!editor || props.readonly) return;
    editor.focus();
    if (
      options.remember !== false &&
      (richRepeatableActionKeys.has(key) || key.startsWith('textColor:') || key.startsWith('backgroundColor:'))
    ) {
      rememberRepeatableAction('html', { key });
    }
    if (key === 'undo') return editor.execCommand('Undo');
    if (key === 'redo') return editor.execCommand('Redo');
    if (key === 'bold') return editor.execCommand('Bold');
    if (key === 'italic') return editor.execCommand('Italic');
    if (key === 'underline') return editor.execCommand('Underline');
    if (key === 'strike') return editor.execCommand('Strikethrough');
    if (key === 'todo') return editor.execCommand('ToggleNoteTodo');
    if (key === 'bulletList') return editor.execCommand('InsertUnorderedList');
    if (key === 'orderedList') return editor.execCommand('InsertOrderedList');
    if (key === 'paragraph') return editor.execCommand('FormatBlock', false, 'p');
    if (/^heading[1-6]$/u.test(key)) return editor.execCommand('FormatBlock', false, `h${key.slice(-1)}`);
    if (key === 'link') return editor.execCommand('mceLink');
    if (key === 'insertTable') return editor.execCommand('mceInsertTableDialog');
    if (key === 'insertImage') return openRichImageInsert();
    if (key === 'insertMediaText') return openRichMediaTextInsert();
    if (key === 'insertFile') return openNoteFileUpload();
    if (key === 'insertResource') return openRichResourceMentionPicker(editor);
    if (key === 'insertCodeBlock') return editor.execCommand('codesample');
    if (key.startsWith('insertDiagram:')) return insertHtmlDiagramTemplate(editor, key.slice('insertDiagram:'.length));
    if (key === 'insertDivider') return editor.insertContent('<hr><p></p>');
    if (key === 'insertEmoji') return editor.execCommand('mceEmoticons');
    if (key === 'textColorPicker') return openRichColorDialog('text', editor);
    if (key === 'textGradient') return openRichTextGradientDialog(editor);
    if (key === 'backgroundColorPicker') return openRichColorDialog('background', editor);
    if (key.startsWith('textColor:')) {
      const value = key.slice('textColor:'.length);
      return value === 'default'
        ? editor.execCommand('mceRemoveTextcolor', 'forecolor')
        : editor.execCommand('mceApplyTextcolor', 'forecolor', value);
    }
    if (key.startsWith('backgroundColor:')) {
      const value = key.slice('backgroundColor:'.length);
      return value === 'default'
        ? editor.execCommand('mceRemoveTextcolor', 'hilitecolor')
        : editor.execCommand('mceApplyTextcolor', 'hilitecolor', value);
    }
    if (key === 'alignLeft') return editor.execCommand('JustifyLeft');
    if (key === 'alignCenter') return editor.execCommand('JustifyCenter');
    if (key === 'alignRight') return editor.execCommand('JustifyRight');
    if (key === 'alignJustify') return editor.execCommand('JustifyFull');
    if (key === 'indent') return editor.execCommand('Indent');
    if (key === 'outdent') return editor.execCommand('Outdent');
    if (key === 'clearFormatting') return editor.execCommand('RemoveFormat');
    if (key === 'findReplace') return openRichFind(editor);
    if (key === 'sourceCode') return editor.execCommand('mceCodeEditor');
    if (key === 'wordCount') return editor.execCommand('mceWordCount');
    if (key === 'removeTextColor') return editor.execCommand('mceRemoveTextcolor', 'forecolor');
    if (key === 'removeBackgroundColor') return editor.execCommand('mceRemoveTextcolor', 'hilitecolor');
    if (key === 'removeTextGradient') return removeRichTextGradientFromCurrentSelection(editor);
  }

  function repeatLastEditorAction() {
    const action = currentRepeatableAction.value;
    if (!action || props.readonly) return;
    if (currentType.value === 'markdown') {
      runMarkdownToolbarAction(action.key, { remember: false });
      return;
    }
    if (action.key === 'textGradient' && action.gradient) {
      applyRichTextGradientToCurrentSelection(action.gradient);
      return;
    }
    runRichToolbarAction(action.key, { remember: false });
  }

  function handleRepeatLastEditorActionShortcut(event: KeyboardEvent) {
    if (!matchesRepeatLastActionShortcut(event)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    repeatLastEditorAction();
    return true;
  }

  function handleHeadingEditorShortcut(event: KeyboardEvent) {
    const level = matchHeadingShortcut(event);
    if (!level) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    runRichToolbarAction(`heading${level}`);
    return true;
  }

  function handleInlineFormatEditorShortcut(event: KeyboardEvent) {
    const action = matchEditorInlineFormatShortcut(event);
    if (!action) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    runRichToolbarAction(action);
    return true;
  }

  function openRichColorDialog(mode: RichColorMode, editor = editorRef.value) {
    if (!editor || props.readonly) return;
    richColorMode.value = mode;
    richColorValue.value = mode === 'text' ? '#2563eb' : '#dbeafe';
    richColorBookmark = editor.selection?.getBookmark?.(2, true) ?? null;
    richColorDialogVisible.value = true;
  }

  function closeRichColorDialog() {
    richColorBookmark = null;
  }

  function restoreRichColorSelection(editor: any) {
    editor.focus();
    if (richColorBookmark) editor.selection?.moveToBookmark?.(richColorBookmark);
  }

  function removeRichColor() {
    const editor = editorRef.value;
    if (!editor || props.readonly) {
      richColorDialogVisible.value = false;
      return;
    }
    restoreRichColorSelection(editor);
    const format = richColorMode.value === 'text' ? 'forecolor' : 'hilitecolor';
    editor.execCommand('mceRemoveTextcolor', format);
    rememberRepeatableAction('html', {
      key: richColorMode.value === 'text' ? 'removeTextColor' : 'removeBackgroundColor',
    });
    richColorDialogVisible.value = false;
    richColorBookmark = null;
  }

  function applyRichCustomColor() {
    const editor = editorRef.value;
    const value = richColorValue.value.trim();
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(value)) {
      message.warning(t('noteDetail.editor.colorInvalid'));
      return;
    }
    if (!editor || props.readonly) {
      richColorDialogVisible.value = false;
      return;
    }
    restoreRichColorSelection(editor);
    const format = richColorMode.value === 'text' ? 'forecolor' : 'hilitecolor';
    editor.execCommand('mceApplyTextcolor', format, value);
    rememberRepeatableAction('html', {
      key: `${richColorMode.value === 'text' ? 'textColor' : 'backgroundColor'}:${value}`,
    });
    richColorDialogVisible.value = false;
    richColorBookmark = null;
  }

  function resolveRichTextGradientTarget(editor: any) {
    const node = editor?.selection?.getNode?.();
    return node instanceof Element ? node.closest<HTMLElement>('.ln-text-gradient') : null;
  }

  function openRichTextGradientDialog(editor = editorRef.value) {
    if (!editor || props.readonly) return;
    richTextGradientBookmark = editor.selection?.getBookmark?.(2, true) ?? null;
    richTextGradientTarget = resolveRichTextGradientTarget(editor);
    const current = readTextGradientConfig(richTextGradientTarget);
    richTextGradientFrom.value = current?.from || DEFAULT_TEXT_GRADIENT.from;
    richTextGradientTo.value = current?.to || DEFAULT_TEXT_GRADIENT.to;
    richTextGradientAngle.value = (current?.angle || DEFAULT_TEXT_GRADIENT.angle) as TextGradientAngle;
    richTextGradientEditingExisting.value = Boolean(current);
    richTextGradientDialogVisible.value = true;
  }

  function closeRichTextGradientDialog() {
    richTextGradientBookmark = null;
    richTextGradientTarget = null;
    richTextGradientEditingExisting.value = false;
  }

  function applyRichTextGradientPreset(preset: (typeof richTextGradientPresets)[number]) {
    richTextGradientFrom.value = preset.from;
    richTextGradientTo.value = preset.to;
  }

  function restoreRichTextGradientSelection(editor: any) {
    editor.focus();
    if (richTextGradientBookmark) editor.selection?.moveToBookmark?.(richTextGradientBookmark);
  }

  function applyRichTextGradient() {
    const editor = editorRef.value;
    const config = normalizeTextGradientConfig({
      from: richTextGradientFrom.value,
      to: richTextGradientTo.value,
      angle: richTextGradientAngle.value,
    });
    if (!config) {
      message.warning(t('noteDetail.editor.gradientColorInvalid'));
      return;
    }
    if (!editor || props.readonly) {
      richTextGradientDialogVisible.value = false;
      return;
    }

    restoreRichTextGradientSelection(editor);
    const body = editor.getBody?.() as HTMLElement | null;
    const liveTarget =
      richTextGradientTarget?.isConnected && body?.contains(richTextGradientTarget) ? richTextGradientTarget : null;
    const selectedHtml = liveTarget ? '' : String(editor.selection?.getContent?.({ format: 'html' }) || '');
    const selectedText = liveTarget ? '' : String(editor.selection?.getContent?.({ format: 'text' }) || '').trim();
    if (!liveTarget && !selectedText) {
      message.warning(t('noteDetail.editor.gradientSelectText'));
      return;
    }

    editor.undoManager?.transact(() => {
      if (liveTarget) {
        applyTextGradientConfig(liveTarget, config);
        editor.selection?.select?.(liveTarget, true);
      } else {
        const html = createTextGradientHtml(selectedHtml, config);
        if (html) editor.selection?.setContent?.(html);
      }
    });
    notifyRichMediaTextMutation(editor);
    rememberRepeatableAction('html', {
      key: 'textGradient',
      gradient: { from: config.from, to: config.to, angle: config.angle },
    });
    richTextGradientDialogVisible.value = false;
    closeRichTextGradientDialog();
  }

  function removeRichTextGradient() {
    const editor = editorRef.value;
    if (!editor || props.readonly) {
      richTextGradientDialogVisible.value = false;
      return;
    }
    restoreRichTextGradientSelection(editor);
    const body = editor.getBody?.() as HTMLElement | null;
    const target =
      richTextGradientTarget?.isConnected && body?.contains(richTextGradientTarget) ? richTextGradientTarget : null;
    if (!target) {
      message.warning(t('noteDetail.editor.gradientTargetChanged'));
      return;
    }
    editor.undoManager?.transact(() => editor.dom.remove(target, true));
    notifyRichMediaTextMutation(editor);
    rememberRepeatableAction('html', { key: 'removeTextGradient' });
    richTextGradientDialogVisible.value = false;
    closeRichTextGradientDialog();
  }

  function applyRichTextGradientToCurrentSelection(storedConfig: StoredTextGradient) {
    const editor = editorRef.value;
    const config = normalizeTextGradientConfig(storedConfig);
    if (!editor || !config || props.readonly) return;
    editor.focus();
    const target = resolveRichTextGradientTarget(editor);
    const selectedHtml = target ? '' : String(editor.selection?.getContent?.({ format: 'html' }) || '');
    const selectedText = target ? '' : String(editor.selection?.getContent?.({ format: 'text' }) || '').trim();
    if (!target && !selectedText) {
      message.warning(t('noteDetail.editor.gradientSelectText'));
      return;
    }
    editor.undoManager?.transact(() => {
      if (target) {
        applyTextGradientConfig(target, config);
        editor.selection?.select?.(target, true);
      } else {
        const html = createTextGradientHtml(selectedHtml, config);
        if (html) editor.selection?.setContent?.(html);
      }
    });
    notifyRichMediaTextMutation(editor);
  }

  function removeRichTextGradientFromCurrentSelection(editor = editorRef.value) {
    if (!editor || props.readonly) return;
    editor.focus();
    const target = resolveRichTextGradientTarget(editor);
    if (!target) {
      message.warning(t('noteDetail.editor.gradientTargetChanged'));
      return;
    }
    editor.undoManager?.transact(() => editor.dom.remove(target, true));
    notifyRichMediaTextMutation(editor);
  }

  function handleEditorToolbarAction(action: EditorToolbarAction) {
    if (action.disabled) return;
    if (action.key === 'shortcuts') {
      shortcutHelpVisible.value = true;
      return;
    }
    if (action.key === 'repeatLastAction') {
      repeatLastEditorAction();
      return;
    }
    if (currentType.value === 'markdown') runMarkdownToolbarAction(action.key);
    else runRichToolbarAction(action.key);
  }

  /** 富文本里插入图表:存的是源码代码块,图是编辑期装饰(见 utils/mermaidRender 的伴随模式) */
  function insertHtmlDiagramTemplate(editor: any, templateKey: string) {
    const template = MERMAID_TEMPLATES.find((item) => item.key === templateKey);
    if (!template || props.readonly) return;
    const code = locale.value.startsWith('zh') ? template.code.zh : template.code.en;
    const escaped = code.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] as string);
    editor.insertContent(`<pre class="language-mermaid">${escaped}</pre><p></p>`);
    // 同一事件循环内先挂上 companion 占位，再异步绘图。源码块会立刻被相邻选择器隐藏，
    // 避免用户看到「代码块闪一下 → 图表」；真实源码仍留在 TinyMCE 内容中。
    const body = editor.getBody?.() as HTMLElement | null;
    if (body) void renderMermaidBlocks(body, { companion: true });
  }

  function openRichMermaidEditor(event: Event) {
    if (props.readonly) return;
    const target = event.target;
    const figure = target instanceof Element ? target.closest<HTMLElement>('.mermaid-figure--companion') : null;
    const sourceElement = figure?.previousElementSibling as HTMLElement | null;
    if (!sourceElement?.matches('pre[class*="language-mermaid"]')) return;
    event.preventDefault();
    const source = sourceElement.textContent || '';
    richMermaidSourceElement = sourceElement;
    richMermaidOriginalSource = source;
    richMermaidSource.value = source;
    richMermaidEditorVisible.value = true;
  }

  function closeRichMermaidEditor() {
    richMermaidSourceElement = null;
    richMermaidOriginalSource = '';
    richMermaidSource.value = '';
  }

  function applyRichMermaidSource() {
    const editor = editorRef.value;
    const sourceElement = richMermaidSourceElement;
    const nextSource = richMermaidSource.value.replace(/\r\n?/gu, '\n');
    if (!nextSource.trim()) {
      message.warning(t('noteDetail.editor.diagramSourceEmpty'));
      return;
    }
    const body = editor?.getBody?.() as HTMLElement | null;
    if (
      !editor ||
      !body ||
      !sourceElement?.isConnected ||
      !body.contains(sourceElement) ||
      sourceElement.textContent !== richMermaidOriginalSource
    ) {
      message.warning(t('noteDetail.editor.diagramSourceChanged'));
      richMermaidEditorVisible.value = false;
      closeRichMermaidEditor();
      return;
    }

    editor.undoManager.transact(() => {
      // 用 textContent 写回，图表源码绝不会被当成 HTML 执行。
      sourceElement.textContent = nextSource;
      editor.nodeChanged?.();
      editor.setDirty?.(true);
      if (editor.dispatch) editor.dispatch('input');
      else editor.fire?.('input');
    });
    richMermaidEditorVisible.value = false;
    closeRichMermaidEditor();
    void renderMermaidBlocks(body, { companion: true });
  }

  watch([mentionPickerVisible, inlineMentionVisible], ([modalOpen, inlineOpen]) => {
    if (modalOpen || inlineOpen) return;
    markdownMentionRange = null;
    clearTinyMceMentionSelection();
    inlineMentionQuery.value = '';
  });

  function debounceRenderMd() {
    if (mdRenderTimer) clearTimeout(mdRenderTimer);
    mdRenderTimer = setTimeout(() => {
      renderMd();
    }, 200);
  }

  async function renderMd() {
    if (!markedLib) await ensureMdLib();
    try {
      const safeHtml = mdToSafeHtml(mdContent.value || '');
      publishResourceRefs(safeHtml);
      const indexedSafeHtml = decorateRenderedMarkdownImageIndexes(safeHtml);
      // 已经画过的图直接用缓存顶上;改了图表内容、缓存还没有时沿用上一版预览里的旧图,
      // 都是为了不让右边的图在编辑过程中闪回代码块
      renderedMd.value = inlineCachedMermaid(
        presentResourceReferenceChips(indexedSafeHtml, props.resourceRefs, resourcePresentationOptions()),
        mdPreviewRef.value,
      );
    } catch {
      renderedMd.value = '<p>' + t('note.renderError') + '</p>';
      publishResourceRefs('');
    }
    await nextTick();
    prepareNoteContentPreviewImages(mdPreviewRef.value, t('noteDetail.editor.imagePreview'));
    emits('markdown-rendered');
  }

  function lockProgrammaticMarkdownScroll() {
    isProgrammaticMdScroll = true;
    // 若浏览器没有产生 scroll 事件，也能自动释放；有事件时会以上面的短防抖续期。
    scheduleProgrammaticMarkdownScrollUnlock(900);
  }

  async function scrollToMarkdownHeading(index: number, sourceOffset?: number) {
    if (currentType.value !== 'markdown') return false;
    await nextTick();

    const markdownEditor = mdCodeMirrorRef.value;
    const preview = mdPreviewRef.value;
    const previewHeading = preview?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')[index];
    if (!markdownEditor && (!preview || !previewHeading)) return false;

    lockProgrammaticMarkdownScroll();

    if (preview && previewHeading && preview.offsetParent !== null) {
      scrollIntoContainer(preview, previewHeading, 5);
    }

    if (markdownEditor && typeof sourceOffset === 'number') {
      const safeOffset = Math.min(Math.max(0, sourceOffset), markdownEditor.getValue().length);
      window.requestAnimationFrame(() => markdownEditor.scrollToPosition(safeOffset));
    }

    return true;
  }

  async function scrollToResourceRef(href: string) {
    if (!href) return false;
    await nextTick();
    if (currentType.value === 'markdown') {
      const markdownEditor = mdCodeMirrorRef.value;
      const previewLink = [...(mdPreviewRef.value?.querySelectorAll<HTMLAnchorElement>('a[href]') || [])].find(
        (link) => link.getAttribute('href') === href,
      );
      let found = false;
      if (previewLink && mdPreviewRef.value && previewLink.offsetParent !== null) {
        scrollIntoContainer(mdPreviewRef.value, previewLink, 8);
        found = true;
      }
      const sourceOffset = markdownEditor?.getValue().indexOf(href) ?? -1;
      if (markdownEditor && sourceOffset >= 0) {
        lockProgrammaticMarkdownScroll();
        markdownEditor.scrollToPosition(sourceOffset, sourceOffset + href.length);
        found = true;
      }
      return found;
    }
    const editor = editorRef.value;
    const body = editor?.getBody?.() as HTMLElement | undefined;
    const link = [...(body?.querySelectorAll<HTMLAnchorElement>('a[href]') || [])].find(
      (item) => item.getAttribute('href') === href,
    );
    if (!link) return false;
    editor.focus();
    editor.selection?.select?.(link);
    link.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try {
      link.animate(
        [
          {
            backgroundColor: 'color-mix(in srgb, var(--primary-color) 24%, transparent)',
            outline: '2px solid var(--primary-color)',
          },
          { backgroundColor: 'transparent', outline: '2px solid transparent' },
        ],
        { duration: 2200, easing: 'ease-out' },
      );
    } catch {
      // Older WebViews may not support Web Animations or color-mix; navigation itself has already succeeded.
    }
    return true;
  }

  // 切换模式
  async function handleModeSwitch() {
    const sourceType = (currentType.value === 'markdown' ? 'markdown' : 'html') as NoteFormat;
    const targetType: NoteFormat = sourceType === 'html' ? 'markdown' : 'html';
    const backup = { content: content.value || '', type: sourceType };
    await ensureMdLib();
    let converted = '';
    if (targetType === 'markdown') {
      converted = noteHtmlToMarkdown(backup.content || '');
    } else if (backup.content.trim()) {
      try {
        converted = mdToSafeHtml(backup.content, true);
      } catch {
        message.error(t('note.renderError'));
        return;
      }
    }
    conversionTargetType.value = targetType;
    conversionBackup.value = backup;
    conversionConvertedContent.value = converted;
    conversionReport.value = analyzeNoteFormatConversion(backup.content, sourceType);
    conversionBaseRevision.value = Math.max(1, Number(props.revision || 1));
    conversionAnalysisHash.value = await buildNoteFormatConversionAnalysisHash({
      targetType,
      convertedContent: converted,
      baseRevision: conversionBaseRevision.value,
    });
    conversionPreviewVisible.value = true;
  }

  function cancelModeSwitch() {
    if (conversionSaving.value) return;
    conversionPreviewVisible.value = false;
    conversionBackup.value = null;
    conversionConvertedContent.value = '';
    conversionReport.value = null;
    conversionAnalysisHash.value = '';
  }

  async function confirmModeSwitch() {
    const backup = conversionBackup.value;
    if (!backup || conversionSaving.value) return;
    const targetType = conversionTargetType.value;
    let converted = conversionConvertedContent.value;
    let persisted: { content: string; type: NoteFormat; revision: number; updateTime?: number | string | null } | null =
      null;
    if (props.noteId && props.persistModeConversion) {
      conversionSaving.value = true;
      try {
        persisted = await props.persistModeConversion({
          targetType,
          convertedContent: converted,
          baseRevision: conversionBaseRevision.value,
          analysisHash: conversionAnalysisHash.value,
        });
      } finally {
        conversionSaving.value = false;
      }
      if (!persisted) {
        cancelModeSwitch();
        return;
      }
      converted = persisted.content;
    }
    cancelModeSwitch();
    await doSwitch(targetType, backup, converted);
    if (persisted) emits('mode-converted', persisted);
  }

  async function doSwitch(
    targetType: NoteFormat,
    backup: { content: string; type: NoteFormat },
    preconvertedContent?: string,
  ) {
    let nextContent = preconvertedContent;
    if (targetType === 'markdown' && nextContent === undefined) {
      try {
        nextContent = noteHtmlToMarkdown(backup.content || '');
      } catch {
        message.error(t('note.renderError'));
        return;
      }
    }
    if (targetType !== 'markdown' && nextContent === undefined) {
      await ensureMdLib();
      try {
        nextContent = backup.content.trim() ? mdToSafeHtml(backup.content, true) : '';
      } catch {
        message.error(t('note.renderError'));
        return;
      }
    }
    switchBackup.value = backup;
    if (currentType.value === 'html' && targetType !== 'html') prepareRichEditorForUnmount();
    currentType.value = targetType;

    if (targetType === 'markdown') {
      // HTML → MD：用 turndown 转换
      mdContent.value = nextContent || '';
      content.value = mdContent.value;
      await nextTick();
      renderMd();
    } else {
      // MD → HTML：用 marked 转换
      content.value = nextContent || '';
      // 重建 TinyMCE
      forceReinit();
    }

    emits('update:type', targetType);
  }

  function undoSwitch() {
    if (!switchBackup.value) return;
    const backup = switchBackup.value;
    const targetLabel = backup.type === 'html' ? 'HTML' : 'Markdown';
    Alert.alert({
      title: t('note.undoSwitchTitle'),
      content: t('note.undoSwitchConfirm', { mode: targetLabel }),
      okText: t('note.confirmUndo'),
      cancelText: t('common.cancel'),
      onOk: () => doUndo(backup),
    });
  }

  async function doUndo(backup: { content: string; type: NoteFormat }) {
    let restoredContent = backup.content;
    let persisted: { content: string; type: NoteFormat; revision: number; updateTime?: number | string | null } | null =
      null;
    if (props.noteId && props.persistModeConversion) {
      const baseRevision = Math.max(1, Number(props.revision || 1));
      const analysisHash = await buildNoteFormatConversionAnalysisHash({
        targetType: backup.type,
        convertedContent: backup.content,
        baseRevision,
      });
      persisted = await props.persistModeConversion({
        targetType: backup.type,
        convertedContent: backup.content,
        baseRevision,
        analysisHash,
      });
      if (!persisted) return;
      restoredContent = persisted.content;
    }
    switchBackup.value = null;

    if (currentType.value === 'html' && backup.type !== 'html') prepareRichEditorForUnmount();
    currentType.value = backup.type;

    if (backup.type === 'html') {
      content.value = restoredContent;
      forceReinit();
    } else {
      mdContent.value = restoredContent;
      content.value = restoredContent;
      if (markedLib) renderMd();
    }

    emits('update:type', backup.type);
    if (persisted) emits('mode-converted', persisted);
  }

  const ensureToolbar = async () => {
    await nextTick();
    const toolbarEl = document.getElementById('editor-toolbar');
    if (!toolbarEl) {
      editorKey.value += 1;
      editorReady.value = false;
      await nextTick();
    }
    editorReady.value = true;
  };

  const ensureToolbarRendered = async () => {
    // V2 工具栏由 Vue 自己渲染，TinyMCE 已显式 toolbar:false，不再存在 .tox-toolbar。
    // 旧逻辑若继续以 .tox-toolbar 是否存在作为门禁，会在每次 init / 可见性回调时
    // 无限销毁并重建编辑器，表现为正文空白、点击后焦点立即消失。
    await nextTick();
    if (currentType.value === 'html' && !editorReady.value) editorReady.value = true;
  };

  const currentLang = computed(() => i18n.global.locale.value);
  const isNightTheme = computed(() => user.currentTheme === 'night');

  function handleMarkdownRuntimeReady() {
    if (currentType.value !== 'markdown') return;
    markdownRuntimeReady.value = true;
    emits('ready');
  }

  function handleRichContentUpdate(value: string) {
    // TinyMCE 初始化时会先规范化一次 HTML，并可能在用户尚未操作前发出 update:modelValue。
    // 预览层仍显示服务端正文时忽略这次内部回写，避免正文闪动和误触发自动保存；
    // init 完成后的真实输入继续正常同步。
    if (!richEditorRuntimeReady.value) return;
    content.value = value;
  }

  const forceReinit = async () => {
    if (currentType.value !== 'html') return;
    if (richFindVisible.value) {
      clearRichFindMatches();
      richFindVisible.value = false;
    }
    editorRef.value = null;
    richEditorRuntimeReady.value = false;
    editorKey.value += 1;
    editorReady.value = false;
    await nextTick();
    editorReady.value = true;
  };

  const resetUndoHistory = (editor: any) => {
    editor.undoManager?.clear?.();
    editor.undoManager?.add?.();
    editor.setDirty?.(false);
  };

  const focusToEnd = async () => {
    await nextTick();
    if (currentType.value === 'markdown') return;
    const editor = editorRef.value;
    if (!editor) return;
    editor.focus();
    const body = editor.getBody?.();
    if (body) {
      editor.selection.select(body, true);
      editor.selection.collapse(false);
    }
    editor.undoManager?.add();
    editor.nodeChanged?.();
  };

  const replaceContentWithUndo = async (value: string, inputType: 'html' | 'markdown' = 'html') => {
    await nextTick();
    if (currentType.value === 'markdown') {
      const md = inputType === 'markdown' ? value || '' : noteHtmlToMarkdown(value || '');
      const markdownEditor = mdCodeMirrorRef.value;
      if (markdownEditor) {
        // AI 全文替换作为单个 transaction 进入 CodeMirror history，Ctrl/⌘+Z 可完整撤回。
        markdownEditor.replaceAll(md, true);
      } else {
        mdContent.value = md;
        content.value = md;
      }
      await renderMd();
      return true;
    }
    const editor = editorRef.value;
    if (!editor) return false;
    let html = value || '';
    if (inputType === 'markdown') {
      await ensureMdLib();
      html = mdToSafeHtml(html, true);
    }
    editor.undoManager?.transact(() => {
      editor.setContent(html);
    });
    // setContent 并不保证所有 TinyMCE 版本都会同步触发 v-model 事件；显式更新事实源，
    // 避免界面已替换但保存时仍提交旧正文。
    content.value = html;
    editor.nodeChanged?.();
    return true;
  };

  defineExpose({
    focusToEnd,
    replaceContentWithUndo,
    scrollToMarkdownHeading,
    scrollToResourceRef,
    hasSwitchBackup: switchBackup,
    triggerModeSwitch: () => handleModeSwitch(),
    triggerUndoSwitch: () => undoSwitch(),
  });

  const editorInit = computed(() => ({
    inline: true,
    menubar: false,
    branding: false,
    skin: isNightTheme.value ? 'oxide-dark' : 'oxide',
    skin_url: isNightTheme.value ? `/tinymce/skins/ui/oxide-dark` : `/tinymce/skins/ui/oxide`,
    statusbar: false,
    language: currentLang.value === 'zh-CN' ? 'zh_CN' : 'en',
    language_url: currentLang.value === 'zh-CN' ? '/tinymce/langs/zh_CN.js' : undefined,
    license_key: 'gpl',
    base_url: '/node_modules/tinymce',
    plugins: 'codesample searchreplace autolink autoresize code emoticons image link lists table wordcount quickbars',
    // 移动端富文本把文字长按/选择完全交还给系统菜单(复制/粘贴/全选),只有桌面才用自研划词快捷条。
    // 之前两层自定义菜单会与目标交互冲突:
    //   1. quickbars 选区条只有 copy,没有 paste/全选(浏览器不允许自定义 paste 按钮读剪贴板);
    //   2. contextmenu 不配时 TinyMCE 用默认值 'link linkchecker image editimage table
    //      spellchecker configurepermanentpen',图片右键/长按会先出现「链接 / 图片」菜单,
    //      而不是项目已经提供的图片对象快捷条。
    // contextmenu: false 在所有设备关闭 TinyMCE 默认菜单；图片事件由下方守卫统一唤起
    // imageselection 快捷条。桌面编辑态由同一守卫阻止浏览器系统菜单，避免它和划词快捷条重叠；
    // 移动端长按与只读正文仍交给系统菜单，保留复制、粘贴和全选能力。
    // 格式化能力不受影响:移动端仍有底部主工具栏 #editor-toolbar。
    quickbars_selection_toolbar: usesNativeTextSelectionMenu.value
      ? false
      : 'aiEdit | myHeadingMenu | bold italic forecolor backcolor | removeformat | quicklink',
    quickbars_insert_toolbar: false,
    // 普通图片快捷条在 setup 中按节点类型自行注册，避免 quickbars 把图文组合里的图片
    // 也识别成普通图片，再和图文组合设置条叠出第二层菜单。
    quickbars_image_toolbar: false,
    contextmenu: false,
    // 移动端不启用 TinyMCE 的触摸缩放手柄；单击图片后由轻笺底部面板调整尺寸，
    // 避免长按图片/文字时抢走系统复制粘贴菜单。桌面端仍保留原生图片拖拽手柄。
    object_resizing: usesNativeTextSelectionMenu.value ? false : 'img',
    codesample_languages: CODE_LANGUAGES.map((lang) => ({ text: lang.text, value: lang.value })),
    extended_valid_elements:
      'input[type|class|checked|data-note-task],a[href|contenteditable|title|data-ln-resource-type|data-ln-resource-id|data-ln-resource-snapshot-title|data-ln-resource-display-title|data-ln-resource-state|class|aria-disabled],img[src|alt|title|class|style|width|height|data-ln-size],span[class|style|data-ln-text-gradient],section[class|data-ln-media-position|data-ln-media-width|data-ln-media-inserting],figure[class],figcaption[class]',
    // 主工具栏由 EditorToolbarV2 统一渲染，TinyMCE 只负责命令、对话框和桌面划词快捷条。
    toolbar: false,
    placeholder: t('note.contentPlaceholder'),
    readonly: false,
    content_css: false,
    emoticons_database_url: '/tinymce/plugins/emoticons/js/emojis.js',
    paste_data_images: true,
    convert_urls: false,
    automatic_uploads: props.imageUploadMode !== 'base64',
    ...(props.imageUploadMode === 'base64'
      ? {}
      : {
          images_upload_handler: (blobInfo: any) =>
            uploadNoteImageFile(blobInfo.blob(), blobInfo.filename()).catch(() =>
              Promise.reject(t('note.uploadFailed')),
            ),
        }),
    setup: (editor: any) => {
      editorRef.value = editor;
      let richImageClipboardHtml = '';
      let contextToolbarAdjustFrame: number | null = null;
      let contextToolbarAdjustTimer: number | null = null;
      let contextToolbarScrollContainer: HTMLElement | null = null;

      const clearContextToolbarAdjustments = () => {
        document.querySelectorAll<HTMLElement>('.tox-pop[data-ln-context-toolbar-original-top]').forEach((popup) => {
          popup.style.top = popup.dataset.lnContextToolbarOriginalTop || '';
          delete popup.dataset.lnContextToolbarOriginalTop;
        });
      };
      const adjustContextToolbarAwayFromMainToolbar = () => {
        contextToolbarAdjustFrame = null;
        clearContextToolbarAdjustments();
        const editorElement = editor.getElement?.() as HTMLElement | null;
        const container = editorElement?.closest<HTMLElement>('#editor-container');
        const toolbar = container?.querySelector<HTMLElement>('.note-editor-toolbar');
        const body = editor.getBody?.() as HTMLElement | null;
        if (!toolbar || !body) return;
        const toolbarRect = toolbar.getBoundingClientRect();
        const iframe = editor.iframeElement as HTMLIFrameElement | null;
        const iframeRect = iframe?.getBoundingClientRect();
        // TinyMCE 的正文选区位于 iframe 的视口坐标系，Quickbars 浮层位于外层页面。
        // 所有命中判断和选区位置都换算到外层视口，避免浮层只避开工具栏却盖住第一行正文。
        const bodyRect = iframeRect || body.getBoundingClientRect();
        const editorViewportTop = iframeRect?.top || 0;
        // 选区几何在 WebKit/TinyMCE 的 inline 模式下偶尔返回 0×0；至少预留一行正文高度，
        // 避免解决了“遮工具栏”后又把第一行选中文字盖住。
        let selectionBottom = toolbarRect.bottom + 28;
        try {
          const range = editor.selection?.getRng?.() as Range | undefined;
          const rects = range ? Array.from(range.getClientRects()) : [];
          const selectionRect = rects.at(-1) || range?.getBoundingClientRect?.();
          if (selectionRect && selectionRect.bottom > 0 && (selectionRect.width > 0 || selectionRect.height > 0)) {
            selectionBottom = editorViewportTop + selectionRect.bottom;
          } else {
            const selectionNode = (editor.selection?.getStart?.() ||
              editor.selection?.getNode?.()) as HTMLElement | null;
            const nodeRect = selectionNode?.getBoundingClientRect?.();
            if (selectionNode && selectionNode !== body && body.contains(selectionNode) && nodeRect?.bottom) {
              selectionBottom = editorViewportTop + nodeRect.bottom;
            }
          }
        } catch {
          // 选区在毁掉过程中可能已离开 DOM，此时只按主工具栏底部避让。
        }
        document.querySelectorAll<HTMLElement>('.tox-pop').forEach((popup) => {
          const rect = popup.getBoundingClientRect();
          if (!rect.width || !rect.height || rect.right < bodyRect.left || rect.left > bodyRect.right) return;
          if (rect.top >= toolbarRect.bottom + 6) return;
          const currentTop = Number.parseFloat(popup.style.top);
          if (!Number.isFinite(currentTop)) return;
          const viewportBottom = document.documentElement.clientHeight;
          const desiredTop = Math.min(
            Math.max(toolbarRect.bottom + 6, selectionBottom + 8),
            Math.max(toolbarRect.bottom + 6, viewportBottom - rect.height - 8),
          );
          const delta = desiredTop - rect.top;
          if (delta <= 0) return;
          popup.dataset.lnContextToolbarOriginalTop = popup.style.top;
          popup.style.top = `${Math.round(currentTop + delta)}px`;
        });
      };
      const scheduleContextToolbarAdjustment = () => {
        if (contextToolbarAdjustFrame !== null) window.cancelAnimationFrame(contextToolbarAdjustFrame);
        if (contextToolbarAdjustTimer !== null) window.clearTimeout(contextToolbarAdjustTimer);
        contextToolbarAdjustFrame = window.requestAnimationFrame(() => {
          contextToolbarAdjustFrame = window.requestAnimationFrame(adjustContextToolbarAwayFromMainToolbar);
        });
        // Quickbars 在 SelectionChange 后还会异步测量宽高并重写 top，稍后再校正一次。
        contextToolbarAdjustTimer = window.setTimeout(() => {
          contextToolbarAdjustTimer = null;
          adjustContextToolbarAwayFromMainToolbar();
        }, 80);
      };
      const tableContextToolbarLabels = [
        t('noteDetail.editor.tableProperties'),
        t('noteDetail.editor.deleteTable'),
        t('noteDetail.editor.insertRowBefore'),
        t('noteDetail.editor.insertRowAfter'),
        t('noteDetail.editor.deleteRow'),
        t('noteDetail.editor.insertColumnBefore'),
        t('noteDetail.editor.insertColumnAfter'),
        t('noteDetail.editor.deleteColumn'),
      ];
      const decorateTableContextToolbar = (event: { toolbarKey?: string } = {}) => {
        if (event.toolbarKey !== 'table') return;
        const applyLabels = () => {
          document.querySelectorAll<HTMLElement>('.tox-pop').forEach((popup) => {
            if (!popup.getBoundingClientRect().width) return;
            const buttons = Array.from(popup.querySelectorAll<HTMLElement>('.tox-tbtn'));
            if (buttons.length !== tableContextToolbarLabels.length) return;
            buttons.forEach((button, index) => {
              const label = tableContextToolbarLabels[index];
              button.setAttribute('aria-label', label);
              // TinyMCE 自带 tooltip 在 inline 上下文浮层中偶尔不会挂载；title 作为稳定的悬停提示兜底。
              button.setAttribute('title', label);
            });
          });
        };
        window.requestAnimationFrame(() => window.requestAnimationFrame(applyLabels));
        window.setTimeout(applyLabels, 80);
      };
      const handleContextToolbarShow = (event: { toolbarKey?: string } = {}) => {
        scheduleContextToolbarAdjustment();
        decorateTableContextToolbar(event);
      };
      editor.on('contexttoolbar-show', handleContextToolbarShow);
      editor.on('SelectionChange', scheduleContextToolbarAdjustment);
      editor.on('contexttoolbar-hide', clearContextToolbarAdjustments);

      const resolveSelectedRichImage = () => {
        const body = editor.getBody?.() as HTMLElement | null;
        if (!body) return null;
        const selectionNode = editor.selection?.getNode?.();
        let image: HTMLImageElement | null = null;
        if (selectionNode instanceof HTMLImageElement) {
          image = selectionNode;
        } else if (selectionNode instanceof Element) {
          image = selectionNode.matches('figure.image')
            ? selectionNode.querySelector<HTMLImageElement>('img')
            : selectionNode.closest<HTMLElement>('figure.image')?.querySelector<HTMLImageElement>('img') || null;
        }
        image ||= body.querySelector<HTMLImageElement>(
          'img[data-mce-selected="1"], figure.image[data-mce-selected="1"] img',
        );
        if (!image?.isConnected || !body.contains(image) || image.closest('.mermaid-figure--companion')) return null;
        return image;
      };

      const serializeRichImageForClipboard = (image: HTMLImageElement) => {
        const clone = image.cloneNode(true) as HTMLImageElement;
        Array.from(clone.attributes).forEach((attribute) => {
          if (attribute.name.startsWith('data-mce-') || attribute.name === 'contenteditable') {
            clone.removeAttribute(attribute.name);
          }
        });
        clone.classList.remove('mce-object-selected');
        if (!clone.className) clone.removeAttribute('class');
        return clone.outerHTML;
      };

      const tryCopyRichImageToSystemClipboard = (image: HTMLImageElement) => {
        editor.focus();
        editor.selection?.select?.(image);
        try {
          const doc = editor.getDoc?.() as Document | null;
          if (!doc?.queryCommandSupported?.('copy')) return false;
          return Boolean(doc.execCommand('copy'));
        } catch {
          // Android WebView / 卓易通可能禁止网页直接写系统剪贴板；内部图片剪贴板仍然可用。
          return false;
        }
      };

      const captureRichImage = (image: HTMLImageElement) => {
        richImageClipboardHtml = serializeRichImageForClipboard(image);
        tryCopyRichImageToSystemClipboard(image);
      };

      const notifyRichImageMutation = () => {
        editor.nodeChanged?.();
        editor.setDirty?.(true);
        if (editor.dispatch) editor.dispatch('input');
        else editor.fire?.('input');
      };

      const createRichImageCaretParagraph = () => {
        const paragraph = editor.dom.create('p', {}) as HTMLParagraphElement;
        paragraph.appendChild(editor.dom.create('br', { 'data-mce-bogus': '1' }));
        return paragraph;
      };

      const resolveRichImageBlockAnchor = (image: HTMLImageElement) => {
        const body = editor.getBody?.() as HTMLElement | null;
        const block = editor.dom.getParent(image, editor.dom.isBlock) as HTMLElement | null;
        return block && block !== body ? block : image;
      };

      const isReusableRichImageCaretBlock = (node: Element | null): node is HTMLElement =>
        Boolean(
          node?.matches('p,div') &&
          !String(node.textContent || '').trim() &&
          !node.querySelector('img,table,pre,ul,ol,figure,input'),
        );

      const focusRichImageCaret = (target: Node, offset = 0) => {
        editor.focus();
        editor.selection?.setCursorLocation?.(target, offset);
        editor.selection?.scrollIntoView?.(target);
        editor.nodeChanged?.();
      };

      const insertParagraphAfterSelectedRichImage = () => {
        const image = resolveSelectedRichImage();
        if (!image) return;
        const anchor = resolveRichImageBlockAnchor(image);
        const parent = anchor.parentNode;
        if (!parent) return;
        const existing = anchor.nextElementSibling;
        if (isReusableRichImageCaretBlock(existing)) {
          focusRichImageCaret(existing, 0);
          return;
        }
        const paragraph = createRichImageCaretParagraph();
        editor.undoManager.transact(() => {
          parent.insertBefore(paragraph, anchor.nextSibling);
        });
        focusRichImageCaret(paragraph, 0);
        notifyRichImageMutation();
      };

      const removeSelectedRichImage = (image: HTMLImageElement) => {
        const body = editor.getBody?.() as HTMLElement | null;
        if (!body || !body.contains(image)) return;
        const imageParent = image.parentElement;
        const imageOnlyLink =
          imageParent?.matches('a') &&
          !String(imageParent.textContent || '').trim() &&
          imageParent.querySelectorAll('img').length === 1
            ? imageParent
            : null;
        const figure = image.closest<HTMLElement>('figure.image');
        const removalNode: HTMLElement = figure || imageOnlyLink || image;
        const parent = removalNode.parentNode;
        if (!parent) return;
        const removalOffset = Array.prototype.indexOf.call(parent.childNodes, removalNode) as number;
        let caretTarget: Node = parent;
        let caretOffset = Math.max(0, removalOffset);

        editor.undoManager.transact(() => {
          removalNode.remove();
          if (parent === body) {
            const paragraph = createRichImageCaretParagraph();
            body.insertBefore(paragraph, body.childNodes[Math.max(0, removalOffset)] || null);
            caretTarget = paragraph;
            caretOffset = 0;
            return;
          }
          if (parent instanceof HTMLElement && editor.dom.isEmpty(parent)) {
            parent.replaceChildren(editor.dom.create('br', { 'data-mce-bogus': '1' }));
            caretTarget = parent;
            caretOffset = 0;
            return;
          }
          caretOffset = Math.min(Math.max(0, removalOffset), parent.childNodes.length);
        });
        focusRichImageCaret(caretTarget, caretOffset);
        notifyRichImageMutation();
      };

      const pasteRichImageAfterSelection = () => {
        const image = resolveSelectedRichImage();
        if (!image) return;
        if (!richImageClipboardHtml) {
          message.info(t('noteDetail.editor.imagePasteEmpty'));
          return;
        }
        const template = editor.getDoc().createElement('template') as HTMLTemplateElement;
        template.innerHTML = richImageClipboardHtml;
        const clone = template.content.querySelector<HTMLImageElement>('img');
        const anchor = resolveRichImageBlockAnchor(image);
        if (!clone || !anchor.parentNode) return;
        const paragraph = editor.dom.create('p', {}) as HTMLParagraphElement;
        paragraph.appendChild(clone);
        editor.undoManager.transact(() => {
          anchor.parentNode?.insertBefore(paragraph, anchor.nextSibling);
        });
        editor.focus();
        editor.selection?.select?.(clone);
        editor.selection?.scrollIntoView?.(clone);
        notifyRichImageMutation();
      };

      editor.ui.registry.addIcon('ln-image-copy', icon.noteDetail.imageToolbar.copy);
      editor.ui.registry.addIcon('ln-image-preview', icon.noteDetail.diagramTools.zoom);
      editor.ui.registry.addIcon('ln-image-cut', icon.noteDetail.imageToolbar.cut);
      editor.ui.registry.addIcon('ln-image-paste', icon.noteDetail.imageToolbar.paste);
      editor.ui.registry.addIcon('ln-image-delete', icon.noteDetail.imageToolbar.delete);
      editor.ui.registry.addIcon('ln-image-paragraph-after', icon.noteDetail.imageToolbar.paragraphAfter);
      editor.ui.registry.addButton('lnImagePreview', {
        icon: 'ln-image-preview',
        tooltip: t('noteDetail.editor.imagePreview'),
        onAction: () => {
          const image = resolveSelectedRichImage();
          if (image) openNoteContentImagePreview(image);
        },
      });
      editor.ui.registry.addButton('lnImageCopy', {
        icon: 'ln-image-copy',
        tooltip: t('noteDetail.editor.imageCopy'),
        onAction: () => {
          const image = resolveSelectedRichImage();
          if (image) captureRichImage(image);
        },
      });
      editor.ui.registry.addButton('lnImageCut', {
        icon: 'ln-image-cut',
        tooltip: t('noteDetail.editor.imageCut'),
        onAction: () => {
          const image = resolveSelectedRichImage();
          if (!image) return;
          captureRichImage(image);
          removeSelectedRichImage(image);
        },
      });
      editor.ui.registry.addButton('lnImagePaste', {
        icon: 'ln-image-paste',
        tooltip: t('noteDetail.editor.imagePaste'),
        onAction: pasteRichImageAfterSelection,
      });
      editor.ui.registry.addButton('lnImageDelete', {
        icon: 'ln-image-delete',
        tooltip: t('noteDetail.editor.imageDelete'),
        onAction: () => {
          const image = resolveSelectedRichImage();
          if (image) removeSelectedRichImage(image);
        },
      });
      editor.ui.registry.addButton('lnImageParagraphAfter', {
        icon: 'ln-image-paragraph-after',
        tooltip: t('noteDetail.editor.imageParagraphAfter'),
        onAction: insertParagraphAfterSelectedRichImage,
      });
      editor.ui.registry.addContextToolbar('imageselection', {
        predicate: (node: Node) => {
          const element = node instanceof Element ? node : null;
          const image =
            element?.nodeName === 'IMG'
              ? element
              : element?.matches('figure.image')
                ? element.querySelector('img')
                : null;
          return Boolean(
            image &&
            !image.closest('.mermaid-figure--companion, .ln-media-text') &&
            editor.dom.isEditable(image.parentElement),
          );
        },
        items:
          'lnImagePreview | lnImageCopy lnImageCut lnImagePaste lnImageDelete | alignleft aligncenter alignright | lnImageParagraphAfter',
        position: 'node',
      });

      let richImageNativeMenuBody: HTMLElement | null = null;
      const resolveRichImageFromEvent = (event: Event) => {
        const target = event.target;
        const image = target instanceof Element ? target.closest<HTMLImageElement>('img') : null;
        const body = editor.getBody?.() as HTMLElement | null;
        if (!image || !body?.contains(image) || image.closest('.mermaid-figure--companion, .ln-media-text'))
          return null;
        return image;
      };
      const blockNativeRichImageContextMenu = (event: Event) => {
        // 全端只收口普通可编辑图片的右键/长按：阻断浏览器对象菜单，建立图片选区后
        // 明确打开与单击相同的 imageselection 快捷条。普通文字继续使用系统菜单；
        // 图文组合与 Mermaid 各自保留已有的专用工具条。
        if (props.readonly) return;
        const image = resolveRichImageFromEvent(event);
        if (!image) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        editor.selection?.select?.(image);
        editor.nodeChanged?.();
        // 必须把图片作为 node 锚点传给 TinyMCE。省略 target 时，长按会按事件点贴到
        // 图片右边缘，窄屏剩余宽度不足后工具条会被压成单列；随后普通点击又改用节点
        // 锚点，才出现另一套横向排版。
        editor.dispatch?.('contexttoolbar-show', { toolbarKey: 'imageselection', target: image });
      };
      const blockDesktopRichTextContextMenu = (event: Event) => {
        if (props.readonly || usesNativeTextSelectionMenu.value || resolveRichImageFromEvent(event)) return;
        const body = editor.getBody?.() as HTMLElement | null;
        const target = event.target;
        if (!body || !(target instanceof Node) || !body.contains(target)) return;
        // 桌面富文本已有包含 AI 与格式化的划词快捷条；只阻止浏览器系统菜单，
        // 不停止事件传播，避免影响 TinyMCE 对当前选区和快捷条位置的维护。
        event.preventDefault();
      };
      const bindRichImageNativeMenuGuard = () => {
        richImageNativeMenuBody = editor.getBody?.() as HTMLElement | null;
        richImageNativeMenuBody?.addEventListener('contextmenu', blockNativeRichImageContextMenu, true);
        richImageNativeMenuBody?.addEventListener('contextmenu', blockDesktopRichTextContextMenu, true);
        // TinyMCE 会在触屏设备把 touch 序列合成为自己的 longpress 事件，它不一定继续派发
        // DOM contextmenu，因此需要同时收口这条路径。prepend=true 保证先于 silver theme 处理。
        editor.on('longpress', blockNativeRichImageContextMenu, true);
      };
      const unbindRichImageNativeMenuGuard = () => {
        richImageNativeMenuBody?.removeEventListener('contextmenu', blockNativeRichImageContextMenu, true);
        richImageNativeMenuBody?.removeEventListener('contextmenu', blockDesktopRichTextContextMenu, true);
        editor.off('longpress', blockNativeRichImageContextMenu);
        richImageNativeMenuBody = null;
      };

      let mermaidEditBody: HTMLElement | null = null;
      const bindMermaidEditRequest = () => {
        mermaidEditBody = editor.getBody?.() as HTMLElement | null;
        mermaidEditBody?.addEventListener(MERMAID_EDIT_EVENT, openRichMermaidEditor);
      };
      const unbindMermaidEditRequest = () => {
        mermaidEditBody?.removeEventListener(MERMAID_EDIT_EVENT, openRichMermaidEditor);
        mermaidEditBody = null;
      };
      let selectedMermaidFigure: HTMLElement | null = null;
      const setSelectedMermaidFigure = (figure: HTMLElement | null) => {
        if (selectedMermaidFigure && selectedMermaidFigure !== figure) {
          selectedMermaidFigure.classList.remove('is-selected');
        }
        selectedMermaidFigure = figure;
        selectedMermaidFigure?.classList.add('is-selected');
      };
      const resolveSelectedMermaidFigure = () => {
        const body = editor.getBody?.() as HTMLElement | null;
        if (!body) return null;
        if (selectedMermaidFigure?.isConnected && body.contains(selectedMermaidFigure)) {
          return selectedMermaidFigure;
        }
        const selectionNode = editor.selection?.getNode?.();
        const fromSelection =
          selectionNode instanceof Element ? selectionNode.closest<HTMLElement>('.mermaid-figure--companion') : null;
        return (
          fromSelection ||
          body.querySelector<HTMLElement>(
            '.mermaid-figure--companion.is-selected, .mermaid-figure--companion[data-mce-selected="1"]',
          )
        );
      };
      const deleteSelectedMermaidFigure = (event: KeyboardEvent) => {
        if (event.isComposing || (event.key !== 'Backspace' && event.key !== 'Delete')) return false;
        const figure = resolveSelectedMermaidFigure();
        const source = figure?.previousElementSibling as HTMLElement | null;
        if (!figure || !source?.matches('pre[class*="language-mermaid"]')) return false;

        event.preventDefault();
        event.stopImmediatePropagation();
        const body = editor.getBody?.() as HTMLElement | null;
        const after = figure.nextElementSibling as HTMLElement | null;
        const before = source.previousElementSibling as HTMLElement | null;
        editor.undoManager.transact(() => {
          // companion 是不入库的装饰层，真正的正文节点是它前面的源码块；两者必须在同一事务中消失。
          // 若只删 figure，下一轮 NodeChange 会根据仍在的源码把图重新生成，正是此前“闪成代码又变回图”的原因。
          figure.remove();
          source.remove();

          let caretTarget = after?.isConnected ? after : before?.isConnected ? before : null;
          if (!caretTarget && body) {
            caretTarget = editor.dom.create('p', {}) as HTMLElement;
            caretTarget.appendChild(editor.dom.create('br', { 'data-mce-bogus': '1' }));
            body.appendChild(caretTarget);
          }
          if (caretTarget) {
            editor.selection.select(caretTarget, true);
            editor.selection.collapse(Boolean(after?.isConnected));
          }
          editor.nodeChanged?.();
          editor.setDirty?.(true);
          if (editor.dispatch) editor.dispatch('input');
          else editor.fire?.('input');
        });
        setSelectedMermaidFigure(null);
        return true;
      };
      editor.on('init', () => {
        bindMermaidEditRequest();
        bindRichImageNativeMenuGuard();
        contextToolbarScrollContainer = editor.getBody?.()?.closest<HTMLElement>('.note-editor-scroll') || null;
        contextToolbarScrollContainer?.addEventListener('scroll', scheduleContextToolbarAdjustment, {
          passive: true,
        });
        // searchreplace 插件会注册自己的 Meta+F。若只在 keydown 里 preventDefault，
        // 同一个编辑器事件上的 TinyMCE shortcut 监听仍会继续执行，原生浮层就会藏在
        // 自研查找栏后面，按 Esc 后才暴露出来。初始化完成后明确替换为唯一入口。
        editor.shortcuts.remove('Meta+F');
        editor.shortcuts.add('Meta+F', '', () => openRichFind(editor));
        // TinyMCE 默认也提供重做，但这里显式注册两套用户最常见的组合键，
        // 避免不同系统或插件覆盖后只剩其中一种入口。
        editor.shortcuts.remove('Meta+Y');
        editor.shortcuts.remove('Meta+Shift+Z');
        editor.shortcuts.add('Meta+Y', '', () => editor.execCommand('Redo'));
        editor.shortcuts.add('Meta+Shift+Z', '', () => editor.execCommand('Redo'));
        // 行内格式改由 keydown 优先接管，确保执行后能被“重复上一步”记录。
        ['Meta+B', 'Meta+I', 'Meta+U'].forEach((shortcut) => {
          editor.shortcuts.remove(shortcut);
        });
        Array.from({ length: 6 }, (_, index) => index + 1).forEach((level) => {
          editor.shortcuts.remove(`Meta+${level}`);
          editor.shortcuts.remove(`Meta+Alt+${level}`);
        });
        // 重复功能由 keydown 在 TinyMCE 快捷键解析前处理。macOS 的 Option+R
        // 会把 event.key 变成 ®，只依赖字符键匹配会失效，因此统一按 code/keyCode 识别。
        editor.shortcuts.remove('F4');
        editor.shortcuts.remove('Meta+Alt+R');
      });
      editor.on('remove', () => {
        if (contextToolbarAdjustFrame !== null) window.cancelAnimationFrame(contextToolbarAdjustFrame);
        contextToolbarAdjustFrame = null;
        if (contextToolbarAdjustTimer !== null) window.clearTimeout(contextToolbarAdjustTimer);
        contextToolbarAdjustTimer = null;
        clearContextToolbarAdjustments();
        contextToolbarScrollContainer?.removeEventListener('scroll', scheduleContextToolbarAdjustment);
        contextToolbarScrollContainer = null;
        if (editorRef.value === editor) {
          resetRichFindState();
          richFindVisible.value = false;
          editorRef.value = null;
        }
        setSelectedMermaidFigure(null);
        closeRichMediaTextToolbar();
        unbindMermaidEditRequest();
        unbindRichImageNativeMenuGuard();
      });

      const refreshResourceReferences = () => {
        window.setTimeout(() => {
          if (editorRef.value !== editor) return;
          publishResourceRefs(editor.getContent({ format: 'html' }));
          decorateTinyMceResourceRefs();
        }, 0);
      };

      // chip 的实时名称/失效状态只属于展示层。TinyMCE 向 v-model 取正文时先还原快照，
      // 这样资源重命名不会无声改写用户笔记，手动改过的链接文字仍按用户输入保存。
      editor.on('GetContent', (event: { content?: string }) => {
        if (typeof event.content === 'string') {
          event.content = normalizeRichMediaTextHtml(
            stripTransientMermaidMarkers(
              stripTransientMentionMarkers(serializeResourceReferenceSnapshots(event.content)),
            ),
          );
        }
      });
      editor.on('BeforeSetContent', (event: { content?: string }) => {
        if (typeof event.content === 'string') {
          event.content = normalizeRichMediaTextHtml(
            stripTransientMermaidMarkers(
              stripTransientMentionMarkers(serializeResourceReferenceSnapshots(event.content)),
            ),
          );
        }
      });
      editor.on('SetContent change undo redo', refreshResourceReferences);
      editor.on('SetContent undo redo', () => {
        closeRichMediaTextToolbar();
        window.setTimeout(() => decorateRichMediaTextCaptions(editor), 0);
      });
      editor.on('input', () => {
        if (richFindVisible.value && richFindSignature.value && !applyingRichFindReplacement) {
          clearRichFindMatches();
        }
        refreshResourceReferences();
        window.setTimeout(() => decorateRichMediaTextCaptions(editor), 0);
        window.setTimeout(() => {
          syncTinyMceSlashCommand(editor);
          if (slashCommandVisible.value) return;
          if (inlineMentionVisible.value) syncTinyMceInlineMention(editor);
          else tryOpenTinyMceMention(editor);
          // 浮层已收起但仍处在 @ 上下文时,上面的 tryOpen 会重新唤起
        }, 0);
      });
      editor.on('undo redo SetContent', () => {
        if (richFindVisible.value && richFindSignature.value && !applyingRichFindReplacement) {
          clearRichFindMatches();
        }
      });
      editor.on(
        'keydown',
        (event: KeyboardEvent) => {
          if (handleInlineFormatEditorShortcut(event)) return;
          if (handleHeadingEditorShortcut(event)) return;
          if (handleRepeatLastEditorActionShortcut(event)) return;
          if (deleteSelectedMermaidFigure(event)) return;
          // TinyMCE searchreplace 自带的是可拖拽浮层，在 inline 模式里既遮正文又可能留下重复锚点。
          // Ctrl(Windows/Linux) 与 ⌘(macOS) 统一打开编辑器内部的紧凑查找栏，只复用其搜索引擎。
          if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            event.stopImmediatePropagation();
            openRichFind(editor);
            return;
          }
          if (event.key === 'Escape' && richFindVisible.value) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeRichFind();
            return;
          }
          if (slashCommandVisible.value && !event.isComposing) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              event.stopImmediatePropagation();
              slashCommandMenuRef.value?.moveActive(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopImmediatePropagation();
              slashCommandMenuRef.value?.moveActive(-1);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              event.stopImmediatePropagation();
              slashCommandMenuRef.value?.chooseActive();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopImmediatePropagation();
              if (!slashCommandMenuRef.value?.handleEscape()) closeSlashCommand({ dismissed: true });
            }
            return;
          }
          if (!inlineMentionVisible.value || event.isComposing) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            inlineMentionSuggestionsRef.value?.moveActive(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            inlineMentionSuggestionsRef.value?.moveActive(-1);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            inlineMentionSuggestionsRef.value?.chooseActive();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            closeInlineMention({ dismissed: true });
          }
        },
        true,
      );

      const isTodoCheckbox = (element: Element | null): element is HTMLInputElement =>
        element?.tagName === 'INPUT' &&
        (element.classList.contains('note-todo-checkbox') || element.getAttribute('data-note-task') === 'true');
      const getCurrentBlock = () => {
        const node = editor.selection ? editor.selection.getNode() : null;
        if (!node) return null;
        return editor.dom.getParent(node, 'p,div,li,td,th') as HTMLElement | null;
      };
      const getSelectedBlocks = () => {
        if (editor.selection?.getSelectedBlocks) {
          const blocks = editor.selection.getSelectedBlocks() as HTMLElement[] | null;
          if (blocks && blocks.length) return blocks;
        }
        const current = getCurrentBlock();
        return current ? [current] : [];
      };
      const isBlockEligible = (block: HTMLElement) => {
        const tagName = block.tagName.toLowerCase();
        if (!['p', 'div', 'td', 'th'].includes(tagName)) return false;
        const listParent = editor.dom.getParent(block, 'ul,ol,li');
        return !listParent;
      };
      const hasIneligibleSelection = (blocks: HTMLElement[]) =>
        blocks.length === 0 || blocks.some((block) => !isBlockEligible(block));
      const getLeadingCheckbox = (block: HTMLElement | null) => {
        if (!block) return null;
        let firstNode: ChildNode | null = block.firstChild;
        while (firstNode && firstNode.nodeType === 3 && !firstNode.textContent?.trim()) {
          firstNode = firstNode.nextSibling;
        }
        if (firstNode && firstNode.nodeType === 1 && isTodoCheckbox(firstNode as Element)) {
          return firstNode as HTMLInputElement;
        }
        return null;
      };
      const removeLeadingCheckbox = (block: HTMLElement | null) => {
        if (!block) return;
        const checkbox = getLeadingCheckbox(block);
        if (!checkbox) return;
        const next = checkbox.nextSibling;
        editor.undoManager.transact(() => {
          if (next && next.nodeType === 3 && !next.textContent?.trim()) {
            block.removeChild(next);
          }
          block.removeChild(checkbox);
        });
      };
      const ensureTodoCheckbox = (block: HTMLElement | null) => {
        if (!block || getLeadingCheckbox(block)) return null;
        const checkboxEl = editor.dom.create('input', {
          type: 'checkbox',
          class: 'note-todo-checkbox',
          'data-note-task': 'true',
        }) as HTMLInputElement;
        // NBSP 给光标一个稳定的文字落点；普通空格在空段落中会被浏览器折叠，
        // selection 最终容易退回到 checkbox 前面。
        const spacer = editor.dom.doc.createTextNode('\u00a0');
        editor.undoManager.transact(() => {
          block.insertBefore(spacer, block.firstChild);
          block.insertBefore(checkboxEl, spacer);
        });
        return spacer;
      };
      const splitTodoLineAtCursor = (block: HTMLElement | null) => {
        if (!block || !block.parentNode) return;
        const rng = editor.selection.getRng();
        // 有选区时先删掉选中内容，光标落到删除点
        if (!rng.collapsed) rng.deleteContents();
        // 取「光标 → 本行末尾」的内容（勾选框在光标之前，不会被带走）
        const tailRange = editor.dom.createRng();
        tailRange.selectNodeContents(block);
        tailRange.setStart(rng.startContainer, rng.startOffset);
        const tail = tailRange.extractContents();
        // 新建一行：勾选框 + 空格 + 光标之后的文字（光标在行中间时把后半段带过去）
        const tagName = block.tagName || 'P';
        const newBlock = editor.dom.create(tagName, {}) as HTMLElement;
        const checkboxEl = editor.dom.create('input', {
          type: 'checkbox',
          class: 'note-todo-checkbox',
          'data-note-task': 'true',
        });
        const spacer = editor.dom.doc.createTextNode(' ');
        newBlock.appendChild(checkboxEl);
        newBlock.appendChild(spacer);
        if (tail && tail.childNodes.length) {
          newBlock.appendChild(tail);
        }
        editor.dom.insertAfter(newBlock, block);
        // 光标落到新行的文字开头（勾选框和空格之后、被带过来的文字之前）
        editor.selection.setCursorLocation(spacer, spacer.length);
      };

      const toggleNoteTodo = () => {
        if (!editor.hasFocus()) return;
        const blocks = getSelectedBlocks();
        if (hasIneligibleSelection(blocks)) return;
        const eligibleBlocks = blocks.filter((block) => isBlockEligible(block));
        if (!eligibleBlocks.length) return;
        const allHaveCheckbox = eligibleBlocks.every((block) => getLeadingCheckbox(block));
        const currentBlock = getCurrentBlock();
        const selectionWasCollapsed = Boolean(editor.selection?.getRng?.().collapsed);
        const shouldMoveCaretAfterCheckbox = Boolean(
          !allHaveCheckbox &&
          selectionWasCollapsed &&
          eligibleBlocks.length === 1 &&
          currentBlock === eligibleBlocks[0] &&
          !String(currentBlock?.textContent || '').trim(),
        );
        let caretSpacer: Text | null = null;
        editor.undoManager.transact(() => {
          if (allHaveCheckbox) {
            eligibleBlocks.forEach((block) => removeLeadingCheckbox(block));
            return;
          }
          eligibleBlocks.forEach((block) => {
            if (!getLeadingCheckbox(block)) {
              const spacer = ensureTodoCheckbox(block);
              if (block === currentBlock && spacer) caretSpacer = spacer;
            }
          });
        });
        if (shouldMoveCaretAfterCheckbox && caretSpacer?.isConnected) {
          editor.selection.setCursorLocation(caretSpacer, caretSpacer.length);
          editor.nodeChanged?.();
        }
      };
      editor.addCommand('ToggleNoteTodo', toggleNoteTodo);

      editor.ui.registry.addIcon('todo-checkbox', icon.noteDetail.toolbar.todo);
      editor.ui.registry.addButton('todoCheckbox', {
        icon: 'todo-checkbox',
        tooltip: t('todo'),
        onSetup: (api) => {
          const refresh = () => {
            if (!editor.hasFocus()) {
              api.setEnabled(false);
              return;
            }
            const blocks = getSelectedBlocks();
            api.setEnabled(!hasIneligibleSelection(blocks));
          };
          refresh();
          editor.on('focus', refresh);
          editor.on('blur', refresh);
          editor.on('NodeChange', refresh);
          editor.on('SelectionChange', refresh);
          return () => {
            editor.off('focus', refresh);
            editor.off('blur', refresh);
            editor.off('NodeChange', refresh);
            editor.off('SelectionChange', refresh);
          };
        },
        onAction: () => editor.execCommand('ToggleNoteTodo'),
      });

      const refreshExternalToolbarState = () => {
        if (editorRef.value !== editor) return;
        const queryCommandState = (command: string) => {
          if (!editor.initialized || !editor.getBody?.()) return false;
          try {
            return Boolean(editor.queryCommandState?.(command));
          } catch {
            // 切换笔记/格式时 TinyMCE 可能正处于销毁阶段，此时命令注册表已不可查询。
            return false;
          }
        };
        const node = editor.selection?.getNode?.() as HTMLElement | null;
        const block = node ? (editor.dom.getParent(node, 'h1,h2,h3,h4,h5,h6,p,div,pre') as HTMLElement | null) : null;
        const selectedBlocks = getSelectedBlocks().filter((item) => isBlockEligible(item));
        richToolbarState.value = {
          canUndo: Boolean(editor.undoManager?.hasUndo?.()),
          canRedo: Boolean(editor.undoManager?.hasRedo?.()),
          bold: queryCommandState('Bold'),
          italic: queryCommandState('Italic'),
          underline: queryCommandState('Underline'),
          strike: queryCommandState('Strikethrough'),
          todo: Boolean(selectedBlocks.length && selectedBlocks.every((item) => getLeadingCheckbox(item))),
          bulletList: queryCommandState('InsertUnorderedList'),
          orderedList: queryCommandState('InsertOrderedList'),
          block: String(block?.tagName || 'p').toLowerCase(),
        };
      };
      editor.on('init focus NodeChange SelectionChange Undo Redo change SetContent', refreshExternalToolbarState);
      window.setTimeout(refreshExternalToolbarState, 0);
      editor.ui.registry.addIcon('code-block', icon.noteDetail.toolbar.codeBlock);
      editor.ui.registry.addToggleButton('codeBlock', {
        icon: 'code-block',
        tooltip: t('noteDetail.editor.codeBlock'),
        onSetup: (api) => {
          const refresh = () => {
            const node = editor.selection ? editor.selection.getStart() : null;
            const isActive = node ? editor.dom.is(node, 'pre') : false;
            api.setActive(isActive);
          };
          refresh();
          editor.on('NodeChange', refresh);
          return () => editor.off('NodeChange', refresh);
        },
        onAction: () => editor.execCommand('FormatBlock', false, 'pre'),
      });
      // 富文本里的 mermaid 图表:插入的是源码代码块(会存进内容),图由 renderMermaidCompanions
      // 以 data-mce-bogus 装饰块的形式挂在它后面,不进内容,所以不存在往返转换损坏内容的风险
      editor.ui.registry.addIcon('mermaid-diagram', icon.noteDiagram);
      editor.ui.registry.addMenuButton('mermaidDiagram', {
        icon: 'mermaid-diagram',
        tooltip: t('note.insertDiagram'),
        fetch: (callback: (items: any[]) => void) => {
          callback(
            MERMAID_TEMPLATES.map((template) => ({
              type: 'menuitem',
              text: t(template.labelKey),
              onAction: () => insertHtmlDiagramTemplate(editor, template.key),
            })),
          );
        },
      });
      const scheduleCompanionRender = () => {
        if (mermaidCompanionTimer) window.clearTimeout(mermaidCompanionTimer);
        mermaidCompanionTimer = window.setTimeout(() => {
          mermaidCompanionTimer = null;
          const body = editor.getBody?.();
          if (body) void renderMermaidBlocks(body, { companion: true });
        }, MERMAID_COMPANION_DEBOUNCE_MS);
      };
      const renderCompanionsImmediately = () => {
        if (mermaidCompanionTimer) {
          window.clearTimeout(mermaidCompanionTimer);
          mermaidCompanionTimer = null;
        }
        const body = editor.getBody?.();
        // renderMermaidBlocks 在首次 await 之前就同步插入 placeholder companion，
        // 所以撤销/重做恢复源码块的同一帧里已经有图表占位，源码不会裸露 260ms。
        if (body) void renderMermaidBlocks(body, { companion: true });
      };
      editor.on('SetContent undo redo', renderCompanionsImmediately);
      editor.on('input', scheduleCompanionRender);
      // NodeChange 触发很密,但 renderMermaidCompanions 对没变过的源码是空操作
      editor.on('NodeChange', scheduleCompanionRender);
      editor.ui.registry.addMenuButton('myHeadingMenu', {
        text: t('noteDetail.editor.headingMenu'),
        fetch: function (callback) {
          const items = [
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading1'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h1'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading2'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h2'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading3'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h3'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading4'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h4'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading5'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h5'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading6'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h6'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.paragraph'),
              onAction: () => editor.execCommand('FormatBlock', false, 'p'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.codeBlock'),
              onAction: () => editor.execCommand('FormatBlock', false, 'pre'),
            },
          ];
          callback(items);
        },
      });

      // 划词 AI 是一条独立的「选段改写」链路：只传动作枚举和选中文字，
      // 由服务端组装受限提示并强制纯文本输出。全文助手的【标题】/【正文】契约不再进入这里。
      const normalizeSelectionAiOutput = (value: string) => {
        let output = String(value || '').trim();
        output = output
          .replace(/^```(?:text|plaintext)?\s*/iu, '')
          .replace(/```\s*$/u, '')
          .trim();
        // 兼容切换期间仍返回旧标记的上游，避免再把「标题/正文」字样写进选区。
        const bodyMarker = output.lastIndexOf('【正文】');
        if (bodyMarker >= 0) output = output.slice(bodyMarker + '【正文】'.length).trim();
        return output.replace(/^【标题】\s*/u, '').trim();
      };
      const createSelectionAiPendingMarker = () => {
        const range = editor.selection?.getRng?.()?.cloneRange?.() as Range | undefined;
        if (!range) return null;
        const marker = editor.dom.create('span', {
          class: 'ln-ai-selection-pending',
          contenteditable: 'false',
          'data-mce-bogus': 'all',
          role: 'status',
          'aria-label': t('noteDetail.editor.aiSelectionProcessing'),
          title: t('noteDetail.editor.aiSelectionProcessing'),
        }) as HTMLElement;
        marker.appendChild(editor.dom.create('span', { class: 'ln-ai-selection-pending__spinner' }));
        try {
          range.collapse(false);
          range.insertNode(marker);
          return marker;
        } catch {
          marker.remove();
          return null;
        }
      };
      const removeSelectionAiPendingMarker = (marker: HTMLElement | null) => {
        const parent = marker?.parentNode;
        marker?.remove();
        parent?.normalize?.();
      };
      const aiEditSelection = async (action: string) => {
        const raw = editor.selection ? editor.selection.getContent({ format: 'text' }) : '';
        const text = String(raw || '').trim();
        if (!text) {
          message.warning(t('noteDetail.editor.aiSelectFirst'));
          return;
        }
        const bookmark = editor.selection?.getBookmark?.(2, true) ?? null;
        const pendingMarker = createSelectionAiPendingMarker();
        editor.setProgressState(true);
        try {
          // 该 AI 端点始终以 SSE 流返回(stream:false 会拿到未解析的原始 SSE),故用流式并自行收集,与 AiReply 一致
          let full = '';
          let buffer = '';
          let processed = 0;
          const parseLine = (line: string) => {
            const l = line.trim();
            if (!l.startsWith('data:')) return;
            const ds = l.slice(5).trim();
            if (!ds || ds === '[DONE]') return;
            try {
              const d = JSON.parse(ds);
              const c = d.output?.text || d.text || d.content || '';
              if (c && typeof c === 'string') full += c;
            } catch {
              /* 跳过不完整片段 */
            }
          };
          await apiBasePost(
            '/api/note/assist',
            {
              selectionAction: action,
              selectionText: text,
              stream: true,
              sessionId: '',
              responseFormat: 'plain',
              requestMetadata: {
                operation: `selection_${action}`,
                scope: 'selection',
                contentChars: text.length,
              },
            },
            {
              headers: { 'Content-Type': 'application/json' },
              responseType: 'text',
              onDownloadProgress: (progressEvent: any) => {
                const ev = progressEvent?.event ?? progressEvent;
                const rt = (ev?.target as XMLHttpRequest | null)?.responseText ?? '';
                if (!rt) return;
                const chunk = rt.slice(processed);
                processed = rt.length;
                if (!chunk) return;
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                lines.forEach(parseLine);
              },
            },
          );
          if (buffer) buffer.split('\n').forEach(parseLine); // 收尾残余
          const out = normalizeSelectionAiOutput(full);
          if (out) {
            removeSelectionAiPendingMarker(pendingMarker);
            editor.focus();
            if (bookmark) editor.selection?.moveToBookmark?.(bookmark);
            const currentSelection = String(editor.selection?.getContent?.({ format: 'text' }) || '').trim();
            if (currentSelection !== text) {
              message.warning(t('noteDetail.editor.aiSelectionChanged'));
              return;
            }
            editor.undoManager.transact(() => {
              // 文本编码后回填：结果不能注入 HTML，且整次替换作为一个撤销步骤。
              editor.selection.setContent(editor.dom.encode(out).replace(/\r?\n/g, '<br>'));
            });
          } else {
            message.info(t('noteDetail.editor.aiEmpty'));
          }
        } catch {
          message.info(t('noteDetail.editor.aiFailed'));
        } finally {
          removeSelectionAiPendingMarker(pendingMarker);
          editor.setProgressState(false);
        }
      };
      editor.ui.registry.addMenuButton('aiEdit', {
        text: 'AI',
        tooltip: t('noteDetail.editor.aiEditTip'),
        fetch: function (callback) {
          callback([
            { type: 'menuitem', text: t('noteDetail.editor.aiPolish'), onAction: () => aiEditSelection('polish') },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.aiTranslate'),
              onAction: () => aiEditSelection('translate'),
            },
            { type: 'menuitem', text: t('noteDetail.editor.aiCondense'), onAction: () => aiEditSelection('condense') },
            { type: 'menuitem', text: t('noteDetail.editor.aiExpand'), onAction: () => aiEditSelection('expand') },
          ]);
        },
      });

      const syncCheckboxAttribute = (target: EventTarget | null) => {
        if (!target) return;
        const input = target as HTMLInputElement;
        if (!isTodoCheckbox(input)) return;
        if (input.checked) {
          editor.dom.setAttrib(input, 'checked', 'checked');
        } else {
          editor.dom.setAttrib(input, 'checked', null);
        }
      };

      editor.on('click', (event: MouseEvent) => {
        const target = event.target;
        const figure = target instanceof Element ? target.closest<HTMLElement>('.mermaid-figure--companion') : null;
        setSelectedMermaidFigure(figure);
        // 图文组合的设置只属于图片本身。文字区必须保留 TinyMCE 原生光标与选区行为，
        // 不能因为它和图片同属一个 figure 就弹出整组设置。
        const mediaTextImage =
          target instanceof Element ? target.closest<HTMLImageElement>('.ln-media-text__media img') : null;
        const mediaTextItem = mediaTextImage?.closest<HTMLElement>('.ln-media-text__item') || null;
        const mediaTextBlock = mediaTextItem?.parentElement?.classList.contains('ln-media-text')
          ? mediaTextItem.parentElement
          : null;
        if (mediaTextImage && mediaTextItem && mediaTextBlock && !props.readonly) {
          event.preventDefault();
          event.stopPropagation();
          focusRichMediaTextCaption(editor, mediaTextItem);
          openRichMediaTextToolbar(mediaTextBlock, mediaTextItem, { x: event.clientX, y: event.clientY });
          return;
        }
        if (mediaTextImage && props.readonly && openNoteContentImagePreview(mediaTextImage)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        // TinyMCE 的正文可能运行在独立编辑上下文里，父页面的 outside-click 监听收不到这次点击；
        // 因此点回文字或正文空白时在这里显式关闭，且不拦截后续光标定位。
        if (richMediaTextToolbarVisible.value) closeRichMediaTextToolbar();
        const image = target instanceof Element ? target.closest<HTMLImageElement>('img') : null;
        if (
          image &&
          isMobile.value &&
          !props.readonly &&
          !image.closest('.mermaid-figure--companion, .ln-media-text')
        ) {
          event.preventDefault();
          event.stopPropagation();
          // 图片禁用了系统对象选区后，单击时显式建立 TinyMCE 图片选区，确保自研图片浮条稳定出现。
          editor.selection?.select?.(image);
          editor.nodeChanged?.();
          openMobileImageSettings({ kind: 'html', editor, element: image }, image);
          return;
        }
        if (image && props.readonly && openNoteContentImagePreview(image)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (handleTinyMceResourceReferenceActivation(event)) return;
        syncCheckboxAttribute(target);
      });
      editor.on('change', (event: Event) => {
        syncCheckboxAttribute(event.target);
      });

      editor.on('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        const block = getCurrentBlock();
        if (!block) return;
        if (!getLeadingCheckbox(block)) return;
        event.preventDefault();
        editor.undoManager.transact(() => {
          splitTodoLineAtCursor(block);
        });
      });
      editor.on('init', async () => {
        if (editor.mode?.set) {
          editor.mode.set(props.readonly ? 'readonly' : 'design');
        } else if (editor.setMode) {
          editor.setMode(props.readonly ? 'readonly' : 'design');
        }
        await ensureToolbarRendered();
        window.setTimeout(() => {
          if (currentType.value !== 'html' || editorRef.value !== editor) return;
          resetUndoHistory(editor);
          refreshResourceReferences();
          decorateRichMediaTextCaptions(editor);
          richEditorRuntimeReady.value = true;
          emits('ready');
        }, 0);
      });
    },
    content_style: [
      '.note-editor-body, .mce-content-body { font-family: inherit; background-color: var(--background-color); color: var(--text-color); padding: 5px 20px clamp(180px, 35vh, 380px); } .note-editor-body h1,.note-editor-body h2,.note-editor-body h3,.note-editor-body h4,.note-editor-body h5,.note-editor-body h6, .mce-content-body h1,.mce-content-body h2,.mce-content-body h3,.mce-content-body h4,.mce-content-body h5,.mce-content-body h6{ margin: 0.6em 0 0.4em; } .note-editor-body table, .mce-content-body table{ border-collapse: collapse; width: 100%; } .note-editor-body table td, .mce-content-body table th, .note-editor-body table td, .mce-content-body table th{ border: 1px solid #d9d9d9; padding: 6px 10px; } .note-editor-body pre.code-block, .mce-content-body pre.code-block, .note-editor-body pre[class*="language-"], .mce-content-body pre[class*="language-"]{ background: var(--pre-bg-color); color: #ffffff; border: 1px solid rgba(148, 163, 184, 0.4); padding: 12px 14px; border-radius: 10px; overflow: auto; } .note-editor-body pre.code-block code, .mce-content-body pre.code-block code, .note-editor-body pre[class*="language-"] code, .mce-content-body pre[class*="language-"] code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; white-space: pre; display: block; } .note-editor-body pre.code-block[data-language]::before, .mce-content-body pre.code-block[data-language]::before{ content: attr(data-language); display: inline-block; margin-bottom: 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; } .note-editor-body img, .mce-content-body img{ max-width: 100% !important; height: auto !important; box-sizing: border-box; object-fit: contain; } .note-editor-body .note-todo-checkbox, .mce-content-body .note-todo-checkbox{ vertical-align: middle; margin-right: 6px; } .note-editor-body .note-task-list, .mce-content-body .note-task-list{ padding-left:0; list-style:none; } .note-editor-body .note-task-list-item, .mce-content-body .note-task-list-item{ list-style:none; } .note-editor-body a.ln-resource-link, .mce-content-body a.ln-resource-link{ display:inline-flex; align-items:center; max-width:100%; margin:0 2px; padding:1px 7px; border:1px solid color-mix(in srgb, var(--primary-color) 26%, transparent); border-radius:999px; background:color-mix(in srgb, var(--primary-color) 9%, transparent); color:var(--primary-color); line-height:1.55; text-decoration:none; vertical-align:baseline; cursor:pointer; } .note-editor-body a.ln-resource-link[data-ln-resource-state="unavailable"], .mce-content-body a.ln-resource-link[data-ln-resource-state="unavailable"]{ border-style:dashed; color:var(--desc-color); background:color-mix(in srgb, var(--desc-color) 8%, transparent); cursor:not-allowed; } .mce-content-body:not([dir=rtl])[data-mce-placeholder]:not(.mce-visualblocks)::before{ left: 10px; }',
      // TinyMCE 的 placeholder 是绝对定位伪元素，不能继承正文 padding；首个空段落又有浏览器默认 margin。
      // 预览、正文和 placeholder 共用同一组间距变量，移动端运行时交接也不会改变首行位置。
      '.note-editor-body, .mce-content-body { padding: var(--note-editor-content-padding-top, 12px) 20px clamp(180px, 35vh, 380px); background-color: var(--surface-page-bg, var(--background-color)); line-height: var(--note-editor-content-line-height, 1.65); } .note-editor-body > :first-child, .mce-content-body > :first-child { margin-top: 0; } .mce-content-body:not([dir=rtl])[data-mce-placeholder]:not(.mce-visualblocks)::before { top: var(--note-editor-content-padding-top, 12px); left: 20px; color: var(--desc-color); opacity: 0.88; } .note-editor-body pre.code-block, .mce-content-body pre.code-block, .note-editor-body pre[class*="language-"], .mce-content-body pre[class*="language-"] { background: var(--pre-bg-color); color: var(--pre-text-color); border-color: var(--pre-border-color); box-shadow: inset 0 1px 0 var(--pre-highlight-color, transparent); } .note-editor-body pre.code-block[data-language]::before, .mce-content-body pre.code-block[data-language]::before { color: var(--pre-muted-color, var(--desc-color)); }',
      '.note-editor-body img[data-ln-size], .mce-content-body img[data-ln-size] { display:block; height:auto!important; max-width:100%!important; margin-inline:auto; } .note-editor-body img[data-ln-size="original"], .mce-content-body img[data-ln-size="original"] { width:auto!important; } .note-editor-body img[data-ln-size="small"], .mce-content-body img[data-ln-size="small"] { width:40%!important; } .note-editor-body img[data-ln-size="medium"], .mce-content-body img[data-ln-size="medium"] { width:64%!important; } .note-editor-body img[data-ln-size="large"], .mce-content-body img[data-ln-size="large"] { width:82%!important; } .note-editor-body img[data-ln-size="full"], .mce-content-body img[data-ln-size="full"] { width:100%!important; }',
      '.note-editor-body .ln-media-text, .mce-content-body .ln-media-text { --ln-media-width:36%; --ln-media-max-width:340px; --ln-media-max-height:260px; display:block; clear:both; margin:14px 0; } .note-editor-body .ln-media-text[data-ln-media-width="30"], .mce-content-body .ln-media-text[data-ln-media-width="30"] { --ln-media-width:30%; --ln-media-max-width:280px; --ln-media-max-height:220px; } .note-editor-body .ln-media-text[data-ln-media-width="42"], .mce-content-body .ln-media-text[data-ln-media-width="42"] { --ln-media-width:42%; --ln-media-max-width:400px; --ln-media-max-height:300px; } .note-editor-body .ln-media-text__item, .mce-content-body .ln-media-text__item { display:flex; align-items:flex-start; gap:14px; margin:10px 0; padding:10px; border:1px solid var(--surface-border-color, #e3e6eb); border-radius:10px; box-sizing:border-box; } .note-editor-body .ln-media-text[data-ln-media-position="right"] .ln-media-text__item, .mce-content-body .ln-media-text[data-ln-media-position="right"] .ln-media-text__item { flex-direction:row-reverse; } .note-editor-body .ln-media-text__media, .mce-content-body .ln-media-text__media { display:flex; flex:0 1 var(--ln-media-width); max-width:var(--ln-media-max-width); min-width:0; justify-content:center; align-items:flex-start; } .note-editor-body .ln-media-text__media img, .mce-content-body .ln-media-text__media img { display:block!important; float:none!important; width:auto!important; max-width:100%!important; height:auto!important; max-height:var(--ln-media-max-height)!important; margin:0!important; border-radius:8px; object-fit:contain; } .note-editor-body .ln-media-text__content, .mce-content-body .ln-media-text__content { position:relative; flex:1 1 auto; min-width:0; min-height:44px; overflow-wrap:anywhere; } .note-editor-body .ln-media-text__content > :first-child, .mce-content-body .ln-media-text__content > :first-child { margin-top:0; } .note-editor-body .ln-media-text__content > :last-child, .mce-content-body .ln-media-text__content > :last-child { margin-bottom:0; } .note-editor-body[contenteditable="true"] .ln-media-text__content[data-mce-placeholder]::before, .mce-content-body[contenteditable="true"] .ln-media-text__content[data-mce-placeholder]::before { content:attr(data-mce-placeholder); position:absolute; inset:0 auto auto 0; color:var(--desc-color, #8a919f); pointer-events:none; } .note-editor-body .ln-media-text__item[data-ln-media-item-selected="true"], .mce-content-body .ln-media-text__item[data-ln-media-item-selected="true"] { border-color:var(--primary-color, #615ced); }',
      '.note-editor-body .ln-ai-selection-pending, .mce-content-body .ln-ai-selection-pending { display:inline-flex; width:18px; height:18px; align-items:center; justify-content:center; margin-left:5px; border:1px solid var(--primary-color, #615ced); border-radius:999px; background:var(--background-color, #fff); vertical-align:text-bottom; box-sizing:border-box; } .note-editor-body .ln-ai-selection-pending__spinner, .mce-content-body .ln-ai-selection-pending__spinner { width:9px; height:9px; border:2px solid var(--surface-border-color, #d7d9e0); border-top-color:var(--primary-color, #615ced); border-radius:50%; box-sizing:border-box; animation:ln-ai-selection-spin .7s linear infinite; } @keyframes ln-ai-selection-spin { to { transform:rotate(360deg); } }',
      // 资源 chip 用普通 inline box，不参与行高计算；避免插入后把整行文字向下撑开。
      '.note-editor-body a.ln-resource-link, .mce-content-body a.ln-resource-link{ display:inline; margin:0 2px; padding:0 6px; line-height:inherit; vertical-align:baseline; overflow-wrap:anywhere; -webkit-box-decoration-break:clone; box-decoration-break:clone; }',
      bookmark.isMobile
        ? '.note-editor-body, .mce-content-body { max-width: 100%; overflow-wrap: anywhere; box-sizing: border-box; } .note-editor-body h1, .mce-content-body h1 { font-size: clamp(26px, 8vw, 38px); line-height: 1.2; overflow-wrap: anywhere; } .note-editor-body[contenteditable="true"] img, .mce-content-body[contenteditable="true"] img { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }'
        : '',
    ].join(' '),
  }));

  watchEffect(() => {
    if (!editorRef.value) return;
    if (editorRef.value.mode?.set) {
      editorRef.value.mode.set(props.readonly ? 'readonly' : 'design');
      return;
    }
    if (editorRef.value.setMode) {
      editorRef.value.setMode(props.readonly ? 'readonly' : 'design');
    }
  });

  onMounted(() => {
    ensureToolbar();
    const container = document.getElementById('editor-container');
    if (container && 'IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(async (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          await ensureToolbarRendered();
        }
      });
      visibilityObserver.observe(container);
    }
  });

  watch(currentLang, () => {
    if (!editorReady.value) return;
    forceReinit();
  });

  watch(isNightTheme, () => {
    if (!editorReady.value) return;
    forceReinit();
  });

  onBeforeUnmount(() => {
    if (mdRenderTimer) clearTimeout(mdRenderTimer);
    if (mdScrollUnlockTimer) window.clearTimeout(mdScrollUnlockTimer);
    if (mermaidCompanionTimer) window.clearTimeout(mermaidCompanionTimer);
    if (visibilityObserver) {
      visibilityObserver.disconnect();
      visibilityObserver = null;
    }
    // TinyMCE Vue 包装组件负责实际 remove；父组件只提前清理仍需访问活动 DOM 的状态，
    // 避免父子 onBeforeUnmount 对同一实例重复销毁。
    prepareRichEditorForUnmount();
  });
</script>

<style lang="less">
  /* 搜不到结果时视觉隐藏,但保留 DOM:面板要继续搜索,
     这样从 @test123 退回 @test 能自动重新出现,不必删到只剩 @ */
  .resource-mention-inline-popover.is-empty {
    display: none !important;
  }

  .editor-slash-command-popover {
    padding: 0 !important;
    overflow: hidden;
  }

  /* 弹框内的资源选择面板铺满可用宽度,不保留浮层的固定窄宽 */
  .note-resource-picker-modal {
    width: 100%;
    max-width: none;
    padding: 0;
  }

  #editor-container.note-editor {
    --note-editor-content-padding-top: 12px;
    --note-editor-content-line-height: 1.65;
    --note-markdown-font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
    --note-markdown-font-size: 13px;
    --note-markdown-line-height: 22px;
    --note-markdown-padding-top: 14px;
    --note-markdown-padding-inline: 16px;

    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    height: auto;
    min-height: 0;
    overflow: hidden;
  }
  #editor-container.note-editor.is-mobile {
    --note-editor-content-padding-top: 16px;
    --note-markdown-font-size: 15px;
    --note-markdown-line-height: 25.5px;
    --note-markdown-padding-top: 16px;
    --note-markdown-padding-inline: 18px;
  }
  .note-editor-toolbar {
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    overflow: visible;
    border-bottom: 0;
    background-color: var(--note-editor-header-bg, var(--w-e-toolbar-bg-color));
  }

  .note-shortcuts {
    max-height: min(620px, 72vh);
    overflow-y: auto;
    color: var(--text-color);
  }

  .note-shortcuts__intro {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-page-bg, var(--background-color));

    strong {
      display: block;
      margin-bottom: 3px;
      font-size: 14px;
    }

    p {
      margin: 0;
      color: var(--desc-color);
      font-size: 12px;
      line-height: 1.55;
    }
  }

  .note-shortcuts__intro-icon {
    display: inline-flex;
    width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    background: var(--mobile-selected-bg, var(--hover-background));
    color: var(--primary-color);
  }

  .note-shortcuts__section {
    margin-top: 18px;

    h3 {
      margin: 0 0 8px;
      color: var(--desc-color);
      font-size: 12px;
      font-weight: 600;
    }
  }

  .note-shortcuts__list {
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
  }

  .note-shortcuts__row {
    display: flex;
    min-height: 48px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 12px;

    & + & {
      border-top: 1px solid var(--surface-divider-color, var(--surface-border-color));
    }

    dt {
      min-width: 0;
      font-size: 14px;
    }

    small {
      display: block;
      margin-top: 2px;
      color: var(--desc-color);
      font-size: 11px;
      line-height: 1.4;
    }

    dd {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      margin: 0;
      flex: 0 0 auto;
    }

    kbd {
      min-width: 26px;
      padding: 4px 7px;
      border: 1px solid var(--surface-border-color);
      border-bottom-width: 2px;
      border-radius: 6px;
      background: var(--surface-page-bg, var(--background-color));
      color: var(--text-color);
      font-family: var(--app-font-family);
      font-size: 11px;
      line-height: 1.2;
      text-align: center;
      white-space: nowrap;
    }
  }

  .note-shortcuts__or {
    color: var(--desc-color);
    font-size: 11px;
  }

  @media (max-width: 520px) {
    .note-shortcuts {
      max-height: 68vh;
    }

    .note-shortcuts__row {
      align-items: flex-start;
      flex-direction: column;
      gap: 7px;

      dd {
        width: 100%;
        justify-content: flex-start;
        flex-wrap: wrap;
      }
    }
  }
  .note-editor-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .note-editor-warmup-leave-active {
    transition: opacity 90ms ease-out;
  }
  .note-editor-warmup-leave-to {
    opacity: 0;
    pointer-events: none;
  }
  .note-editor-runtime-skeleton {
    position: absolute;
    z-index: 3;
    inset: 0;
    min-height: 100%;
    overflow: hidden;
    background: var(--surface-page-bg, var(--background-color));
  }
  .note-editor-body {
    outline: none;
    overflow: visible;
  }
  .note-editor-rich-content {
    box-sizing: border-box;
    min-height: 100%;
    background-color: var(--surface-page-bg, var(--background-color));
    color: var(--text-color);
    font-family: inherit;
    padding: var(--note-editor-content-padding-top, 12px) 20px clamp(180px, 35vh, 380px);
    line-height: var(--note-editor-content-line-height, 1.65);
    overflow-wrap: anywhere;

    > :first-child {
      margin-top: 0;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0.6em 0 0.4em;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    td,
    th {
      padding: 6px 10px;
      border: 1px solid var(--surface-border-color, #d9d9d9);
    }

    pre.code-block,
    pre[class*='language-'] {
      padding: 12px 14px;
      overflow: auto;
      border: 1px solid var(--pre-border-color, rgba(148, 163, 184, 0.4));
      border-radius: 10px;
      background: var(--pre-bg-color);
      box-shadow: inset 0 1px 0 var(--pre-highlight-color, transparent);
      color: var(--pre-text-color, #ffffff);

      code {
        display: block;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        font-size: 13px;
        white-space: pre;
      }
    }

    pre.code-block[data-language]::before {
      content: attr(data-language);
      display: inline-block;
      margin-bottom: 8px;
      color: var(--pre-muted-color, var(--desc-color));
      font-size: 12px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    blockquote {
      margin: 0;
      padding: 4px 12px;
      border-left: 3px solid var(--primary-color, #615ced);
      border-radius: 0 6px 6px 0;
      background: var(--common-tag-bg-color, #f9f9f9);
      color: var(--desc-color, #666);
    }

    a:not(.ln-resource-link) {
      color: var(--note-editor-link-color, var(--info-color, var(--primary-color)));
      text-decoration-color: currentColor;
      text-underline-offset: 2px;
    }

    img {
      max-width: 100% !important;
      height: auto !important;
      box-sizing: border-box;
      object-fit: contain;
    }

    ul,
    ol {
      padding-left: 20px;
    }

    .note-task-list {
      padding-left: 0 !important;
      list-style: none !important;
      list-style-type: none !important;
    }

    .note-task-list-item {
      list-style: none !important;
      list-style-type: none !important;
    }

    .note-task-list-item::marker {
      content: '';
    }

    .note-todo-checkbox {
      margin: 0 6px 0 0;
      vertical-align: middle;
    }

    a.ln-resource-link {
      display: inline;
      margin: 0 2px;
      padding: 0 6px;
      overflow-wrap: anywhere;
      border: 1px solid color-mix(in srgb, var(--primary-color) 26%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-color) 9%, transparent);
      color: var(--primary-color);
      line-height: inherit;
      text-decoration: none;
      vertical-align: baseline;
      cursor: pointer;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;

      &[data-ln-resource-state='unavailable'] {
        border-style: dashed;
        background: color-mix(in srgb, var(--desc-color) 8%, transparent);
        color: var(--desc-color);
        cursor: not-allowed;
      }
    }
  }

  #editor-container.note-editor.is-mobile .note-editor-rich-content h1 {
    font-size: clamp(26px, 8vw, 38px);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  #editor-container .ln-media-text {
    --ln-media-width: 36%;
    --ln-media-max-width: 340px;
    --ln-media-max-height: 260px;
    display: block;
    clear: both;
    margin: 14px 0;

    &[data-ln-media-width='30'] {
      --ln-media-width: 30%;
      --ln-media-max-width: 280px;
      --ln-media-max-height: 220px;
    }

    &[data-ln-media-width='42'] {
      --ln-media-width: 42%;
      --ln-media-max-width: 400px;
      --ln-media-max-height: 300px;
    }

    &[data-ln-media-position='right'] .ln-media-text__item {
      flex-direction: row-reverse;
    }
  }

  #editor-container .ln-media-text__item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    box-sizing: border-box;
    margin: 10px 0;
    padding: 10px;
    border: 1px solid var(--surface-border-color, #e3e6eb);
    border-radius: 10px;

    &[data-ln-media-item-selected='true'] {
      border-color: var(--primary-color, #615ced);
    }
  }

  #editor-container .ln-media-text__media {
    display: flex;
    flex: 0 1 var(--ln-media-width);
    max-width: var(--ln-media-max-width);
    min-width: 0;
    align-items: flex-start;
    justify-content: center;

    img {
      display: block !important;
      float: none !important;
      width: auto !important;
      max-width: 100% !important;
      height: auto !important;
      max-height: var(--ln-media-max-height) !important;
      margin: 0 !important;
      border-radius: 8px;
      object-fit: contain;
    }
  }

  #editor-container .ln-media-text__content {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    overflow-wrap: anywhere;

    > :first-child {
      margin-top: 0;
    }

    > :last-child {
      margin-bottom: 0;
    }
  }

  #editor-container .ln-ai-selection-pending {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    margin-left: 5px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    background: var(--background-color);
    vertical-align: text-bottom;
    box-sizing: border-box;
  }

  #editor-container .ln-ai-selection-pending__spinner {
    width: 9px;
    height: 9px;
    border: 2px solid var(--surface-border-color);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    box-sizing: border-box;
    animation: ln-ai-selection-spin 0.7s linear infinite;
  }

  @keyframes ln-ai-selection-spin {
    to {
      transform: rotate(360deg);
    }
  }

  #editor-container .note-editor-body[contenteditable='true'] .ln-media-text__content[data-mce-placeholder]::before {
    content: attr(data-mce-placeholder);
    position: absolute;
    inset: 0 auto auto 0;
    color: var(--desc-color, #8a919f);
    pointer-events: none;
  }

  .rich-media-text-anchor {
    position: fixed;
  }

  .rich-media-text-popover {
    width: min(620px, calc(100vw - 16px));
    padding: 10px;
  }

  .rich-media-text-toolbar {
    display: flex;
    align-items: flex-end;
    gap: 10px;

    &__heading {
      display: flex;
      align-items: center;
      align-self: center;
      gap: 6px;
      color: var(--text-color);
      white-space: nowrap;
    }

    &__field {
      display: grid;
      flex: 0 0 116px;
      gap: 4px;

      > span {
        color: var(--desc-color, #737782);
        font-size: 12px;
        line-height: 1.2;
      }

      .b-select {
        width: 100%;
      }
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-left: auto;

      .b_btn {
        gap: 5px;
      }
    }
  }

  .resource-mention-mobile-preview {
    display: grid;
    gap: 14px;
    min-width: min(300px, calc(90vw - 32px));

    &__summary {
      display: grid;
      gap: 4px;

      strong {
        overflow: hidden;
        color: var(--text-color);
        font-size: 16px;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      span {
        color: var(--desc-color, #737782);
        font-size: 13px;
      }
    }

    &__status {
      margin: 0;
      color: var(--desc-color, #737782);
      font-size: 13px;
      line-height: 1.5;

      &.is-unavailable {
        color: var(--error-color, #e5484d);
      }
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }
  }

  /* 模式切换栏 */
  .editor-mode-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--card-border-color, #e8eaf2);
    background: var(--surface-panel-bg, var(--background-color));
  }
  .mode-pill {
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    height: 22px;
    border-radius: 11px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.15s;
    user-select: none;
    background: var(--common-tag-bg-color, #f0f0f0);
    color: var(--desc-color, #666);
    &.is-markdown {
      background: #615ced20;
      color: #615ced;
    }
    &.is-html {
      background: #00a88420;
      color: #00a884;
    }
    &:hover {
      opacity: 0.8;
    }
  }
  .undo-switch-btn {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    height: 22px;
    border: 1px solid var(--card-border-color, #e8eaf2);
    border-radius: 6px;
    background: transparent;
    color: var(--text-color);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    &:hover {
      background: var(--common-tag-bg-color, #f0f0f0);
      border-color: var(--primary-color, #615ced);
      color: var(--primary-color, #615ced);
    }
  }

  /* Markdown 编辑器工具栏 */
  /*
   * 视图 tab 与下面那条编辑工具栏是同一个「头部区」,连成一片:
   * tab 组件自己带底轨线,这里再画一条 border-bottom 就变成两条挨着的横线,
   * 加上栏标签行的线,一屏里三条平行线,非常吵。
   */
  .md-editor-toolbar {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding: 0 12px;
    background: var(--note-editor-header-bg, var(--surface-panel-bg, var(--background-color)));
    flex-shrink: 0;
  }
  @media (max-width: 767px) {
    .md-editor-toolbar {
      min-height: 48px;
    }
  }

  /*
   * 选择器带父级是为了压过 BTabs 的 .tab-container(同特异性、加载顺序在后):
   * 它自带的 margin-bottom: 10px 是给独立成块的 tab 组留的外间距,在这里全变成
   * 「按钮上方一大片空白」,只压这一项。
   * 注意别顺手把 border-bottom / padding-bottom 也清掉 —— 那条下边框和下划线的呼吸空间
   * 是 tab 组件本身的样子,一直都在。
   */
  .md-editor-toolbar .md-view-toggle {
    flex: 1 1 auto;
    min-width: 0;
    gap: 0;
    margin: 0;

    .tab {
      flex: 1 1 0;
      min-width: 0;
      justify-content: center;
      padding: 9px 14px 8px;
      color: var(--desc-color);
      font-size: 12px;
    }

    .tab.is-active {
      color: var(--resource-note-color, #00a884);
      font-weight: 650;
    }

    .underline {
      height: 2px;
      border-radius: 0;
      background: var(--resource-note-color, #00a884);
    }
  }
  .note-editor .editor-toolbar-v2__trailing .md-view-switch {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 28px;
    margin: 0;
    box-sizing: border-box;
    border: 0;
    background: transparent;
  }
  .note-editor .editor-toolbar-v2__trailing .md-view-switch__button {
    width: 28px;
    min-width: 28px;
    height: 28px;
    padding: 0;
    border: 0 !important;
    border-bottom: 2px solid transparent !important;
    border-radius: 4px 4px 0 0;
    background: transparent;
    box-shadow: none;
    color: var(--desc-color);
    transition:
      color 0.15s ease,
      background-color 0.15s ease,
      border-color 0.15s ease;
  }
  .note-editor .editor-toolbar-v2__trailing .md-view-switch__button:hover {
    background: var(--hover-background);
    color: var(--text-color);
  }
  .note-editor .editor-toolbar-v2__trailing .md-view-switch__button.is-active {
    border-bottom-color: var(--primary-color) !important;
    background: transparent;
    color: var(--primary-color);
  }
  /* Markdown 编辑器 */
  .md-editor-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .md-editor-body {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
    &.md-view-edit .md-preview-pane,
    &.md-view-preview .md-editor-pane {
      display: none;
    }
  }
  .md-editor-pane,
  .md-preview-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .md-editor-pane {
    position: relative;
    border-right: 1px solid var(--card-border-color, #e8eaf2);
  }
  .md-textarea {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }
  .md-preview {
    flex: 1;
    min-width: 0;
    max-width: 100%;
    min-height: 0;
    overflow: auto;
    box-sizing: border-box;
    padding: var(--note-markdown-padding-top, 14px) var(--note-markdown-padding-inline, 16px) clamp(160px, 35vh, 360px);
    color: var(--text-color);
    font-family: var(
      --note-markdown-font-family,
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Courier New',
      monospace
    );
    font-size: var(--note-markdown-font-size, 13px);
    line-height: var(--note-markdown-line-height, 22px);
    overflow-wrap: anywhere;
    word-break: break-word;
    > :first-child {
      margin-top: 0;
    }
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0.6em 0 0.4em;
    }
    pre {
      max-width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--card-border-color, #e5e7eb);
      border-radius: 8px;
      padding: 10px 12px;
      overflow: visible;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
        font-size: 13px;
        white-space: inherit;
        overflow-wrap: inherit;
        word-break: inherit;
      }
    }
    code {
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      th,
      td {
        border: 1px solid var(--card-border-color, #d9d9d9);
        padding: 6px 10px;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
    }
    blockquote {
      border-left: 3px solid var(--primary-color, #615ced);
      margin: 0;
      padding: 4px 12px;
      color: var(--desc-color, #666);
      background: var(--common-tag-bg-color, #f9f9f9);
      border-radius: 0 6px 6px 0;
    }
    a:not(.ln-resource-link) {
      color: var(--note-editor-link-color, var(--info-color, var(--primary-color)));
      overflow-wrap: anywhere;
      word-break: break-word;
      text-decoration-color: currentColor;
      text-underline-offset: 2px;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    ul,
    ol {
      padding-left: 20px;
    }
    .note-task-list {
      padding-left: 0 !important;
      list-style: none !important;
      list-style-type: none !important;
    }
    .note-task-list-item {
      list-style: none !important;
      list-style-type: none !important;
    }
    .note-task-list-item::marker {
      content: '';
    }
    .note-todo-checkbox {
      margin: 0 7px 0 0;
      vertical-align: middle;
    }
    a.ln-resource-link {
      // inline 的 border 不参与行高计算，标签不会再把同一行文本顶开。
      display: inline;
      margin: 0 2px;
      padding: 0 6px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 26%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-color) 9%, transparent);
      color: var(--primary-color);
      line-height: inherit;
      text-decoration: none;
      vertical-align: baseline;
      cursor: pointer;
      overflow-wrap: anywhere;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;

      &[data-ln-resource-state='unavailable'] {
        border-style: dashed;
        background: color-mix(in srgb, var(--desc-color) 8%, transparent);
        color: var(--desc-color);
        cursor: not-allowed;
      }
    }
  }

  @media (max-width: 420px) {
    .md-editor-toolbar {
      padding: 0 8px;
    }
  }

  .note-editor .tox .tox-toolbar,
  .note-editor .tox .tox-toolbar__primary,
  .note-editor .tox .tox-toolbar__overflow {
    background-color: var(--note-editor-header-bg, var(--w-e-toolbar-bg-color)) !important;
    border: none !important;
    box-shadow: none !important;
  }
  .note-editor .tox .tox-editor-header {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background-color: var(--note-editor-header-bg, var(--w-e-toolbar-bg-color)) !important;
  }
  .note-editor .tox .tox-toolbar__group {
    border: none !important;
    box-shadow: none !important;
  }
  .note-editor .tox .tox-tbtn svg {
    fill: var(--w-e-toolbar-color) !important;
  }
  .note-editor .tox .tox-tbtn--disabled svg {
    fill: #999 !important;
  }
  .note-editor .tox .tox-collection__item-label {
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note-editor .tox .tox-edit-area,
  .note-editor .tox .tox-edit-area__iframe {
    background-color: var(--surface-page-bg, var(--background-color)) !important;
  }
  [data-theme='night'] {
    .note-editor-toolbar {
      border-bottom-color: var(--surface-border-color);
      background-color: var(--note-editor-header-bg, var(--surface-panel-bg));
    }

    .note-editor .tox .tox-toolbar,
    .note-editor .tox .tox-toolbar__primary,
    .note-editor .tox .tox-toolbar__overflow,
    .note-editor .tox .tox-editor-header {
      background-color: var(--note-editor-header-bg, var(--surface-panel-bg)) !important;
    }

    .note-editor .tox .tox-toolbar__group {
      background-color: transparent !important;
      border-right: 1px solid var(--surface-divider-color) !important;
    }

    .note-editor .tox .tox-tbtn,
    .note-editor .tox .tox-mbtn {
      color: var(--icon-color) !important;
      background-color: var(--card-background) !important;
      border: 1px solid var(--surface-border-color) !important;
    }

    .note-editor .tox .tox-tbtn__select-label,
    .note-editor .tox .tox-mbtn__select-label {
      color: var(--icon-color) !important;
    }

    .note-editor .tox .tox-tbtn svg,
    .note-editor .tox .tox-mbtn svg {
      fill: var(--icon-color) !important;
    }

    .note-editor .tox .tox-tbtn:hover,
    .note-editor .tox .tox-tbtn:focus,
    .note-editor .tox .tox-mbtn:hover,
    .note-editor .tox .tox-mbtn:focus {
      background-color: var(--hover-background) !important;
      border-color: color-mix(in srgb, var(--primary-color) 26%, var(--surface-border-color)) !important;
      color: var(--text-color) !important;
    }

    .note-editor .tox .tox-tbtn:hover svg,
    .note-editor .tox .tox-tbtn:focus svg,
    .note-editor .tox .tox-mbtn:hover svg,
    .note-editor .tox .tox-mbtn:focus svg {
      fill: var(--text-color) !important;
    }

    .note-editor .tox .tox-tbtn.tox-tbtn--enabled,
    .note-editor .tox .tox-tbtn.tox-tbtn--enabled:hover {
      background-color: color-mix(in srgb, var(--primary-color) 18%, var(--card-background)) !important;
      border-color: color-mix(in srgb, var(--primary-color) 46%, var(--surface-border-color)) !important;
      color: var(--text-color) !important;
    }

    .note-editor .tox .tox-tbtn.tox-tbtn--enabled svg,
    .note-editor .tox .tox-tbtn.tox-tbtn--enabled:hover svg {
      fill: var(--text-color) !important;
    }

    .note-editor .tox .tox-tbtn--disabled,
    .note-editor .tox .tox-tbtn--disabled:hover {
      background-color: var(--workspace-panel-bg-color) !important;
      border-color: var(--surface-divider-color) !important;
      color: var(--desc-color) !important;
    }

    .note-editor .tox .tox-tbtn--disabled svg {
      fill: var(--desc-color) !important;
    }

    .note-editor .tox .tox-collection,
    .note-editor .tox .tox-menu,
    .note-editor .tox .tox-collection--list,
    .note-editor .tox .tox-collection--grid {
      background-color: var(--card-background) !important;
      border: 1px solid var(--surface-border-color) !important;
      color: var(--text-color) !important;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35) !important;
    }

    .note-editor .tox .tox-collection__item,
    .note-editor .tox .tox-collection__item-label {
      color: var(--text-color) !important;
    }

    .note-editor .tox .tox-collection__item--active,
    .note-editor .tox .tox-collection__item--enabled:hover,
    .note-editor .tox .tox-collection__item--enabled:focus {
      background-color: var(--hover-background) !important;
      color: var(--text-color) !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item,
    .note-editor .tox .tox-collection--list .tox-collection__item-label,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h1,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h2,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h3,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h4,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h5,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h6,
    .note-editor .tox .tox-collection--list .tox-collection__item-label p,
    .note-editor .tox .tox-collection--list .tox-collection__item-label pre {
      color: var(--text-color) !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item--active,
    .note-editor .tox .tox-collection--list .tox-collection__item--enabled:hover,
    .note-editor .tox .tox-collection--list .tox-collection__item--enabled:focus,
    .note-editor .tox .tox-collection--list .tox-collection__item--selected {
      background-color: color-mix(in srgb, var(--primary-color) 13%, var(--hover-background)) !important;
      color: var(--text-color) !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled,
    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled .tox-collection__item-label,
    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled .tox-collection__item-label * {
      color: var(--desc-color) !important;
    }

    .tox .tox-collection--list .tox-collection__item--active,
    .tox .tox-collection--list .tox-collection__item--enabled:hover,
    .tox .tox-collection--list .tox-collection__item--enabled:focus,
    .tox .tox-collection--list .tox-collection__item--selected {
      background-color: color-mix(in srgb, var(--primary-color) 13%, var(--hover-background)) !important;
      color: var(--text-color) !important;
    }

    .tox .tox-collection--list .tox-collection__item--enabled:not(.tox-collection__item--state-disabled) {
      background-color: #2f3442 !important;
      color: #dfe3ee !important;
    }

    .tox .tox-collection--list .tox-collection__item--active:not(.tox-collection__item--state-disabled),
    .tox .tox-collection--list .tox-collection__item--active.tox-collection__item--state-disabled {
      background-color: #4a5163 !important;
      color: #ffffff !important;
    }
  }
  code[data-mce-selected='inline-boundary'] {
    background-color: unset !important;
  }
  .note-editor-body pre[class*='language-'],
  .mce-content-body pre[class*='language-'] {
    text-shadow: none !important;
  }
  .tox .tox-collection__item {
    cursor: pointer;
    height: 24px;
  }
  .tox-collection__item-label {
    h1 {
      font-size: 17px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h2 {
      font-size: 16px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h3 {
      font-size: 15px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h4 {
      font-size: 14px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h5 {
      font-size: 13px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h6 {
      font-size: 12px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    p {
      font-size: 11px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    pre {
      color: var(--text-color) !important;
      font-family: var(--app-font-family) !important;
      font-size: 12px !important;
      background-color: transparent !important;
      border: none !important;
      overflow: hidden !important;
    }
  }

  .rich-color-dialog {
    display: grid;
    gap: 12px;
    color: var(--text-color);

    > p {
      margin: 0;
      color: var(--desc-color);
      line-height: 1.55;
    }

    > label {
      font-weight: 600;
    }
  }

  .rich-mermaid-editor {
    display: grid;
    gap: 10px;
    color: var(--text-color);

    > p {
      margin: 0 0 2px;
      color: var(--desc-color);
      line-height: 1.55;
    }

    > label {
      font-weight: 600;
    }

    .b-textarea {
      min-height: min(46vh, 360px);
      font:
        13px/1.6 ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
      tab-size: 2;
    }
  }

  .rich-mermaid-editor__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .rich-color-dialog__palette {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }

  .rich-color-dialog__swatch.b_btn {
    width: 100%;
    min-width: 0;
    height: 38px;
    padding: 4px;
    border: 2px solid var(--surface-border-color);
    background: var(--card-background);

    > span {
      display: block;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(0, 0, 0, 0.24);
      border-radius: 5px;
      background: var(--rich-color-swatch);
    }

    &.is-active {
      border-color: var(--primary-color);
      outline: 1px solid var(--primary-color);
    }
  }

  .rich-color-dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    .b_btn {
      min-height: 40px;
    }
  }

  .rich-text-gradient-dialog {
    display: grid;
    gap: 14px;
    color: var(--text-color);

    > p {
      margin: 0;
      color: var(--desc-color);
      line-height: 1.55;
    }
  }

  .rich-text-gradient-dialog__preview {
    min-height: 76px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-page-bg, var(--background-color));

    > span {
      font-size: 26px;
      font-weight: 750;
      line-height: 1.3;
      text-align: center;
    }
  }

  .rich-text-gradient-dialog__palette-title {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .rich-text-gradient-dialog__palette {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .rich-text-gradient-dialog__preset.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 54px;
    height: auto;
    padding: 5px;
    display: grid;
    gap: 4px;
    border: 2px solid var(--surface-border-color);
    background: var(--card-background);

    > span {
      display: block;
      width: 100%;
      height: 24px;
      border: 1px solid rgba(0, 0, 0, 0.18);
      border-radius: 6px;
      background: linear-gradient(90deg, var(--gradient-preset-from), var(--gradient-preset-to));
    }

    > small {
      min-width: 0;
      overflow: hidden;
      color: var(--desc-color);
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &.is-active {
      border-color: var(--primary-color);
      outline: 1px solid var(--primary-color);
    }
  }

  .rich-text-gradient-dialog__fields {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    align-items: center;
    gap: 10px 12px;

    > label {
      font-weight: 600;
    }
  }

  .rich-text-gradient-dialog__color-control {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    align-items: center;
    gap: 8px;
  }

  .rich-text-gradient-dialog__color-picker-tooltip,
  .rich-text-gradient-dialog__color-picker {
    width: 44px;
  }

  .rich-text-gradient-dialog__color-picker :deep(.b-input) {
    padding: 3px !important;
    border: 1px solid var(--surface-border-color) !important;
    background: var(--card-background);
    cursor: pointer;
  }

  .rich-text-gradient-dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    .b_btn {
      min-height: 40px;
    }
  }

  .note-conversion-preview {
    display: grid;
    gap: 14px;
    color: var(--text-color);
  }

  .note-conversion-preview__notice {
    margin: 0;
    padding: 11px 13px;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--background-color);
    font-weight: 600;
    line-height: 1.55;
  }

  .note-conversion-preview__summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;

    > div {
      display: grid;
      gap: 5px;
      padding: 12px;
      border: 1px solid var(--surface-border-color);
      border-top-width: 3px;
      border-radius: 10px;
      background: var(--surface-page-bg, var(--background-color));

      span {
        color: var(--desc-color);
        font-size: 12px;
      }
    }

    .is-preserved {
      border-top-color: var(--resource-note-color, #00a884);
    }

    .is-standardized {
      border-top-color: var(--warning-color, #d97706);
    }

    .is-risk {
      border-top-color: var(--error-color, #dc2626);
    }
  }

  .note-conversion-preview__issues {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;

    > div {
      min-height: 40px;
      padding: 0 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--surface-border-color);

      &:last-child {
        border-bottom: 0;
      }
    }
  }

  .note-conversion-preview__safe {
    margin: 0;
    color: var(--resource-note-color, #00a884);
    font-weight: 600;
  }

  .note-conversion-preview__content {
    min-height: 0;
    display: grid;
    gap: 8px;

    pre,
    .note-conversion-preview__rendered {
      max-height: min(34vh, 300px);
      margin: 0;
      padding: 12px;
      box-sizing: border-box;
      overflow: auto;
      border: 1px solid var(--surface-border-color);
      border-radius: 10px;
      color: var(--text-color);
      background: var(--pre-bg-color, var(--surface-page-bg));
    }

    pre {
      font:
        13px/1.55 ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }

  .note-conversion-preview__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    .b_btn {
      min-height: 40px;
    }
  }

  .note-editor-rich-content img[data-ln-size],
  .md-preview img[data-ln-size],
  .note-conversion-preview__rendered img[data-ln-size],
  .mobile-image-settings__preview img[data-ln-size] {
    display: block;
    max-width: 100% !important;
    height: auto !important;
    margin-inline: auto;
  }

  .note-editor-rich-content img[data-ln-size='original'],
  .md-preview img[data-ln-size='original'],
  .note-conversion-preview__rendered img[data-ln-size='original'],
  .mobile-image-settings__preview img[data-ln-size='original'] {
    width: auto !important;
  }

  .note-editor-rich-content img[data-ln-size='small'],
  .md-preview img[data-ln-size='small'],
  .note-conversion-preview__rendered img[data-ln-size='small'],
  .mobile-image-settings__preview img[data-ln-size='small'] {
    width: 40% !important;
  }

  .note-editor-rich-content img[data-ln-size='medium'],
  .md-preview img[data-ln-size='medium'],
  .note-conversion-preview__rendered img[data-ln-size='medium'],
  .mobile-image-settings__preview img[data-ln-size='medium'] {
    width: 64% !important;
  }

  .note-editor-rich-content img[data-ln-size='large'],
  .md-preview img[data-ln-size='large'],
  .note-conversion-preview__rendered img[data-ln-size='large'],
  .mobile-image-settings__preview img[data-ln-size='large'] {
    width: 82% !important;
  }

  .note-editor-rich-content img[data-ln-size='full'],
  .md-preview img[data-ln-size='full'],
  .note-conversion-preview__rendered img[data-ln-size='full'],
  .mobile-image-settings__preview img[data-ln-size='full'] {
    width: 100% !important;
  }

  .mobile-image-settings {
    display: grid;
    gap: 12px;
    color: var(--text-color);

    > p {
      margin: 0;
      color: var(--desc-color);
      font-size: 13px;
      line-height: 1.55;
    }
  }

  .mobile-image-settings__preview {
    min-height: 104px;
    max-height: 180px;
    padding: 10px;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--surface-page-bg, var(--background-color));

    img {
      max-height: 158px;
      object-fit: contain;
    }
  }

  .mobile-image-settings__preview-button.b_btn {
    width: 100%;
    height: auto;
    min-height: 82px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
  }

  .mobile-image-settings__options {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 7px;
  }

  .mobile-image-settings__option.b_btn {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 64px;
    padding: 7px 4px 6px;
    display: grid;
    grid-template-rows: 18px auto;
    justify-items: center;
    align-content: center;
    gap: 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--surface-page-bg, var(--background-color));
    color: var(--desc-color);
    font-size: 12px;

    &.is-active {
      border-color: var(--primary-color);
      background: var(--primary-color-light, var(--surface-page-bg, var(--background-color)));
      color: var(--primary-color);
      font-weight: 600;
    }
  }

  .mobile-image-settings__size-mark {
    align-self: center;
    height: 7px;
    border: 1px solid currentColor;
    border-radius: 2px;
    background: currentColor;
    opacity: 0.72;
  }

  .mobile-image-settings__option.is-original .mobile-image-settings__size-mark {
    width: 24px;
    background: transparent;
  }

  .mobile-image-settings__option.is-small .mobile-image-settings__size-mark {
    width: 28%;
  }

  .mobile-image-settings__option.is-medium .mobile-image-settings__size-mark {
    width: 48%;
  }

  .mobile-image-settings__option.is-large .mobile-image-settings__size-mark {
    width: 70%;
  }

  .mobile-image-settings__option.is-full .mobile-image-settings__size-mark {
    width: 88%;
  }

  .mobile-image-settings__check {
    position: absolute;
    top: 4px;
    right: 4px;
    color: var(--primary-color);
  }

  @media (max-width: 767px) {
    #editor-container .ln-media-text__item {
      gap: 10px;
      padding: 7px;
    }

    .rich-media-text-popover {
      width: min(360px, calc(100vw - 20px));
      max-height: calc(100vh - 16px);
      overflow: auto;
      padding: 6px;
    }

    .rich-media-text-toolbar {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: center;
      gap: 6px;

      &__heading {
        display: none;
      }

      &__field {
        display: block;
        flex-basis: auto;
        min-width: 0;

        > span {
          display: none;
        }

        .select-trigger {
          height: 36px;
          padding-right: 26px;
          padding-left: 9px;
        }

        .select-text {
          font-size: 13px;
        }
      }

      &__actions {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        margin-left: 0;

        .b_btn {
          width: 100%;
          min-width: 0;
          min-height: 40px;
          height: 40px;
          gap: 4px;
          padding: 0 6px;
          overflow: hidden;
          font-size: 12px;

          &:last-child {
            grid-column: auto;
          }
        }
      }
    }

    .rich-mermaid-editor__actions {
      display: grid;
      grid-template-columns: 1fr 1fr;

      .b_btn {
        width: 100%;
        min-height: 46px;
      }
    }

    .rich-color-dialog__palette {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .rich-color-dialog__actions {
      display: grid;
      grid-template-columns: 1fr 1fr;

      .b_btn:first-child {
        grid-column: 1 / -1;
      }

      .b_btn {
        width: 100%;
        min-height: 46px;
      }
    }

    .rich-text-gradient-dialog__fields {
      grid-template-columns: 1fr;
      gap: 7px;
    }

    .rich-text-gradient-dialog__palette {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .rich-text-gradient-dialog__fields > label:not(:first-child) {
      margin-top: 3px;
    }

    .rich-text-gradient-dialog__actions {
      display: grid;
      grid-template-columns: 1fr 1fr;

      .b_btn:first-child {
        grid-column: 1 / -1;
      }

      .b_btn {
        width: 100%;
        min-height: 46px;
      }
    }

    .note-conversion-preview__summary {
      grid-template-columns: 1fr;
    }

    .note-conversion-preview__actions {
      display: grid;
      grid-template-columns: 1fr 1fr;

      .b_btn {
        width: 100%;
        min-height: 46px;
      }
    }

    .note-editor-body,
    .md-preview {
      max-width: 100%;
      overflow-wrap: anywhere;
      box-sizing: border-box;
    }

    .note-editor-body img,
    .md-preview img {
      max-width: 100% !important;
      height: auto !important;
      object-fit: contain;
    }

    .note-editor-body h1,
    .md-preview h1 {
      font-size: clamp(26px, 8vw, 38px);
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
  }

  /* 移动端 MD 视图由选项数据移除分栏，只保留编辑和预览。 */
</style>
