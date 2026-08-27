<template>
  <div
    ref="fieldListRef"
    class="field-list"
    @touchstart.passive="pullRefresh.onTouchStart"
    @touchmove="pullRefresh.onTouchMove"
    @touchend.passive="pullRefresh.onTouchEnd"
    @touchcancel.passive="pullRefresh.onTouchCancel"
  >
    <section v-if="batchMode && bookmark.isMobile" class="mobile-batch-toolbar">
      <div class="mobile-batch-summary">
        <BCheckbox
          :indeterminate="indeterminate"
          :checked="selectAll"
          @change="(checked: boolean) => onToggleSelectAll({ target: { checked } })"
          class="batch-select-all"
        />
        <span class="selected-count">{{ $t('cloudSpace.selectedCount', { count: selectedRows.length }) }}</span>
        <BButton size="small" class="mobile-batch-exit" @click="emit('exitBatch')">
          {{ $t('cloudSpace.exitBatch') }}
        </BButton>
      </div>
      <div class="mobile-batch-actions">
        <BButton class="ai-file-analysis-action" :disabled="!hasAiAnalyzableSelection" @click="openSelectedFilesInAi">
          <SvgIcon :src="icon.ai.organize" size="16" aria-hidden="true" />
          {{ $t('cloudSpace.aiUseSelected') }}
        </BButton>
        <BButton type="danger" :disabled="!hasSelection" @click="handleBatchDelete">
          <SvgIcon :src="icon.table_delete" size="16" aria-hidden="true" />
          {{ $t('cloudSpace.batchDelete') }}
        </BButton>
        <BButton
          class="mobile-batch-move"
          :disabled="!hasSelection"
          @click="handleBatchMove"
          v-click-log="{ module: '云空间', operation: '点击批量移动文件' }"
        >
          <SvgIcon :src="icon.cloudSpace.moveFile" size="16" aria-hidden="true" />
          {{ $t('cloudSpace.batchMove') }}
        </BButton>
        <BButton :disabled="!hasSelection" :loading="batchDownloadLoading" @click="handleBatchDownload">
          <SvgIcon :src="icon.cloudSpace.download" size="16" aria-hidden="true" />
          {{ $t('cloudSpace.batchDownload') }}
        </BButton>
      </div>
    </section>
    <div v-if="viewMode === 'card' && batchMode && !bookmark.isMobile" class="card-toolbar">
      <div class="batch-actions">
        <BSpace class="file-batch-actions-space" :size="10">
          <BCheckbox
            v-if="viewMode === 'card'"
            :indeterminate="indeterminate"
            :checked="selectAll"
            @change="(checked: boolean) => onToggleSelectAll({ target: { checked } })"
            class="batch-select-all"
          />
          <span class="selected-count">{{ $t('cloudSpace.selectedCount', { count: selectedRows.length }) }}</span>
          <BButton
            size="small"
            class="ai-file-analysis-action"
            :disabled="!hasAiAnalyzableSelection"
            @click="openSelectedFilesInAi"
          >
            <SvgIcon :src="icon.ai.organize" size="14" aria-hidden="true" />
            {{ $t('cloudSpace.aiUseSelected') }}
          </BButton>
          <BButton size="small" type="danger" @click="handleBatchDelete">{{ $t('cloudSpace.batchDelete') }}</BButton>
          <BButton
            size="small"
            type="primary"
            @click="handleBatchMove"
            v-click-log="{ module: '云空间', operation: '点击批量移动文件' }"
          >
            {{ $t('cloudSpace.batchMove') }}
          </BButton>
          <BButton size="small" type="success" :loading="batchDownloadLoading" @click="handleBatchDownload">
            {{ $t('cloudSpace.batchDownload') }}
          </BButton>
        </BSpace>
      </div>
    </div>
    <div
      v-if="viewMode === 'card' && (cloud.loading || cloud.fileList.length)"
      class="file-card-grid"
      data-mobile-resource-scroll
      @scroll.passive="onFileListScroll"
    >
      <article
        v-for="item in cloud.fileList"
        :key="item.id"
        class="file-card"
        :class="{
          'file-card--draggable': canDragFile(item),
          'file-card--batch': batchMode,
          'file-card--selected': batchMode && selectedRows.includes(item.id),
        }"
        :draggable="canDragFile(item)"
        @click="onCardClick(item)"
        @dragstart="onFileDragStart($event, item)"
        @dragend="onFileDragEnd"
      >
        <div class="file-card-cover">
          <span v-if="batchMode" class="card-checkbox" @click.stop>
            <BCheckbox
              :checked="selectedRows.includes(item.id)"
              @update:checked="(val: boolean) => toggleRow(item.id, val)"
            />
          </span>
          <img
            v-if="isPreviewableImage(item)"
            :src="item.fileUrl"
            class="file-card-thumb"
            :alt="item.fileName"
            loading="lazy"
            decoding="async"
          />
          <div v-else-if="isPreviewableVideo(item)" class="file-card-video-preview">
            <video
              class="file-card-thumb file-card-video-thumb"
              :src="item.fileUrl"
              preload="metadata"
              muted
              playsinline
              @loadedmetadata="captureVideoDuration(item.id, $event)"
              @error="markVideoPreviewFailed(item.id)"
            />
            <span class="file-card-video-play" aria-hidden="true">
              <SvgIcon :src="icon.ai.play" size="22" />
            </span>
            <span v-if="videoDurationLabels[String(item.id)]" class="file-card-video-duration">
              {{ videoDurationLabels[String(item.id)] }}
            </span>
          </div>
          <div v-else-if="isTextFile(item)" class="file-card-text-preview">
            <CloudTextCardPreview :file-info="item" />
          </div>
          <div v-else class="file-card-placeholder" :class="`file-card-placeholder--${getFileCategory(item)}`">
            <div class="file-card-placeholder-inner">
              <svg-icon :src="icon.cloudSpace.fileIcon[getFileCategory(item)]" size="34" />
              <span>{{ getFilePreviewLabel(item) }}</span>
            </div>
          </div>
          <div v-if="!batchMode && !bookmark.isMobile" class="file-card-overlay">
            <BTooltip :title="$t('cloudSpace.download')">
              <svg-icon
                class="overlay-btn"
                :src="icon.cloudSpace.download"
                size="18"
                @click.stop="handleDownloadFile(item)"
              />
            </BTooltip>
          </div>
          <div v-if="!batchMode" class="file-card-more" @click.stop>
            <b-dropdown
              v-if="!bookmark.isMobile"
              class="card-more-menu"
              :trigger="'click'"
              :menu-options="[
                {
                  label: $t('common.reName'),
                  icon: icon.cloudSpace.rename,
                  function: () => openRenameModal(item),
                },
                {
                  label: $t('cloudSpace.share'),
                  icon: icon.cloudSpace.share,
                  function: () => handleShareFile(item.id, item.fileName, item.fileType),
                },
                {
                  label: $t('cloudSpace.moveFile'),
                  icon: icon.cloudSpace.moveFile,
                  function: () => emit('moveField', [item]),
                },
                {
                  label: $t('cloudSpace.relateTags'),
                  icon: icon.manage_categoryBtn_tag,
                  function: () => openTagDialog(item),
                },
                ...(isAiDocumentFileNameSupported(item.fileName)
                  ? [
                      {
                        label: $t('cloudSpace.aiUseFile'),
                        icon: icon.ai.organize,
                        function: () => openFilesInAi([item]),
                      },
                    ]
                  : []),
                {
                  label: item.isPending ? $t('inbox.removeExisting') : $t('inbox.addExisting'),
                  icon: icon.contextMenu.inbox,
                  function: () => toggleFileInbox(item),
                },
                {
                  label: $t('common.delete'),
                  icon: icon.noteDetail.delete,
                  danger: true,
                  function: () => handleDelFile(item),
                },
              ]"
            >
              <BTooltip :title="$t('common.more')">
                <svg-icon class="more-icon" :src="icon.common.more" size="20" />
              </BTooltip>
            </b-dropdown>
            <BButton
              v-else
              class="mobile-file-more"
              :aria-label="$t('common.more')"
              @click="openMobileFileActions(item)"
            >
              <SvgIcon :src="icon.common.more" size="20" aria-hidden="true" />
            </BButton>
          </div>
        </div>
        <div class="file-card-body">
          <div class="file-card-headline">
            <span class="file-card-type" :class="`file-card-type--${getFileCategory(item)}`">{{
              getFileTypeLabel(item)
            }}</span>
            <InboxPendingBadge v-if="item.isPending" />
            <span class="file-card-size">{{ formatFileSize(item.fileSize) }}</span>
          </div>
          <div class="file-card-name" :title="item.fileName">{{ item.fileName }}</div>
          <div class="file-card-meta">
            <span class="meta-label">{{ $t('cloudSpace.uploadTime') }}</span>
            <span class="text-hidden">{{ item.uploadTime || '-' }}</span>
          </div>
          <div class="file-card-meta">
            <span class="meta-label">{{ $t('cloudSpace.relateTags') }}</span>
            <span class="text-hidden">{{
              item.tags?.length ? item.tags.map((tag) => tag.name).join(' / ') : '-'
            }}</span>
          </div>
        </div>
      </article>
    </div>
    <div v-if="downloadProgress.visible" class="download-progress-floating">
      <div class="download-progress-header">
        <div class="download-progress-title">{{ downloadProgress.phaseText }}</div>
        <div class="download-progress-ops">
          <span>{{ downloadProgress.current }}/{{ downloadProgress.total }}</span>
          <BButton size="small" class="download-cancel-btn" @click="cancelBatchDownload">
            {{ $t('common.cancel') }}
          </BButton>
        </div>
      </div>
      <div
        class="download-progress-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="downloadProgress.percent"
      >
        <span :style="{ width: `${downloadProgress.percent}%` }"></span>
      </div>
    </div>
    <div v-if="viewMode === 'table' && !bookmark.isMobile" class="field-header">
      <div class="flex-align-center-gap" :style="{ width: fieldNameWidth }">
        <BTooltip :title="fileSortLabel('fileName')">
          <BButton
            class="field-sort-trigger"
            :class="{ 'is-active': cloud.fileSort.field === 'fileName' }"
            :aria-label="fileSortLabel('fileName')"
            @click="changeFileSort('fileName')"
          >
            <span class="field-header-label">{{ $t('cloudSpace.fileName') }}</span>
            <span class="field-sort-icons" aria-hidden="true">
              <SvgIcon
                :class="{ active: cloud.fileSort.field === 'fileName' && cloud.fileSort.order === 'asc' }"
                :src="icon.table_sort_up"
                size="9"
              />
              <SvgIcon
                :class="{ active: cloud.fileSort.field === 'fileName' && cloud.fileSort.order === 'desc' }"
                :src="icon.table_sort_down"
                size="9"
              />
            </span>
          </BButton>
        </BTooltip>
      </div>
      <div class="default-area" v-if="!bookmark.isMobile">
        <div>{{ $t('cloudSpace.folder') }}</div>
        <div>{{ $t('cloudSpace.relateTags') }}</div>
        <div>
          <BTooltip :title="fileSortLabel('fileSize')">
            <BButton
              class="field-sort-trigger"
              :class="{ 'is-active': cloud.fileSort.field === 'fileSize' }"
              :aria-label="fileSortLabel('fileSize')"
              @click="changeFileSort('fileSize')"
            >
              <span>{{ $t('cloudSpace.fileSize') }}</span>
              <span class="field-sort-icons" aria-hidden="true">
                <SvgIcon
                  :class="{ active: cloud.fileSort.field === 'fileSize' && cloud.fileSort.order === 'asc' }"
                  :src="icon.table_sort_up"
                  size="9"
                />
                <SvgIcon
                  :class="{ active: cloud.fileSort.field === 'fileSize' && cloud.fileSort.order === 'desc' }"
                  :src="icon.table_sort_down"
                  size="9"
                />
              </span>
            </BButton>
          </BTooltip>
        </div>
        <div> {{ $t('cloudSpace.uploadTime') }} </div>
      </div>
    </div>
    <div v-if="viewMode === 'table' && batchMode && !bookmark.isMobile" class="batch-actions table-batch-actions">
      <BCheckbox
        :indeterminate="indeterminate"
        :checked="selectAll"
        @change="(checked: boolean) => onToggleSelectAll({ target: { checked } })"
      />
      <span class="selected-count">{{ $t('cloudSpace.selectedCount', { count: selectedRows.length }) }}</span>
      <BButton
        size="small"
        class="ai-file-analysis-action"
        :disabled="!hasAiAnalyzableSelection"
        @click="openSelectedFilesInAi"
      >
        <SvgIcon :src="icon.ai.organize" size="14" aria-hidden="true" />
        {{ $t('cloudSpace.aiUseSelected') }}
      </BButton>
      <BButton size="small" type="danger" @click="handleBatchDelete">{{ $t('cloudSpace.batchDelete') }}</BButton>
      <BButton
        size="small"
        type="primary"
        @click="handleBatchMove"
        v-click-log="{ module: '云空间', operation: '点击批量移动文件' }"
      >
        {{ $t('cloudSpace.batchMove') }}
      </BButton>
      <BButton size="small" type="success" :loading="batchDownloadLoading" @click="handleBatchDownload">
        {{ $t('cloudSpace.batchDownload') }}
      </BButton>
    </div>
    <div
      v-if="viewMode === 'table' && (cloud.loading || cloud.fileList.length)"
      class="file-container"
      data-mobile-resource-scroll
      @scroll.passive="onFileListScroll"
    >
      <div
        class="field-item"
        :class="{
          'field-item-draggable': canDragFile(item),
          'field-item--batch': batchMode,
          'field-item--selected': batchMode && selectedRows.includes(item.id),
        }"
        :draggable="canDragFile(item)"
        @click="onListRowClick(item)"
        @dragstart="onFileDragStart($event, item)"
        @dragend="onFileDragEnd"
        v-for="item in cloud.fileList"
        :key="item.id"
      >
        <div class="flex-align-center" :style="{ position: 'relative', width: fieldNameWidth }">
          <span v-if="batchMode" class="row-checkbox" @click.stop>
            <BCheckbox
              :checked="selectedRows.includes(item.id)"
              @update:checked="(val: boolean) => toggleRow(item.id, val)"
            />
          </span>
          <div v-if="!item.isRename" class="file-label flex-align-center" @click.stop="onFileLabelClick(item)">
            <svg-icon :src="icon.cloudSpace.fileIcon[getFileCategory(item)]" size="20" style="min-width: 20px" />
            <span class="file-name text-hidden">{{ item.fileName }}</span>
            <InboxPendingBadge v-if="item.isPending" />
          </div>
          <b-input
            v-else
            class="edit-file-input"
            :class="{ 'edit-file-input--saving': isFileRenaming(item) }"
            v-model:value="item.fileName"
            :disabled="isFileRenaming(item)"
            @click.stop
            @enter="submitReName(item)"
          >
            <template #suffix>
              <div class="flex-align-center-gap">
                <BButton
                  v-if="isFileRenaming(item)"
                  class="rename-saving-indicator"
                  type="primary"
                  size="small"
                  :loading="true"
                  :aria-label="$t('cloudSpace.renameSaving')"
                  :title="$t('cloudSpace.renameSaving')"
                />
                <span v-if="isFileRenaming(item)" class="rename-saving-text" role="status">
                  {{ $t('cloudSpace.renameSaving') }}
                </span>
                <svg-icon
                  v-else
                  :src="icon.filterPanel.check"
                  size="18"
                  class="dom-hover"
                  @click="submitReName(item)"
                />
                <svg-icon
                  v-if="!isFileRenaming(item)"
                  :src="icon.common.close"
                  size="18"
                  class="dom-hover"
                  @click="cancelRename(item)"
                />
              </div>
            </template>
          </b-input>
          <div v-if="!item.isRename && !batchMode" class="flex-align-center handle-btn" @click.stop>
            <BTooltip v-if="!bookmark.isMobile" :title="$t('cloudSpace.download')">
              <svg-icon
                class="download-icon"
                :src="icon.cloudSpace.download"
                size="20"
                @click="handleDownloadFile(item)"
              />
            </BTooltip>
            <BTooltip :title="$t('common.reName')" v-if="!bookmark.isMobile">
              <svg-icon
                class="download-icon"
                :src="icon.cloudSpace.rename"
                size="20"
                @click="handleReName(item)"
                v-click-log="{ module: '云空间', operation: `编辑文件名【${item.fileName}】` }"
              />
            </BTooltip>
            <BTooltip v-if="!bookmark.isMobile" :title="$t('cloudSpace.relateTags')">
              <svg-icon
                class="download-icon"
                :src="icon.manage_categoryBtn_tag"
                size="20"
                @click="openTagDialog(item)"
                v-click-log="{ module: '云空间', operation: `打开文件标签配置【${item.fileName}】` }"
              />
            </BTooltip>
            <b-dropdown
              v-if="!bookmark.isMobile"
              :trigger="'click'"
              align="right"
              :menu-options="[
                ...(bookmark.isMobile
                  ? [
                      {
                        label: $t('common.reName'),
                        icon: icon.cloudSpace.rename,
                        function: () => openRenameModal(item),
                      },
                      {
                        label: $t('cloudSpace.download'),
                        icon: icon.cloudSpace.download,
                        function: () => handleDownloadFile(item),
                      },
                      {
                        label: $t('cloudSpace.relateTags'),
                        icon: icon.manage_categoryBtn_tag,
                        function: () => openTagDialog(item),
                      },
                    ]
                  : []),
                ...(isAiDocumentFileNameSupported(item.fileName)
                  ? [
                      {
                        label: $t('cloudSpace.aiUseFile'),
                        icon: icon.ai.organize,
                        function: () => openFilesInAi([item]),
                      },
                    ]
                  : []),
                {
                  label: $t('cloudSpace.share'),
                  icon: icon.cloudSpace.share,
                  function: () => handleShareFile(item.id, item.fileName, item.fileType),
                },
                {
                  label: $t('cloudSpace.moveFile'),
                  icon: icon.cloudSpace.moveFile,
                  function: () => emit('moveField', [item]),
                },
                {
                  label: item.isPending ? $t('inbox.removeExisting') : $t('inbox.addExisting'),
                  icon: icon.contextMenu.inbox,
                  function: () => toggleFileInbox(item),
                },
                {
                  label: $t('common.delete'),
                  icon: icon.noteDetail.delete,
                  danger: true,
                  function: () => handleDelFile(item),
                },
              ]"
            >
              <svg-icon class="download-icon" :src="icon.common.more" size="20" />
            </b-dropdown>
            <BButton
              v-else
              class="mobile-file-more"
              :aria-label="$t('common.more')"
              @click="openMobileFileActions(item)"
            >
              <SvgIcon :src="icon.common.more" size="20" aria-hidden="true" />
            </BButton>
          </div>
        </div>
        <div class="default-area" v-if="!bookmark.isMobile">
          <div>{{ item.folderName }}</div>
          <div class="file-tags-cell">
            <span v-if="!item.tags?.length" class="file-tags-empty">-</span>
            <div v-else class="file-tags-list">
              <ResourceTagChip
                v-for="tag in item.tags"
                :key="tag.id"
                :tag="tag"
                size="medium"
                interactive
                max-width="90px"
                @click.stop="goToTagDetail(tag.id)"
                v-click-log="{ module: '云空间', operation: `点击文件关联标签【${tag.name}】` }"
              />
            </div>
          </div>
          <div>{{
            item.fileSize >= 1024 * 1024
              ? Number(item.fileSize / (1024 * 1024))
                  .toFixed(1)
                  .replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' MB'
              : Number(item.fileSize / 1024)
                  .toFixed()
                  .replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' KB'
          }}</div>
          <div v-if="!bookmark.isMobile" class="text-hidden" :title="item.uploadTime">{{ item.uploadTime }} </div>
        </div>
      </div>
    </div>
    <div v-if="!cloud.loading && !cloud.fileList.length" class="file-empty-state">
      <span class="file-empty-icon">
        <SvgIcon :src="icon.file_upload" size="28" />
      </span>
      <strong>{{ $t('cloudSpace.emptyTitle') }}</strong>
      <p>{{ $t('cloudSpace.emptyHint') }}</p>
      <BButton v-if="!bookmark.isMobile" type="primary" class="file-empty-action" @click="triggerUpload">
        {{ $t('cloudSpace.uploadFile') }}
      </BButton>
    </div>
    <div v-if="cloud.loadingMore" class="file-load-more">
      <BLoading inline loading :title="$t('common.loading')" />
    </div>
    <b-loading :loading="cloud.loading" class="both-center" />

    <BModal
      v-model:visible="batchDownloadChoiceVisible"
      :title="$t('cloudSpace.batchDownloadChooseTitle')"
      width="520px"
      :show-footer="false"
    >
      <div class="batch-download-choice">
        <p class="batch-download-choice__hint">{{ $t('cloudSpace.batchDownloadChooseHint') }}</p>
        <div class="batch-download-choice__options">
          <BButton class="batch-download-choice__option" @click="startBatchDownload('individual')">
            <span class="batch-download-choice__icon">
              <SvgIcon :src="icon.cloudSpace.download" size="24" aria-hidden="true" />
            </span>
            <span class="batch-download-choice__copy">
              <strong>{{ $t('cloudSpace.batchDownloadIndividual') }}</strong>
              <small>{{ $t('cloudSpace.batchDownloadIndividualDesc') }}</small>
            </span>
          </BButton>
          <BButton
            class="batch-download-choice__option"
            :disabled="batchDownloadZipUnavailable"
            @click="startBatchDownload('zip')"
          >
            <span class="batch-download-choice__icon">
              <SvgIcon :src="icon.contextMenu.archive" size="24" aria-hidden="true" />
            </span>
            <span class="batch-download-choice__copy">
              <strong>{{ $t('cloudSpace.batchDownloadZip') }}</strong>
              <small>{{
                batchDownloadZipUnavailable
                  ? $t('cloudSpace.batchDownloadZipUnavailableInApp')
                  : $t('cloudSpace.batchDownloadZipDesc')
              }}</small>
            </span>
          </BButton>
        </div>
      </div>
    </BModal>

    <b-modal v-model:visible="shareDescVisible" :title="$t('cloudSpace.share')" width="450px" :show-footer="false">
      <div class="share-desc-body">
        <div class="share-desc-tip">{{ $t('cloudSpace.shareDescTip') }}</div>
        <label class="share-field-label">{{ $t('cloudSpace.shareExpiry') }}</label>
        <BSelect v-model:value="shareExpiresInDays" :options="shareExpiryOptions" />
        <label class="share-field-label">{{ $t('cloudSpace.shareAccessCode') }}</label>
        <b-input
          v-model:value="shareAccessCode"
          :maxlength="12"
          :placeholder="$t('cloudSpace.shareCodePlaceholder')"
          autocomplete="off"
        />
        <div class="share-limit-grid">
          <div>
            <label class="share-field-label">{{ $t('cloudSpace.shareAccessLimit') }}</label>
            <b-input
              v-model:value="shareMaxAccessCount"
              type="number"
              :placeholder="$t('cloudSpace.shareLimitPlaceholder')"
            />
          </div>
          <div>
            <label class="share-field-label">{{ $t('cloudSpace.shareDownloadLimit') }}</label>
            <b-input
              v-model:value="shareMaxDownloadCount"
              type="number"
              :placeholder="$t('cloudSpace.shareLimitPlaceholder')"
            />
          </div>
        </div>
        <b-input
          type="textarea"
          v-model:value="shareDescValue"
          :maxlength="200"
          :placeholder="$t('cloudSpace.shareDescPlaceholder')"
        />
        <div class="share-desc-actions">
          <b-button :loading="shareSubmitting" type="primary" @click="submitShare">{{
            $t('cloudSpace.share')
          }}</b-button>
          <b-button :disabled="shareSubmitting" @click="closeShareDialog">{{ $t('common.cancel') }}</b-button>
        </div>
        <section class="share-records" :aria-label="$t('cloudSpace.shareCurrentLinks')">
          <h4>{{ $t('cloudSpace.shareCurrentLinks') }}</h4>
          <BLoading v-if="shareRecordsLoading" inline loading :title="$t('common.loading')" />
          <p v-else-if="shareRecords.length === 0" class="share-records-empty">
            {{ $t('cloudSpace.shareNoCurrentLinks') }}
          </p>
          <article v-for="record in shareRecords" v-else :key="record.id" class="share-record">
            <div class="share-record-head">
              <strong>{{ formatShareState(record.state) }}</strong>
              <span>{{ formatShareDate(record.expiresAt) }}</span>
            </div>
            <div class="share-record-meta">
              <span>{{
                $t('cloudSpace.shareVisits', {
                  current: record.accessCount,
                  limit: record.maxAccessCount ?? $t('cloudSpace.shareUnlimited'),
                })
              }}</span>
              <span>{{
                $t('cloudSpace.shareDownloads', {
                  current: record.downloadCount,
                  limit: record.maxDownloadCount ?? $t('cloudSpace.shareUnlimited'),
                })
              }}</span>
            </div>
            <div class="share-record-actions">
              <BButton
                size="small"
                :disabled="record.state !== 'active' || shareSubmitting"
                @click="confirmRotateShare(record.id)"
              >
                {{ $t('cloudSpace.shareRotate') }}
              </BButton>
              <BButton
                size="small"
                type="danger"
                :disabled="record.state !== 'active' || shareSubmitting"
                @click="confirmRevokeShare(record.id)"
              >
                {{ $t('cloudSpace.shareRevoke') }}
              </BButton>
            </div>
          </article>
        </section>
      </div>
    </b-modal>

    <MobilePageActionsDrawer
      v-if="bookmark.isMobile"
      v-model:open="mobileFileActionsOpen"
      :object-title="mobileActionFile?.fileName || $t('common.more')"
      :actions="mobileFileActions"
      @action="handleMobileFileAction"
    />

    <AiSkillDialog
      v-model:visible="fileAiVisible"
      :title="$t('cloudSpace.aiSkillTitle')"
      :description="$t('cloudSpace.aiSkillDescription')"
      :skill-id="fileAiSkillId"
      :prompt-key="fileAiPromptKey"
      surface="cloud_space"
      :resource-refs="fileAiResourceRefs"
      :scope-label="fileAiScopeLabel"
      :actions="fileAiActions"
      :show-prompt="false"
      @result-action="handleFileAiResultAction"
    />

    <FileTagConfig
      v-if="tagModalVisible"
      v-model:visible="tagModalVisible"
      :file="activeTagFile"
      @saved="cloud.queryFieldList"
    />

    <b-modal
      v-model:visible="renameModalVisible"
      :title="$t('common.reName')"
      width="400px"
      :show-footer="false"
      :mask-closable="true"
      @close="renameModalFile = null"
    >
      <div class="rename-modal-field">
        <b-input
          v-model:value="renameModalValue"
          class="rename-modal-input"
          :disabled="renameModalSubmitting"
          @enter="confirmRename"
          @click.stop
        />
        <span v-if="renameModalFile" class="rename-modal-ext">.{{ originalExt }}</span>
      </div>
      <div class="rename-modal-actions">
        <b-button type="primary" :loading="renameModalSubmitting" @click="confirmRename">
          {{ renameModalSubmitting ? $t('cloudSpace.renameSaving') : $t('common.confirm') }}
        </b-button>
        <b-button :disabled="renameModalSubmitting" @click="renameModalVisible = false">{{
          $t('common.cancel')
        }}</b-button>
      </div>
    </b-modal>
  </div>
</template>
<script setup lang="ts">
  import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useAndroidPullRefresh } from '@/composables/useAndroidPullRefresh';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import icon from '@/config/icon.ts';
  import {
    deleteField,
    downloadField,
    listFileShares,
    requestAndroidDownloadWithReceipt,
    revokeFileShare,
    rotateFileShare,
    shareField,
    type FileShareInput,
    type FileShareRecord,
  } from '@/http/common.ts';
  import { hasAndroidBridge } from '@/utils/androidBridge.ts';
  import { submitAndroidBatchDownload } from '@/utils/androidBatchDownload.ts';
  import { submitBrowserBatchDownloads, triggerPreparedBrowserDownload } from '@/utils/browserBatchDownload.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { cloneDeep } from 'lodash-es';
  import { useI18n } from 'vue-i18n';
  import JSZip from 'jszip';
  import { CLOUD_FILE_CATEGORY_LABEL_KEY, getCloudFileCategory } from '@/constants/cloudFileCategory.ts';
  import { useRouter } from 'vue-router';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import { isAiDocumentFileNameSupported } from '@lightnote/shared';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import { persistAiNotePreview } from '@/utils/aiNoteDraft';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { isNearResourceScrollEnd } from '@/utils/resourcePagination';
  import { resolveFileAiSummaryPresentation } from '@/utils/fileAiSummary';
  import CloudTextCardPreview from '@/components/cloudSpace/CloudTextCardPreview.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';

  const FileTagConfig = defineAsyncComponent(() => import('@/components/cloudSpace/FileTagConfig.vue'));

  const { t } = useI18n();
  const emit = defineEmits(['previewFile', 'moveField', 'exitBatch', 'requestUpload', 'filesDeleted']);

  // 首屏空状态引导复用页面统一上传选择器，确保容量校验、重名处理和上传进度一致。
  function triggerUpload() {
    emit('requestUpload');
  }
  const cloud = cloudSpaceStore();
  const bookmark = bookmarkStore();
  const router = useRouter();

  function fileSortLabel(field: 'fileName' | 'fileSize') {
    const fieldLabel = t(field === 'fileName' ? 'cloudSpace.fileName' : 'cloudSpace.fileSize');
    const nextOrder =
      cloud.fileSort.field === field
        ? cloud.fileSort.order === 'asc'
          ? 'desc'
          : 'asc'
        : field === 'fileName'
          ? 'asc'
          : 'desc';
    return t('cloudSpace.sortBy', {
      field: fieldLabel,
      order: t(nextOrder === 'asc' ? 'cloudSpace.sortAscending' : 'cloudSpace.sortDescending'),
    });
  }

  async function changeFileSort(field: 'fileName' | 'fileSize') {
    await cloud.setFileSort(field);
    await nextTick();
    const scrollElement = fieldListRef.value?.querySelector<HTMLElement>('[data-mobile-resource-scroll]');
    if (scrollElement) scrollElement.scrollTop = 0;
  }
  const { addResourcesToInbox, removeResourcesFromInbox } = useInboxEnqueue();
  const props = defineProps<{ clearKey?: number; batchMode: boolean; viewMode?: 'card' | 'table' }>();
  const viewMode = computed(() => props.viewMode ?? 'table');

  const batchMode = computed(() => props.batchMode ?? false);
  const fieldListRef = ref<HTMLElement | null>(null);
  const mobileFileActionsOpen = ref(false);
  const mobileActionFile = ref<any | null>(null);
  const mobileFileActions = computed<MobilePageActionItem[]>(() => {
    const file = mobileActionFile.value;
    if (!file) return [];
    return [
      { key: 'rename', label: t('common.reName'), icon: icon.cloudSpace.rename },
      { key: 'download', label: t('cloudSpace.download'), icon: icon.cloudSpace.download },
      { key: 'tags', label: t('cloudSpace.relateTags'), icon: icon.manage_categoryBtn_tag },
      ...(isAiDocumentFileNameSupported(file.fileName)
        ? [{ key: 'ai', label: t('cloudSpace.aiUseFile'), icon: icon.ai.organize }]
        : []),
      { key: 'share', label: t('cloudSpace.share'), icon: icon.cloudSpace.share },
      { key: 'move', label: t('cloudSpace.moveFile'), icon: icon.cloudSpace.moveFile },
      {
        key: 'inbox',
        label: file.isPending ? t('inbox.removeExisting') : t('inbox.addExisting'),
        icon: icon.contextMenu.inbox,
      },
      { key: 'delete', label: t('common.delete'), icon: icon.noteDetail.delete, danger: true, dividerBefore: true },
    ];
  });

  function openMobileFileActions(file: any) {
    mobileActionFile.value = file;
    mobileFileActionsOpen.value = true;
  }

  function handleMobileFileAction(action: MobilePageActionItem) {
    const file = mobileActionFile.value;
    if (!file) return;
    if (action.key === 'rename') openRenameModal(file);
    else if (action.key === 'download') void handleDownloadFile(file);
    else if (action.key === 'tags') void openTagDialog(file);
    else if (action.key === 'ai') openFilesInAi([file]);
    else if (action.key === 'share') void handleShareFile(file.id, file.fileName, file.fileType);
    else if (action.key === 'move') emit('moveField', [file]);
    else if (action.key === 'inbox') void toggleFileInbox(file);
    else if (action.key === 'delete') handleDelFile(file);
  }

  /*
   * 下拉刷新。三类数据里只需并发两个请求:queryFieldList 的 finally 本身就会
   * 顺带刷新空间用量,再单独调一次 getUsedSpace 会重复请求同一个接口。
   *
   * 卡片视图(.file-card-grid)和列表视图(.file-container)是二选一渲染的两个滚动容器,
   * 容器按 data-mobile-resource-scroll 动态取,自动跟随当前视图 —— 一个刷新实例覆盖两个视图。
   *
   * 用 allSettled 而不是 all:文件列表成功、文件夹失败时应当保留已刷新的列表,
   * 只提示部分失败,而不是把整次刷新判为失败(见落地方案第 12 节)。
   */
  const pullRefresh = useAndroidPullRefresh({
    enabled: computed(() => !batchMode.value),
    externalBusy: computed(
      () => cloud.loading || cloud.loadingMore || cloud.fileList?.some((item: any) => item?.isRename) === true,
    ),
    getScrollContainer: () => fieldListRef.value?.querySelector<HTMLElement>('[data-mobile-resource-scroll]') ?? null,
    onRefresh: async () => {
      const [fileResult, folderResult] = await Promise.allSettled([
        cloud.queryFieldList({ silent: true }),
        cloud.queryFolder(),
      ]);
      const fileOk = fileResult.status === 'fulfilled' && fileResult.value !== false;
      const folderOk = folderResult.status === 'fulfilled' && folderResult.value !== false;
      if (!fileOk && !folderOk) throw new Error('CLOUD_REFRESH_FAILED');
      // 只有一部分失败:已刷新的数据保留,给出区别于整体失败的提示
      if (!fileOk || !folderOk) message.warning(t('cloudSpace.refreshPartialFailed'));
    },
  });
  /*
   * 从后台切回来时补一次数据。与下拉刷新的区别:这里一律不提示 ——
   * 用户没主动要求刷新,失败就保留旧列表当作没发生过。
   */
  useForegroundRefresh({
    refresh: () => Promise.allSettled([cloud.queryFieldList({ silent: true }), cloud.queryFolder()]),
    canRefresh: () =>
      !batchMode.value &&
      !cloud.loading &&
      !cloud.loadingMore &&
      // 有文件正在重命名时刷新会把输入框里的内容冲掉
      cloud.fileList?.some((item: any) => item?.isRename) !== true,
  });

  function onFileListScroll(event: Event) {
    const target = event.currentTarget;
    if (target instanceof HTMLElement && isNearResourceScrollEnd(target)) {
      void cloud.loadMoreFiles();
    }
  }

  async function toggleFileInbox(file: any) {
    const resource = [{ resourceType: 'file' as const, resourceId: String(file.id) }];
    const ok = file.isPending
      ? await removeResourcesFromInbox(resource, '云空间')
      : await addResourcesToInbox(resource, '云空间');
    // 接口已确认状态变更,直接本地更新徽标和菜单,不必重新拉取整页文件
    if (ok) file.isPending = !file.isPending;
  }
  const selectedRows = ref<string[]>([]);
  const selectAll = ref(false);
  const videoDurationLabels = ref<Record<string, string>>({});
  const failedVideoPreviewIds = ref<Set<string>>(new Set());
  const hasSelection = computed(() => selectedRows.value.length > 0);
  const hasAiAnalyzableSelection = computed(() =>
    cloud.fileList.some((file) => selectedRows.value.includes(file.id) && isAiDocumentFileNameSupported(file.fileName)),
  );
  const indeterminate = computed(
    () => selectedRows.value.length > 0 && selectedRows.value.length < cloud.fileList.length,
  );
  let suppressCardClickUntil = 0;

  const onToggleSelectAll = (e: any) => {
    const checked = e.target.checked;
    selectAll.value = checked;
    selectedRows.value = checked ? cloud.fileList.map((item) => item.id) : [];
  };

  const toggleRow = (id: string, checked: boolean) => {
    if (checked) {
      if (!selectedRows.value.includes(id)) selectedRows.value.push(id);
    } else {
      selectedRows.value = selectedRows.value.filter((itemId) => itemId !== id);
    }
    selectAll.value = cloud.fileList.length > 0 && selectedRows.value.length === cloud.fileList.length;
  };

  const onCardClick = (item: any) => {
    if (Date.now() < suppressCardClickUntil) return;
    if (batchMode.value) {
      toggleRow(item.id, !selectedRows.value.includes(item.id));
    } else {
      emit('previewFile', item);
    }
  };

  const onListRowClick = (item: any) => {
    if (!bookmark.isMobile) return;
    if (batchMode.value) {
      toggleRow(item.id, !selectedRows.value.includes(item.id));
      return;
    }
    recordOperation({ module: '云空间', operation: `预览文件【${item.fileName}】` });
    emit('previewFile', item);
  };

  const onFileLabelClick = (item: any) => {
    if (bookmark.isMobile && batchMode.value) {
      toggleRow(item.id, !selectedRows.value.includes(item.id));
      return;
    }
    recordOperation({ module: '云空间', operation: `预览文件【${item.fileName}】` });
    emit('previewFile', item);
  };

  const fileAiVisible = ref(false);
  const fileAiFiles = ref<any[]>([]);
  const fileAiResourceRefs = computed<AiSkillResourceRef[]>(() =>
    fileAiFiles.value.map((file) => ({ type: 'file', id: String(file.id) })),
  );
  const fileAiSkillId = computed(() => (fileAiResourceRefs.value.length > 1 ? 'file.compare' : 'file.summarize'));
  const fileAiPromptKey = computed(() => 'instruction');
  const fileAiSingleSummaryPresentation = computed(() =>
    resolveFileAiSummaryPresentation(fileAiFiles.value.length === 1 ? fileAiFiles.value[0] : undefined),
  );
  const fileAiScopeLabel = computed(() => {
    if (fileAiFiles.value.length === 1) {
      return t('cloudSpace.aiScopeSingle', {
        name: fileAiFiles.value[0]?.fileName || t('cloudSpace.unnamedFile'),
      });
    }
    const first = fileAiFiles.value
      .slice(0, 2)
      .map((file) => file.fileName)
      .filter(Boolean)
      .join('、');
    return t(fileAiFiles.value.length > 2 ? 'cloudSpace.aiScopeMany' : 'cloudSpace.aiScopeMultiple', {
      names: first,
      count: fileAiFiles.value.length,
    });
  });
  const fileAiActions = computed(() => {
    const actions =
      fileAiResourceRefs.value.length > 1
        ? [
            {
              id: 'compare',
              label: t('cloudSpace.aiCompareFiles'),
              skillId: 'file.compare',
              input: { instruction: t('cloudSpace.aiCompareInstruction') },
            },
          ]
        : [
            {
              id: 'summarize',
              label: t(fileAiSingleSummaryPresentation.value.labelKey),
              skillId: 'file.summarize',
              input: {
                instruction: t(fileAiSingleSummaryPresentation.value.instructionKey),
              },
            },
          ];
    actions.push({
      id: 'create-note',
      label: t('cloudSpace.aiCreateNote'),
      skillId: 'file.create_note_preview',
      input: {
        instruction: t('cloudSpace.aiCreateNoteInstruction'),
        title:
          fileAiFiles.value.length === 1
            ? t('cloudSpace.aiGeneratedSingleNoteTitle', {
                name: fileAiFiles.value[0]?.fileName || t('cloudSpace.aiGeneratedNoteTitle'),
              })
            : t('cloudSpace.aiGeneratedMultiNoteTitle', {
                name: fileAiFiles.value[0]?.fileName || t('cloudSpace.aiGeneratedNoteTitle'),
              }),
      },
    });
    return actions;
  });

  const creatingAiNote = ref(false);

  async function handleFileAiResultAction(action: Record<string, unknown>, response: AiSkillResponse) {
    if (action.id !== 'create_note_from_preview' || creatingAiNote.value) return;
    creatingAiNote.value = true;
    try {
      const handoff = await persistAiNotePreview(response, t('cloudSpace.aiGeneratedNoteTitle'));
      if (!handoff) return;
      message.success(t('aiSkills.noteCreated'));
      fileAiVisible.value = false;
      await router.push(handoff.route);
    } catch (error: any) {
      message.error(String(error?.message || t('aiSkills.noteCreateFailed')));
    } finally {
      creatingAiNote.value = false;
    }
  }

  function openFilesInAi(files: any[]) {
    const identified = files.filter((file) => String(file?.id || '').trim());
    const available = identified.filter((file) => isAiDocumentFileNameSupported(file?.fileName));
    const skippedCount = identified.length - available.length;
    if (skippedCount > 0) message.info(t('cloudSpace.aiUnsupportedFilesSkipped', { count: skippedCount }));
    if (!available.length) return;
    if (available.length > 5) message.info(t('cloudSpace.aiMaterialLimit', { count: 5 }));
    fileAiFiles.value = available.slice(0, 5);
    fileAiVisible.value = true;
  }

  function openSelectedFilesInAi() {
    void openFilesInAi(cloud.fileList.filter((file) => selectedRows.value.includes(file.id)));
  }

  const goToTagDetail = (tagId: string) => {
    if (!tagId) return;
    router.push(`/tag/${tagId}`);
  };

  const fieldNameWidth = computed(() => {
    if (bookmark.isMobile) {
      return '100%';
    }
    return '42%';
  });

  const shareDescVisible = ref(false);
  const shareDescValue = ref('');
  const shareExpiresInDays = ref<1 | 7 | 30>(7);
  const shareAccessCode = ref('');
  const shareMaxAccessCount = ref('');
  const shareMaxDownloadCount = ref('');
  const shareSubmitting = ref(false);
  const shareTarget = ref<{ id: string; fileName?: string; fileType?: string } | null>(null);
  const shareRecordsLoading = ref(false);
  const shareRecords = ref<FileShareRecord[]>([]);
  const shareExpiryOptions = computed(() => [
    { value: 1, label: t('cloudSpace.shareExpiryOneDay') },
    { value: 7, label: t('cloudSpace.shareExpirySevenDays') },
    { value: 30, label: t('cloudSpace.shareExpiryThirtyDays') },
  ]);
  const batchDownloadLoading = ref(false);
  const batchDownloadChoiceVisible = ref(false);
  const batchDownloadChoiceFiles = ref<any[]>([]);
  const batchDownloadZipUnavailable = computed(() => hasAndroidBridge());
  const batchDownloadAbortController = ref<AbortController | null>(null);
  const batchDownloadCancelled = ref(false);
  const tagModalVisible = ref(false);
  const activeTagFile = ref<any>(null);
  const renameModalVisible = ref(false);
  const renameModalFile = ref<any>(null);
  const renameModalValue = ref('');
  const renamingFileIds = ref<Set<string>>(new Set());
  const renameModalSubmitting = computed(() => isFileRenaming(renameModalFile.value));
  const downloadProgress = ref({
    visible: false,
    percent: 0,
    current: 0,
    total: 0,
    phaseText: '',
  });

  const getFileCategory = (file: { category?: string }) => getCloudFileCategory(file);
  const getFileTypeLabel = (file: { category?: string }) => t(CLOUD_FILE_CATEGORY_LABEL_KEY[getFileCategory(file)]);

  function formatFileSize(bytes: number): string {
    if (!bytes || bytes < 0) return '0 KB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  }

  function isPreviewableImage(file: any): boolean {
    return getFileCategory(file) === 'image' && !!file.fileUrl;
  }

  function isPreviewableVideo(file: any): boolean {
    return getFileCategory(file) === 'video' && !!file.fileUrl && !failedVideoPreviewIds.value.has(String(file.id));
  }

  function formatMediaDuration(duration: number): string {
    if (!Number.isFinite(duration) || duration <= 0) return '';
    const totalSeconds = Math.round(duration);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function captureVideoDuration(fileId: string | number, event: Event) {
    const duration = (event.currentTarget as HTMLVideoElement | null)?.duration;
    const label = formatMediaDuration(Number(duration));
    if (!label) return;
    videoDurationLabels.value = {
      ...videoDurationLabels.value,
      [String(fileId)]: label,
    };
  }

  function markVideoPreviewFailed(fileId: string | number) {
    const next = new Set(failedVideoPreviewIds.value);
    next.add(String(fileId));
    failedVideoPreviewIds.value = next;
  }

  function isTextFile(file: any): boolean {
    return getFileCategory(file) === 'text' && !!file?.fileUrl;
  }

  function getFilePreviewLabel(file: any): string {
    const ext = getFileExt(String(file?.fileName || '')).toUpperCase();
    return ext || getFileTypeLabel(file);
  }

  watch(
    () => cloud.fileList,
    (list) => {
      // 当列表刷新时，同步全选状态，移除已不存在的选项
      const ids = list.map((item) => item.id);
      const stringIds = new Set(ids.map(String));
      selectedRows.value = selectedRows.value.filter((id) => ids.includes(id));
      selectAll.value = list.length > 0 && selectedRows.value.length === list.length;
      videoDurationLabels.value = Object.fromEntries(
        Object.entries(videoDurationLabels.value).filter(([id]) => stringIds.has(id)),
      );
      failedVideoPreviewIds.value = new Set(Array.from(failedVideoPreviewIds.value).filter((id) => stringIds.has(id)));
    },
    { deep: true },
  );

  watch(
    () => props.clearKey,
    () => {
      selectedRows.value = [];
      selectAll.value = false;
    },
  );

  watch(
    () => props.batchMode,
    (val) => {
      if (!val) {
        selectedRows.value = [];
        selectAll.value = false;
      }
    },
  );

  const getFileExt = (name: string) => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) return '';
    return name.slice(lastDot + 1);
  };

  const getFileBaseName = (name: string) => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) return name;
    return name.slice(0, lastDot);
  };

  function getFileRenameKey(file: any) {
    return String(file?.id || '');
  }

  function isFileRenaming(file: any) {
    const key = getFileRenameKey(file);
    return Boolean(key) && renamingFileIds.value.has(key);
  }

  function setFileRenaming(file: any, saving: boolean) {
    const key = getFileRenameKey(file);
    if (!key) return;
    const next = new Set(renamingFileIds.value);
    if (saving) next.add(key);
    else next.delete(key);
    renamingFileIds.value = next;
  }

  function submitReName(file) {
    if (isFileRenaming(file)) return;
    const previousName = originalName.value;
    const baseName = String(file.fileName || '').trim();
    const nextName = originalExt.value ? `${baseName}.${originalExt.value}` : baseName;
    void updateFileName(file, nextName, previousName);
  }

  async function updateFileName(file: any, nextName: string, previousName = originalName.value) {
    if (blockGuestWrite('rename-file') || isFileRenaming(file)) return false;
    if (nextName === previousName) {
      file.fileName = previousName;
      file.isRename = false;
      return false;
    }
    setFileRenaming(file, true);
    try {
      const res = await apiBasePost('/api/file/updateFile', {
        id: file.id,
        fileName: nextName,
      });
      if (res.status === 200) {
        file.isRename = false;
        file.fileName = nextName;
        if (cloud.searchFileName === previousName) {
          cloud.searchFileName = nextName;
        }
        recordOperation({ module: '云空间', operation: `重命名文件成功【${nextName}】` });
        message.success(t('cloudSpace.renameSuccess'));
        cloud.queryFieldList();
        return true;
      } else {
        // 后端返回错误（如已存在同名文件），不做任何 UI 改变，用户直接在输入框继续改
        return false;
      }
    } catch {
      message.error(t('cloudSpace.renameFailed'));
      return false;
    } finally {
      setFileRenaming(file, false);
    }
  }
  function handleDelFile(file) {
    if (blockGuestWrite('delete-file')) return;
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('cloudSpace.confirmDelete'),
      onOk() {
        deleteField(file.id).then((success) => {
          if (success) {
            recordOperation({ module: '云空间', operation: `删除文件成功【${file.fileName}】` });
            emit('filesDeleted', [String(file.id)]);
            void cloud.refreshAfterFileMutation();
          }
        });
      },
    });
  }

  async function handleDownloadFile(file: any) {
    const success = await downloadField(file.id);
    if (success) {
      recordOperation({ module: '云空间', operation: `下载文件成功【${file.fileName}】` });
    }
  }

  async function openTagDialog(file: any) {
    activeTagFile.value = file;
    tagModalVisible.value = true;
  }

  const handleBatchDelete = () => {
    if (blockGuestWrite('delete-file')) return;
    if (!hasSelection.value) {
      message.warning(t('cloudSpace.selectFilesToDelete'));
      return;
    }

    const selectedFiles = cloud.fileList.filter((item) => selectedRows.value.includes(item.id));
    const names = selectedFiles.map((f) => f.fileName).join('、');

    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: `${t('cloudSpace.confirmBatchDelete')} ${selectedRows.value.length} ${t('cloudSpace.files')}<br/>${t('cloudSpace.fileList')}: ${names}`,
      onOk() {
        const deletingIds = selectedRows.value.map(String);
        apiBasePost('/api/file/deleteFileById', { ids: deletingIds }).then((res) => {
          if (res.status === 200) {
            const count = res.data?.count || selectedRows.value.length;
            recordOperation({ module: '云空间', operation: `批量删除文件成功【${count}个】` });
            message.success(`${t('cloudSpace.batchDeleteSuccess')} ${count} ${t('cloudSpace.files')}`);
            emit('filesDeleted', deletingIds);
          } else {
            message.error(res.msg || t('cloudSpace.deleteFailed'));
          }

          void cloud.refreshAfterFileMutation();
          selectedRows.value = [];
          selectAll.value = false;
        });
      },
    });
  };

  const handleBatchMove = () => {
    if (!hasSelection.value) {
      message.warning(t('cloudSpace.selectFilesToMove'));
      return;
    }

    const selectedFiles = cloud.fileList.filter((item) => selectedRows.value.includes(item.id));
    emit('moveField', selectedFiles);
  };

  const decodeSafeName = (name?: string) => {
    if (!name) return '';
    try {
      return decodeURIComponent(name);
    } catch (error) {
      return name;
    }
  };

  const normalizeFileName = (name?: string, fallback = 'file') => {
    const raw = decodeSafeName(name).trim() || fallback;
    return raw.replace(/[\\/:*?"<>|]/g, '_');
  };

  const buildUniqueName = (name: string, usedNames: Set<string>) => {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    const dotIndex = name.lastIndexOf('.');
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex > 0 ? name.slice(dotIndex) : '';
    let counter = 2;
    let candidate = `${base}(${counter})${ext}`;
    while (usedNames.has(candidate)) {
      counter += 1;
      candidate = `${base}(${counter})${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  };

  const getDownloadMeta = async (file: any, index: number) => {
    const fallbackName = `file-${index + 1}`;
    if (file.fileUrl) {
      return {
        downloadUrl: file.fileUrl,
        fileName: normalizeFileName(file.fileName, fallbackName),
      };
    }

    const res = await apiBasePost('/api/file/downloadFileById', { id: file.id });
    if (res.status !== 200 || !res.data?.downloadUrl) {
      throw new Error(t('cloudSpace.downloadFailed'));
    }

    return {
      downloadUrl: res.data.downloadUrl,
      fileName: normalizeFileName(res.data.fileName || file.fileName, fallbackName),
    };
  };

  const isBatchDownloadCancelledError = (error: any) => {
    return (
      batchDownloadCancelled.value || error?.name === 'AbortError' || error?.message === 'BATCH_DOWNLOAD_CANCELLED'
    );
  };

  const cancelBatchDownload = () => {
    if (!batchDownloadLoading.value) return;
    batchDownloadCancelled.value = true;
    batchDownloadAbortController.value?.abort();
  };

  /*
   * App 内的批量下载：不打包，逐个交给系统 DownloadManager（原因见
   * utils/androidBatchDownload.ts 顶部——zip 的 blob 地址在原生那关落不了盘）。
   *
   * 结果是手机上拿到 N 个文件而不是一个压缩包：手机上单个文件反而更好用，不用再找解压工具；
   * 而且不在前端打包就没有体积上限，几十 MB 的选择也不会撑爆 WebView 内存。
   */
  const runAndroidBatchDownload = async (selectedFiles: any[]) => {
    batchDownloadLoading.value = true;
    batchDownloadCancelled.value = false;
    downloadProgress.value = {
      visible: true,
      percent: 0,
      current: 0,
      total: selectedFiles.length,
      phaseText: t('cloudSpace.batchDownloadSubmitting'),
    };

    let succeeded = 0;
    let failed = 0;
    let unconfirmed = 0;
    let cancelled = false;
    try {
      ({ succeeded, failed, unconfirmed, cancelled } = await submitAndroidBatchDownload({
        files: selectedFiles,
        resolveMeta: getDownloadMeta,
        submit: requestAndroidDownloadWithReceipt,
        isCancelled: () => batchDownloadCancelled.value,
        onSubmitted: (done, total) => {
          downloadProgress.value.current = done;
          downloadProgress.value.percent = Math.round((done / total) * 100);
        },
      }));
    } finally {
      batchDownloadLoading.value = false;
      setTimeout(() => {
        downloadProgress.value.visible = false;
      }, 600);
    }

    const submitted = succeeded + unconfirmed;
    if (cancelled) {
      message.info(
        submitted > 0
          ? t('cloudSpace.batchDownloadCancelledPartial', { count: submitted })
          : t('cloudSpace.batchDownloadCancelled'),
      );
    } else if (!submitted) {
      message.error(t('cloudSpace.batchDownloadFailed'));
    } else if (failed > 0) {
      message.warning(t('cloudSpace.batchDownloadPartial', { success: submitted, failed }));
    } else {
      // 进度卡片只画单个下载的进度，说不出「一共交了几个」，这条汇总不算重复播报；
      // 旧版 App 不回传入队回执，但后续仍会回传下载进度。这里按「已开始」中性收口，
      // 不再把兼容性超时显示成失败预警，也绝不能超时重发造成重复下载。
      message.success(t('cloudSpace.batchDownloadHandedOff', { count: submitted }));
    }

    if (submitted > 0) {
      recordOperation({ module: '云空间', operation: `批量提交下载文件【${submitted}个】` });
    }
  };

  const runBrowserDirectDownloads = async (selectedFiles: any[]) => {
    batchDownloadLoading.value = true;
    batchDownloadCancelled.value = false;
    downloadProgress.value = {
      visible: true,
      percent: 0,
      current: 0,
      total: selectedFiles.length,
      phaseText: t('cloudSpace.batchDownloadSubmitting'),
    };

    let submitted = 0;
    let failed = 0;
    let cancelled = false;
    try {
      const outcome = await submitBrowserBatchDownloads({
        files: selectedFiles,
        resolveMeta: getDownloadMeta,
        submit: triggerPreparedBrowserDownload,
        isCancelled: () => batchDownloadCancelled.value,
        onSettled: (done, total) => {
          downloadProgress.value.current = done;
          downloadProgress.value.percent = Math.round((done / total) * 100);
        },
      });
      submitted = outcome.submitted;
      failed = outcome.failed;
      cancelled = outcome.cancelled;
      outcome.failures.forEach(({ fileName, error }) => {
        console.error(`submit browser batch file failed: ${fileName}`, error);
      });
    } finally {
      batchDownloadLoading.value = false;
      window.setTimeout(() => {
        downloadProgress.value.visible = false;
      }, 600);
    }

    if (cancelled) {
      message.info(
        submitted > 0
          ? t('cloudSpace.batchDownloadBrowserCancelledPartial', { count: submitted })
          : t('cloudSpace.batchDownloadCancelled'),
      );
    } else if (!submitted) {
      message.error(t('cloudSpace.batchDownloadFailed'));
    } else if (failed > 0) {
      message.warning(t('cloudSpace.batchDownloadBrowserPartial', { submitted, failed }));
    } else {
      message.success(t('cloudSpace.batchDownloadBrowserSubmitted', { count: submitted }));
    }

    if (submitted > 0) {
      recordOperation({ module: '云空间', operation: `分别提交下载文件【${submitted}个】` });
    }
  };

  const runZipBatchDownload = async (selectedFiles: any[]) => {
    batchDownloadLoading.value = true;
    batchDownloadCancelled.value = false;
    batchDownloadAbortController.value = new AbortController();
    downloadProgress.value = {
      visible: true,
      percent: 0,
      current: 0,
      total: selectedFiles.length,
      phaseText: t('cloudSpace.batchDownloading'),
    };

    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (let i = 0; i < selectedFiles.length; i++) {
        if (batchDownloadCancelled.value) {
          throw new Error('BATCH_DOWNLOAD_CANCELLED');
        }
        const file = selectedFiles[i];
        const { downloadUrl, fileName } = await getDownloadMeta(file, i);
        const response = await fetch(downloadUrl, {
          signal: batchDownloadAbortController.value?.signal,
        });
        if (!response.ok) {
          throw new Error(t('cloudSpace.downloadFailed'));
        }
        const blob = await response.blob();
        const uniqueName = buildUniqueName(fileName, usedNames);
        zip.file(uniqueName, blob);

        downloadProgress.value.current = i + 1;
        downloadProgress.value.percent = Math.round(((i + 1) / selectedFiles.length) * 80);
      }

      downloadProgress.value.phaseText = t('cloudSpace.batchPacking');
      const zipBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        },
        (metadata) => {
          if (batchDownloadCancelled.value) {
            throw new Error('BATCH_DOWNLOAD_CANCELLED');
          }
          downloadProgress.value.percent = 80 + Math.round((metadata.percent || 0) * 0.2);
        },
      );

      if (batchDownloadCancelled.value) {
        throw new Error('BATCH_DOWNLOAD_CANCELLED');
      }

      const _now = new Date();
      const timestamp = `${_now.getFullYear()}.${String(_now.getMonth() + 1).padStart(2, '0')}.${String(_now.getDate()).padStart(2, '0')}`;
      const zipName = `file-${timestamp}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      downloadProgress.value.percent = 100;
      recordOperation({ module: '云空间', operation: `批量下载文件成功【${selectedFiles.length}个】` });
    } catch (error) {
      if (isBatchDownloadCancelledError(error)) {
        message.info(t('cloudSpace.batchDownloadCancelled'));
      } else {
        console.error('batch download failed:', error);
        message.error(t('cloudSpace.batchDownloadFailed'));
      }
    } finally {
      batchDownloadLoading.value = false;
      batchDownloadAbortController.value = null;
      setTimeout(() => {
        downloadProgress.value.visible = false;
      }, 600);
    }
  };

  type BatchDownloadMode = 'individual' | 'zip';

  const startBatchDownload = async (mode: BatchDownloadMode) => {
    const selectedFiles = batchDownloadChoiceFiles.value.slice();
    if (selectedFiles.length < 2 || batchDownloadLoading.value) return;

    if (mode === 'zip') {
      batchDownloadChoiceVisible.value = false;
      batchDownloadChoiceFiles.value = [];
      if (hasAndroidBridge()) {
        message.info(t('cloudSpace.batchDownloadZipUnavailableInApp'));
        return;
      }
      await runZipBatchDownload(selectedFiles);
      return;
    }

    // 原生桥存在时逐个交给系统 DownloadManager。
    if (hasAndroidBridge()) {
      batchDownloadChoiceVisible.value = false;
      batchDownloadChoiceFiles.value = [];
      await runAndroidBatchDownload(selectedFiles);
      return;
    }

    batchDownloadChoiceVisible.value = false;
    batchDownloadChoiceFiles.value = [];
    await runBrowserDirectDownloads(selectedFiles);
  };

  const handleBatchDownload = async () => {
    if (!hasSelection.value) {
      message.warning(t('cloudSpace.selectFilesToDownload'));
      return;
    }

    const selectedFiles = cloud.fileList.filter((item) => selectedRows.value.includes(item.id));
    if (selectedFiles.length === 1) {
      const success = await downloadField(selectedFiles[0].id);
      if (success) {
        recordOperation({ module: '云空间', operation: `下载文件成功【${selectedFiles[0].fileName}】` });
      }
      return;
    }

    batchDownloadChoiceFiles.value = selectedFiles;
    batchDownloadChoiceVisible.value = true;
  };

  function resetShareForm() {
    shareDescValue.value = '';
    shareExpiresInDays.value = 7;
    shareAccessCode.value = '';
    shareMaxAccessCount.value = '';
    shareMaxDownloadCount.value = '';
  }

  function normalizeShareLimit(value: string) {
    const normalized = String(value || '').trim();
    return normalized ? Number(normalized) : null;
  }

  function currentShareInput(): FileShareInput {
    return {
      description: shareDescValue.value.trim(),
      expiresInDays: shareExpiresInDays.value,
      accessCode: shareAccessCode.value.trim(),
      maxAccessCount: normalizeShareLimit(shareMaxAccessCount.value),
      maxDownloadCount: normalizeShareLimit(shareMaxDownloadCount.value),
    };
  }

  async function loadShareRecords() {
    if (!shareTarget.value) return;
    shareRecordsLoading.value = true;
    try {
      shareRecords.value = await listFileShares(shareTarget.value.id);
    } catch {
      message.error(t('cloudSpace.shareLoadFailed'));
    } finally {
      shareRecordsLoading.value = false;
    }
  }

  async function handleShareFile(id, fileName, fileType) {
    recordOperation({ module: '云空间', operation: `打开文件分享弹窗【${fileName}】` });
    shareTarget.value = { id, fileName, fileType };
    resetShareForm();
    shareRecords.value = [];
    shareDescVisible.value = true;
    await loadShareRecords();
  }

  const closeShareDialog = () => {
    if (shareSubmitting.value) return;
    shareDescVisible.value = false;
    shareTarget.value = null;
    shareRecords.value = [];
    resetShareForm();
  };

  const submitShare = async () => {
    if (blockGuestWrite('share-file')) return;
    if (!shareTarget.value) return;
    try {
      shareSubmitting.value = true;
      await shareField(shareTarget.value.id, currentShareInput());
      recordOperation({ module: '云空间', operation: `分享文件成功【${shareTarget.value.fileName}】` });
      resetShareForm();
      await loadShareRecords();
    } catch (error) {
      // 错误已在 shareField 中处理
    } finally {
      shareSubmitting.value = false;
    }
  };

  function formatShareDate(value: string) {
    return value ? new Date(value).toLocaleString() : '-';
  }

  function formatShareState(state: string) {
    const labels: Record<string, string> = {
      active: t('cloudSpace.shareActive'),
      revoked: t('cloudSpace.shareRevoke'),
      expired: t('cloudSpace.shareUnavailableTitle'),
      file_unavailable: t('cloudSpace.shareUnavailableTitle'),
      access_limit_reached: t('cloudSpace.shareUnavailableTitle'),
      download_limit_reached: t('cloudSpace.shareUnavailableTitle'),
    };
    return labels[state] || state;
  }

  function confirmRevokeShare(shareId: string) {
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('cloudSpace.shareRevokeConfirm'),
      onOk: async () => {
        shareSubmitting.value = true;
        try {
          await revokeFileShare(shareId);
          message.success(t('cloudSpace.shareRevoked'));
          await loadShareRecords();
        } catch {
          message.error(t('cloudSpace.shareManageFailed'));
        } finally {
          shareSubmitting.value = false;
        }
      },
    });
  }

  function confirmRotateShare(shareId: string) {
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('cloudSpace.shareRotateConfirm'),
      onOk: async () => {
        shareSubmitting.value = true;
        try {
          await rotateFileShare(shareId, currentShareInput());
          message.success(t('cloudSpace.shareRotated'));
          resetShareForm();
          await loadShareRecords();
        } catch {
          message.error(t('cloudSpace.shareManageFailed'));
        } finally {
          shareSubmitting.value = false;
        }
      },
    });
  }
  const originalName = ref('');
  const originalExt = ref('');
  const dragPreviewEl = ref<HTMLElement | null>(null);

  function canDragFile(file) {
    return !bookmark.isMobile && !batchMode.value && !file.isRename;
  }

  function onFileDragStart(event, file) {
    if (!canDragFile(file)) {
      event.preventDefault();
      return;
    }

    const dragTarget = event.currentTarget as HTMLElement | null;
    const fileLabel = dragTarget?.querySelector('.file-label, .file-card-name') as HTMLElement | null;
    if (fileLabel) {
      const preview = fileLabel.cloneNode(true) as HTMLElement;
      preview.style.position = 'fixed';
      preview.style.top = '-9999px';
      preview.style.left = '-9999px';
      preview.style.pointerEvents = 'none';
      preview.style.margin = '0';
      preview.style.padding = '8px 10px';
      preview.style.borderRadius = '8px';
      preview.style.background = 'var(--bl-input-noBorder-bg-color)';
      preview.style.border = '1px solid var(--folder-list-border-color)';
      preview.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.12)';
      preview.style.maxWidth = '320px';
      document.body.appendChild(preview);
      dragPreviewEl.value = preview;
      event.dataTransfer.setDragImage(preview, 18, 18);
    }

    event.dataTransfer.effectAllowed = 'copyMove';
    const fileUrl = String(file.fileUrl || '');
    const fileName = String(file.fileName || 'file');
    const mimeType = String(file.fileType || '').includes('/') ? String(file.fileType) : 'application/octet-stream';
    cloud.draggingFile = {
      id: String(file.id),
      folderId: String(file.folderId || ''),
    };
    // 卡片拖放结束后浏览器可能补发 click；短暂抑制，避免移动完成后又打开预览。
    suppressCardClickUntil = Number.POSITIVE_INFINITY;

    event.dataTransfer.clearData();
    if (fileUrl) {
      // Local folder drag-out uses DownloadURL.
      event.dataTransfer.setData('DownloadURL', `${mimeType}:${fileName}:${fileUrl}`);
      // Enterprise chat accepts link payloads.
      event.dataTransfer.setData('text/plain', fileUrl);
      event.dataTransfer.setData('text/uri-list', fileUrl);
    } else {
      event.dataTransfer.setData('text/plain', fileName);
    }
  }

  function onFileDragEnd(event) {
    event.dataTransfer.dropEffect = 'none';
    cloud.draggingFile = null;
    suppressCardClickUntil = Date.now() + 250;
    if (dragPreviewEl.value) {
      dragPreviewEl.value.remove();
      dragPreviewEl.value = null;
    }
  }

  function openRenameModal(file) {
    if (isFileRenaming(file)) return;
    renameModalFile.value = file;
    originalName.value = file.fileName || '';
    originalExt.value = getFileExt(originalName.value);
    renameModalValue.value = getFileBaseName(originalName.value);
    renameModalVisible.value = true;
    nextTick(() => {
      const input = document.querySelector('.rename-modal-field .b-input') as HTMLInputElement;
      input?.focus();
    });
  }
  async function confirmRename() {
    const f = renameModalFile.value;
    if (!f || isFileRenaming(f)) return;
    const previousName = originalName.value;
    const baseName = renameModalValue.value.trim();
    if (!baseName) return;
    const nextName = originalExt.value ? `${baseName}.${originalExt.value}` : baseName;
    if (nextName === previousName) {
      renameModalVisible.value = false;
      renameModalFile.value = null;
      return;
    }
    const success = await updateFileName(f, nextName, previousName);
    if (success) {
      renameModalVisible.value = false;
      renameModalFile.value = null;
    }
  }
  function handleReName(file) {
    if (isFileRenaming(file)) return;
    originalName.value = cloneDeep(file.fileName);
    originalExt.value = getFileExt(originalName.value);
    file.fileName = getFileBaseName(originalName.value);
    file.isRename = true;
    document.querySelector('.edit-file-input .b-input') as HTMLInputElement;
    nextTick(() => {
      (document.querySelector('.edit-file-input .b-input') as HTMLInputElement).focus();
    });
  }

  function cancelRename(file: any) {
    if (isFileRenaming(file)) return;
    file.fileName = originalName.value;
    file.isRename = false;
  }
</script>

<style scoped lang="less">
  .field-list {
    --file-card-min-width: 260px;

    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    container-type: inline-size;

    @supports (width: 1cqi) {
      --file-card-min-width: clamp(260px, 15cqi, 360px);
    }
  }
  .download-progress-track {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 70%, transparent);

    > span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--resource-file-color, #ff8a00);
      transition: width 0.2s ease;
    }
  }
  .field-header {
    min-height: 46px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    background: var(--cloud-file-list-header-bg, var(--card-background));
    font-weight: 650;
    font-size: 12px;
  }
  .field-header-label {
    flex-shrink: 0;
    line-height: 28px;
  }
  .field-sort-trigger.b_btn {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--desc-color);
    box-shadow: none;
    font-size: 12px;
    font-weight: 650;
  }
  .field-sort-trigger.b_btn:hover,
  .field-sort-trigger.b_btn.is-active {
    border-color: var(--surface-border-color);
    background: var(--hover-background);
    color: var(--text-color);
  }
  .field-sort-trigger.b_btn.is-active {
    color: var(--resource-file-color, #ff8a00);
  }
  .field-sort-icons {
    width: 10px;
    display: inline-flex;
    flex-direction: column;
    gap: 1px;
    color: var(--desc-color);
  }
  .field-sort-icons > * {
    opacity: 0.45;
  }
  .field-sort-icons > .active {
    opacity: 1;
    color: var(--resource-file-color, #ff8a00);
  }
  .header-checkbox {
    margin-right: 8px;
  }
  .batch-actions {
    margin-bottom: 10px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--folder-list-border-color);
    display: flex;
    align-items: center;
    color: var(--text-color);
    .selected-count {
      color: var(--desc-color);
      font-size: 14px;
      font-variant-numeric: tabular-nums;
    }
  }
  .ai-file-analysis-action {
    min-width: 128px;
    border: 1px solid transparent;
    font-weight: 600;
  }
  .ai-file-analysis-action:not(.disabled) {
    border-color: color-mix(in srgb, var(--primary-color) 28%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
  }
  @media (min-width: 768px) {
    .batch-actions .selected-count {
      width: 148px;
      flex: 0 0 148px;
      white-space: nowrap;
    }
  }
  .table-batch-actions {
    margin: 8px 10px;
    padding: 8px 10px;
    gap: 8px;
    flex-shrink: 0;
    border: 0;
    border-radius: 10px;
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 6%, var(--menu-body-bg-color));
  }
  .mobile-batch-toolbar {
    margin: 8px 10px 0;
    padding: 10px;
    display: grid;
    gap: 10px;
    flex-shrink: 0;
    border: 1px solid color-mix(in srgb, var(--resource-file-color, #ff8a00) 18%, var(--surface-border-color));
    border-radius: 12px;
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 6%, var(--card-background));
  }
  .mobile-batch-summary {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mobile-batch-summary .selected-count {
    min-width: 0;
    flex: 1;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 20px;
    white-space: nowrap;
  }
  .mobile-batch-exit {
    flex: 0 0 auto;
  }
  .mobile-batch-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .mobile-batch-actions :deep(.b_btn) {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    height: auto;
    padding: 8px 10px;
    gap: 6px;
    line-height: 20px;
  }
  .mobile-batch-actions .ai-file-analysis-action {
    min-width: 0;
  }
  .mobile-batch-move {
    color: #fff;
    border-color: var(--resource-file-color, #ff8a00);
    background: var(--resource-file-color, #ff8a00);
  }
  .download-progress-floating {
    position: absolute;
    top: 12px;
    right: 12px;
    width: min(380px, calc(100% - 24px));
    z-index: 30;
    background: var(--bl-input-noBorder-bg-color);
    border: 1px solid var(--folder-list-border-color);
    border-radius: 10px;
    padding: 10px 12px;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
    .download-progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--desc-color);
      margin-bottom: 6px;
      .download-progress-title {
        font-weight: 600;
        color: var(--text-color);
      }
      .download-progress-ops {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .download-cancel-btn {
        padding: 0 4px;
        height: 20px;
        color: var(--text-color);
      }
    }
  }
  .batch-download-choice {
    display: grid;
    gap: 16px;
  }
  .batch-download-choice__hint {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }
  .batch-download-choice__options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .batch-download-choice__option.b_btn {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 112px;
    padding: 18px;
    justify-content: flex-start;
    gap: 12px;
    white-space: normal;
    text-align: left;
    line-height: 1.4;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 12px;
    background: var(--card-background);
  }
  .batch-download-choice__option.b_btn:not(.disabled):hover {
    border-color: var(--primary-color) !important;
    background: var(--menu-active-bg-color);
  }
  .batch-download-choice__icon {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    color: var(--primary-color);
    background: var(--menu-active-bg-color);
  }
  .batch-download-choice__copy {
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  .batch-download-choice__copy strong {
    color: var(--text-color);
    font-size: 15px;
  }
  .batch-download-choice__copy small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }
  .file-container {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    scrollbar-gutter: stable;
    background: var(--workspace-panel-bg-color);
  }

  .file-load-more {
    position: absolute;
    left: 50%;
    bottom: 12px;
    z-index: 4;
    transform: translateX(-50%);
    min-height: 30px;
    padding: 4px 10px;
    border-radius: 999px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--menu-body-bg-color) 92%, transparent);
    box-shadow: 0 8px 24px -18px color-mix(in srgb, var(--text-color) 45%, transparent);
    pointer-events: none;
  }
  .field-item {
    min-height: 58px;
    padding: 0 16px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--card-background);
    content-visibility: auto;
    contain-intrinsic-size: 58px;
    transition:
      background-color 0.18s,
      box-shadow 0.18s;
    &:hover {
      background: var(--cloud-file-list-row-hover-bg, var(--card-background));
      .handle-btn {
        opacity: 1;
      }
    }

    &.field-item--selected {
      background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 7%, var(--card-background));
      box-shadow: inset 3px 0 0 var(--resource-file-color, #ff8a00);

      &:hover {
        background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 9%, var(--card-background));
      }
    }
    .handle-btn {
      color: var(--desc-color);
      opacity: 0;
      position: absolute;
      right: 8px;
      z-index: 1;
      gap: 10px;
      flex-wrap: nowrap;
      transition: opacity 0.2s;
      div {
        cursor: pointer;
      }
    }
  }
  .field-item-draggable {
    cursor: grab;
    &:active {
      cursor: grabbing;
    }
  }
  @container (min-width: 480px) {
    .mobile-batch-actions {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .edit-file-input {
    width: min(400px, calc(100% - 120px));

    &.edit-file-input--saving {
      :deep(.b-input) {
        padding-right: 110px !important;
      }
    }
  }
  .rename-saving-indicator {
    min-width: 24px;
    height: 24px;
    padding: 0;

    :deep(.btn-spinner) {
      margin-right: 0;
    }
  }
  .rename-saving-text {
    color: var(--desc-color);
    font-size: 12px;
    white-space: nowrap;
  }
  .file-label {
    // 桌面端固定为下载、重命名、标签和更多四个操作预留空间，待整理角标不能压到按钮上。
    width: calc(100% - 140px);
    cursor: pointer;
    gap: 8px;
    color: var(--text-color);
    font-weight: 520;
  }
  .file-name {
    min-width: 0;
    flex: 1 1 auto;
  }
  .row-checkbox {
    margin-right: 10px;
  }
  .default-area {
    display: grid;
    grid-template-columns: minmax(86px, 0.7fr) minmax(130px, 1.15fr) minmax(74px, 0.55fr) minmax(130px, 0.9fr);
    align-items: center;
    flex: 1;
    font-size: 12px;
    color: var(--desc-color);
    div {
      flex: 1;
      min-width: 0;
      padding-right: 12px;
    }
  }
  .share-desc-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .share-desc-tip {
    color: var(--desc-color);
    font-size: 12px;
  }
  .share-field-label {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }
  .share-limit-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    > div {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
  }
  .share-desc-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .share-records {
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--surface-divider-color);
    h4 {
      margin: 0 0 8px;
      color: var(--text-color);
    }
  }
  .share-records-empty {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
  }
  .share-record {
    display: grid;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid var(--surface-divider-color);
    .share-record-head,
    .share-record-meta,
    .share-record-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    span {
      color: var(--desc-color);
      font-size: 12px;
    }
  }
  .share-record-actions {
    justify-content: flex-end !important;
  }
  @media (max-width: 1400px) {
    .field-item {
      .handle-btn {
        opacity: 1 !important;
      }
    }
  }
  @media (max-width: 1024px) {
    .batch-actions {
      padding: 10px 0;
    }
    .field-header {
      padding: 0 10px 10px 10px;
    }
    .field-item {
      padding: 0 10px;
      .flex-align-center:first-child {
        .file-label {
          min-width: 0;
        }
      }
      .handle-btn {
        opacity: 1 !important;
      }
    }
    .edit-file-input {
      width: calc(100% - 92px);
    }
  }
  @media (max-width: 767px) {
    .batch-download-choice__options {
      grid-template-columns: 1fr;
    }
    .batch-download-choice__option.b_btn {
      min-height: 92px;
    }
    .file-label {
      // 右侧“更多”现在是完整 44px 触控按钮；额外留出 10px 呼吸位，
      // 避免待整理角标紧贴按钮，看起来像整组操作被挤到了标题旁边。
      width: calc(100% - 54px);
    }
    .field-item--batch .file-label {
      width: 100%;
    }
    .file-label :deep(.inbox-pending-badge) {
      margin-left: auto;
    }
    .field-item--selected {
      background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 4%, var(--card-background));
      box-shadow: inset 2px 0 0 color-mix(in srgb, var(--resource-file-color, #ff8a00) 55%, transparent);

      &:hover {
        background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 5%, var(--card-background));
      }
    }
  }
  .file-tags-cell {
    min-width: 0;
  }

  .file-tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 40px;
    overflow: hidden;
  }

  .file-tags-empty {
    color: var(--desc-color);
    opacity: 0.7;
  }

  // ── 卡片视图 ──
  .card-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }
  .card-toolbar .batch-actions {
    flex-shrink: 0;
    margin-bottom: 0;
    padding: 0;
    border: none;
  }

  .file-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--file-card-min-width), 1fr));
    gap: 14px;
    padding: 14px;
    overflow-y: auto;
    height: 100%;
    align-content: start;
  }

  .file-card {
    display: flex;
    flex-direction: column;
    min-height: 278px;
    border-radius: 13px;
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
    cursor: pointer;
    transition:
      box-shadow 0.2s ease,
      border-color 0.2s ease;
    overflow: hidden;
    box-shadow: var(--surface-card-shadow);
    content-visibility: auto;
    contain: layout style paint;
    &:hover {
      box-shadow: var(--surface-hover-shadow);
      border-color: color-mix(in srgb, var(--resource-file-color) 26%, var(--surface-border-color));
    }
  }

  .file-card--draggable {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }

  .file-card-cover {
    position: relative;
    width: 100%;
    height: 142px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 92%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--folder-list-border-color) 76%, transparent);
  }

  .file-card-thumb {
    width: calc(100% - var(--file-card-preview-inset, 0px));
    height: calc(100% - var(--file-card-preview-inset, 0px));
    border-radius: var(--file-card-preview-radius, 0);
    object-fit: cover;
    background: var(--file-card-preview-background, transparent);
    box-shadow: var(--file-card-preview-shadow, none);
  }

  .file-card-video-preview {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #080a0f;
  }

  .file-card-video-thumb {
    object-fit: contain;
    background: #080a0f;
  }

  .file-card-video-play {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border: 2px solid rgba(255, 255, 255, 0.92);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.76);
    color: #fff;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .file-card-video-duration {
    position: absolute;
    right: 9px;
    bottom: 9px;
    padding: 3px 6px;
    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.78);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    pointer-events: none;
  }

  .file-card-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: color-mix(in srgb, var(--desc-color) 84%, transparent);
  }

  .file-card-placeholder-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: inherit;
    opacity: 0.88;
  }

  .file-card-placeholder-inner span {
    max-width: 160px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: color-mix(in srgb, var(--desc-color) 92%, transparent);
    background: color-mix(in srgb, var(--common-tag-bg-color) 78%, transparent);
  }

  .file-card-placeholder--image {
    background: color-mix(in srgb, #f97316 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--video {
    background: color-mix(in srgb, #ef4444 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--audio {
    background: color-mix(in srgb, #8b5cf6 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--pdf {
    background: color-mix(in srgb, #dc2626 8%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--word {
    background: color-mix(in srgb, #2563eb 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--excel {
    background: color-mix(in srgb, #16a34a 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--ppt {
    background: color-mix(in srgb, #ea580c 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--text {
    background: color-mix(in srgb, #94a3b8 8%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--compress {
    background: color-mix(in srgb, #ca8a04 8%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--other {
    background: color-mix(in srgb, #6b7280 7%, var(--bl-input-noBorder-bg-color));
  }

  .file-card-text-preview {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 90%, #111318 10%);
    border-top: 1px solid color-mix(in srgb, var(--folder-list-border-color) 80%, transparent);
  }

  .file-card-text-preview :deep(.cloud-text-card-preview) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  [data-theme='night'] .file-card-text-preview {
    background: color-mix(in srgb, #1a1c22 86%, var(--bl-input-noBorder-bg-color) 14%);
    border-top-color: color-mix(in srgb, #3b3f4a 78%, transparent);
  }

  .file-card:hover .file-card-overlay,
  .file-card:hover .file-card-more {
    opacity: 1 !important;
    pointer-events: auto;
  }

  .file-card-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 32px 8px 8px;
    opacity: 0;
    transition: opacity 0.2s ease;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, transparent 40%);
    pointer-events: none;
  }

  .overlay-btn {
    color: #fff;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
    cursor: pointer;
    transition: transform 0.18s ease;
    pointer-events: auto;
    &:hover {
      transform: scale(1.15);
    }
  }

  .file-card-more {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 2;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .mobile-file-more.b_btn {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-color);
  }
  .file-card-more .more-icon {
    color: rgba(255, 255, 255, 0.7);
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
    cursor: pointer;
    transition: color 0.2s;
  }
  .file-card-more .more-icon:hover {
    color: #fff;
  }

  .rename-modal-input {
    margin-bottom: 16px;
  }
  .rename-modal-field {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 16px;
  }
  .rename-modal-field .rename-modal-input {
    margin-bottom: 0;
    flex: 1;
  }
  .rename-modal-ext {
    font-size: 14px;
    color: #888;
    white-space: nowrap;
  }
  .rename-modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .overlay-menu {
    pointer-events: auto;
  }

  .file-card-body {
    padding: 12px 14px 13px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-height: 136px;
  }

  .file-card-headline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .file-card-type {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: color-mix(in srgb, var(--resource-file-color) 86%, var(--desc-color));
    background: color-mix(in srgb, var(--resource-file-color) 9%, transparent);
  }

  .file-card-size {
    font-size: 12px;
    color: var(--desc-color);
    font-weight: 600;
    opacity: 0.86;
    max-width: 46%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-card-name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: calc(1.4em * 2);
  }

  .file-empty-state {
    min-height: 0;
    flex: 1;
    padding: 28px 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--desc-color);
    text-align: center;
  }

  .file-empty-icon {
    width: 54px;
    height: 54px;
    margin-bottom: 4px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 10%, var(--menu-body-bg-color));
  }

  .file-empty-state strong {
    color: var(--text-color);
    font-size: 16px;
  }

  .file-empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .file-empty-action {
    margin-top: 6px;
  }

  .file-card-meta {
    font-size: 12px;
    color: var(--desc-color);
    display: flex;
    align-items: center;
    gap: 8px;
    line-height: 1.4;
    min-width: 0;
    min-height: 18px;
  }

  .meta-label {
    flex: 0 0 auto;
    color: var(--text-color);
    opacity: 0.78;
    font-weight: 600;
  }

  @media (max-width: 1400px) {
    .file-card-overlay {
      opacity: 1 !important;
    }
    .file-card-more {
      opacity: 1 !important;
      pointer-events: auto;
    }
  }

  @media (max-width: 720px) {
    .field-list {
      min-width: 0;
    }
    .file-card-grid {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      column-gap: 12px;
      row-gap: 12px;
      padding: 10px;
    }

    .file-card {
      min-height: 260px;
    }

    .file-card-cover {
      height: 128px;
    }
  }

  // ── 卡片批量勾选样式 ──
  .card-checkbox {
    position: absolute;
    top: 7px;
    right: 7px;
    z-index: 10;
    line-height: 0;
  }

  .file-card--batch {
    cursor: pointer;
    user-select: none;
    &.file-card--selected {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 30%, transparent);
      background: color-mix(in srgb, var(--primary-color) 5%, var(--card-background));
      &:hover {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 40%, transparent);
      }
    }
  }

  .batch-select-all {
    margin-right: 2px;
  }

  // 全选 a-checkbox 覆写：与 b-checkbox 蓝底风格统一
  .batch-select-all,
  .header-checkbox {
    :deep(.ant-checkbox-inner) {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      border-color: var(--card-border-color);
      background: transparent;
      transition: all 0.1s ease;
    }
    &:hover :deep(.ant-checkbox-inner) {
      border-color: var(--primary-color) !important;
    }
    :deep(.ant-checkbox-checked .ant-checkbox-inner) {
      background-color: var(--primary-color) !important;
      border-color: var(--primary-color) !important;
    }
    :deep(.ant-checkbox-indeterminate .ant-checkbox-inner) {
      background-color: var(--primary-color) !important;
      border-color: var(--primary-color) !important;
    }
    :deep(.ant-checkbox-indeterminate .ant-checkbox-inner::after) {
      background-color: #fff !important;
    }
  }
  [data-theme='night'] {
    .batch-select-all,
    .header-checkbox {
      :deep(.ant-checkbox-inner) {
        border-color: #6e6e77 !important;
      }
    }
  }
</style>
