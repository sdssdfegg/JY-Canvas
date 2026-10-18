import { Loader2, Download, CheckSquare, Square, X, RotateCcw, Copy, Sparkles, Plus, Play, Save, FolderOpen, BookOpen, Settings, FileText } from "lucide-react";
import { StableTextarea } from "../../shared/ui/stable-textarea.jsx";
import { DetailUploadZone } from "../../shared/ui/detail-upload-zone";
import ChannelPicker from "../../shared/ui/ChannelPicker.jsx";
import { CachedImage } from "../../shared/ui/cached-image.jsx";
import { ReferenceThumbTray } from "../../shared/ui/reference-thumb-tray.jsx";
import { Button } from "../../shared/ui/Button";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { imageSourceFromResult } from "../../shared/models.js";
import { formatMs } from "../../lib/format/index.js";

// 一键详情/主图面板视图（V60 从 src/main.jsx 迁出）。纯 JSX，无状态（提示词助手开关除外）。
// 状态与编排全部来自 detailApi（src/features/detail/detail-state.js 的 useDetailState 返回值）。
// 与图片快捷生成 / 视频 composer / 参考生图共享的件（openPreview / openContextMenu / downloadItem /
// rerunResult / copyText / beginResultImageDrag / openReferencePreview / openReferenceContextMenu /
// beginReferenceImageDrag / openUploadPreview / markDeferredFeature / toggleSelected）由 App() 下发为 props。
// COUNT_OPTIONS 为快捷生成 / 详情 / 参考三处共用，留在 App 作为 props 下发（同 V59 口径）。
// 其余六个选项常量与 MAX_DETAIL_FILES 详情独占，随视图一并迁入 detail-state.js。

export function DetailView({
  detailApi,
  events,
  models,
  config,
  countOptions,
  selectedIds,
  selectedCount,
  toggleSelected,
  openPreview,
  openContextMenu,
  rerunResult,
  downloadItem,
  copyText,
  beginResultImageDrag,
  openReferencePreview,
  openReferenceContextMenu,
  beginReferenceImageDrag,
  openUploadPreview,
  markDeferredFeature,
  onOpenPromptAssistant
}) {
  const {
    detailSettings,
    detailProductFiles,
    detailReferenceFiles,
    detailGroups,
    detailStatus,
    detailColumns,
    detailForwardSort,
    detailInfoSelection,
    detailDragScreen,
    detailModel,
    detailRatios,
    detailSizes,
    detailRunningCount,
    detailProductPreviews,
    detailReferencePreviews,
    activeDetailGroup,
    visibleDetailPrompts,
    activeDetailResults,
    detailInfoItem,
    detailProductInputRef,
    detailReferenceInputRef,
    MAX_DETAIL_FILES,
    workflowOptions,
    copywritingOptions,
    richnessOptions,
    fontStyleOptions,
    modelModeOptions,
    modelPoseOptions,
    detailSkillVersionOptions,
    stylePackOptions,
    setActiveDetailGroupId,
    setDetailColumns,
    setDetailForwardSort,
    setDetailInfoSelection,
    setIsDetailPresetOpen,
    updateDetailSetting,
    addDetailFiles,
    removeDetailFile,
    clearDetailFiles,
    saveDetailPreset,
    createDetailPromptPlan,
    selectDetailResult,
    beginDetailScreenDrag,
    dropDetailScreen,
    endDetailScreenDrag,
    toggleDetailPrompt,
    updateDetailPrompt,
    generateDetailPrompt,
    generateDetailGroup,
    downloadDetailGroup,
    applyDetailPromptToQuickgen
  } = detailApi;

  return (
    <section className="detailWorkbench">
      <aside className="detailInputPanel">
        <div className="detailPanelScroll">
          <DetailUploadZone
            title="产品图（包含模特图）"
            subtitle={`最多 ${MAX_DETAIL_FILES} 张，优先放主商品、细节、模特图`}
            previews={detailProductPreviews}
            count={detailProductFiles.length}
            maxCount={MAX_DETAIL_FILES}
            inputRef={detailProductInputRef}
            onPick={(event) => {
              addDetailFiles("product", event.target.files);
              event.target.value = "";
            }}
            onAddFiles={(fileList) => addDetailFiles("product", fileList)}
            onRemove={(index) => removeDetailFile("product", index)}
            onPreview={openUploadPreview}
            onAssetLibrary={() => markDeferredFeature("素材库")}
            onClear={() => clearDetailFiles("product")}
          />

          <DetailUploadZone
            title="参考图（设计风格参考）"
            subtitle={`最多 ${MAX_DETAIL_FILES} 张，只参考风格、配色、版式`}
            previews={detailReferencePreviews}
            count={detailReferenceFiles.length}
            maxCount={MAX_DETAIL_FILES}
            inputRef={detailReferenceInputRef}
            onPick={(event) => {
              addDetailFiles("reference", event.target.files);
              event.target.value = "";
            }}
            onAddFiles={(fileList) => addDetailFiles("reference", fileList)}
            onRemove={(index) => removeDetailFile("reference", index)}
            onPreview={openUploadPreview}
            onAssetLibrary={() => markDeferredFeature("素材库")}
            onClear={() => clearDetailFiles("reference")}
          />

          <div className="detailPresetRow">
            <Button size="sm" type="button" onClick={saveDetailPreset}>
              <Save size={15} />
              <span>保存预设</span>
            </Button>
            <Button size="sm" type="button" onClick={() => setIsDetailPresetOpen(true)}>
              <FolderOpen size={15} />
              <span>加载预设</span>
            </Button>
          </div>

          <div className="detailDivider" />

          <section className="detailFormSection">
            {/* 2026-09-26：在「基础参数」标题行右侧加一个紧凑圆形渠道入口。
                入口绝对定位（见 styles.css 的 .detailFormHeader / .channelPicker），
                所以不新增整行控件、不改参数区高度；渠道列表走共享 ChannelPicker。 */}
            <div className="detailFormHeader">
              <h3>基础参数</h3>
              <ChannelPicker
                model={detailSettings.model}
                modelLabel={detailModel?.label || detailSettings.model}
                channelId={detailSettings.channelId}
                routing={config.routing || config}
                onChange={(channelId) => updateDetailSetting("channelId", channelId)}
              />
            </div>
            <div className="detailParamGrid">
              <label>
                <span>工作流</span>
                <select value={detailSettings.workflow} onChange={(event) => updateDetailSetting("workflow", event.target.value)}>
                  {workflowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>图片模型</span>
                <select value={detailSettings.model} onChange={(event) => updateDetailSetting("model", event.target.value)}>
                  {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
              </label>
              <label>
                <span>图片比例</span>
                <select value={detailSettings.ratio} onChange={(event) => updateDetailSetting("ratio", event.target.value)}>
                  {detailRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                </select>
              </label>
              <label>
                <span>分辨率</span>
                <select value={detailSettings.imageSize} onChange={(event) => updateDetailSetting("imageSize", event.target.value)}>
                  {detailSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <label>
                <span>生成数量</span>
                <select value={detailSettings.count} onChange={(event) => updateDetailSetting("count", event.target.value)}>
                  {countOptions.map((count) => <option key={count} value={count}>{count}张</option>)}
                </select>
              </label>
              <label>
                <span>文案设置</span>
                <select value={detailSettings.copywriting} onChange={(event) => updateDetailSetting("copywriting", event.target.value)}>
                  {copywritingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>画面丰富</span>
                <select value={detailSettings.richness} onChange={(event) => updateDetailSetting("richness", event.target.value)}>
                  {richnessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>字体风格</span>
                <select value={detailSettings.fontStyle} onChange={(event) => updateDetailSetting("fontStyle", event.target.value)}>
                  {fontStyleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>模特设置</span>
                <select value={detailSettings.modelMode} onChange={(event) => updateDetailSetting("modelMode", event.target.value)}>
                  {modelModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>模特姿势</span>
                <select
                  value={detailSettings.modelPose}
                  disabled={detailSettings.modelMode !== "use-model"}
                  onChange={(event) => updateDetailSetting("modelPose", event.target.value)}
                >
                  {modelPoseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>模特使用率</span>
                <select
                  value={detailSettings.modelUsage}
                  disabled={detailSettings.modelMode !== "use-model"}
                  onChange={(event) => updateDetailSetting("modelUsage", event.target.value)}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>插入反转屏</span>
                <select value={detailSettings.reverseScreens} onChange={(event) => updateDetailSetting("reverseScreens", event.target.value)}>
                  {Array.from({ length: 5 }, (_, index) => index).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Skill 版本</span>
                <select value={detailSettings.detailSkillVersion} onChange={(event) => updateDetailSetting("detailSkillVersion", event.target.value)}>
                  {detailSkillVersionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>视觉风格包</span>
                <select
                  value={detailSettings.stylePackId}
                  disabled={detailSettings.detailSkillVersion !== "v2"}
                  onChange={(event) => updateDetailSetting("stylePackId", event.target.value)}
                >
                  {stylePackOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>输出语种</span>
                <input value={detailSettings.lang} onChange={(event) => updateDetailSetting("lang", event.target.value)} />
              </label>
            </div>
          </section>

          <div className="detailDivider" />

          <section className="detailFormSection">
            <h3>内容输入（可选）</h3>
            <label className="detailField">
              <span>产品名称</span>
              <input
                value={detailSettings.productName}
                onChange={(event) => updateDetailSetting("productName", event.target.value)}
                placeholder="例：女装假两件上衣"
              />
            </label>
            <label className="detailField">
              <span>产品特征</span>
              <textarea
                value={detailSettings.productFeature}
                onChange={(event) => updateDetailSetting("productFeature", event.target.value)}
                placeholder="产品大小，尺寸，特征信息用于锁死产品一致性（可不输入）"
              />
            </label>
            <label className="detailField">
              <span className="detailFieldTitle">
                <b>用户指令</b>
                <button type="button" onClick={onOpenPromptAssistant}>
                  <BookOpen size={13} />
                  提示词助手
                </button>
              </span>
              <textarea
                value={detailSettings.userInstruction}
                onChange={(event) => updateDetailSetting("userInstruction", event.target.value)}
                placeholder="用户指令：屏数、风格、图1/2/3 用法等"
              />
            </label>
            <label className="detailField">
              <span>卖点</span>
              <textarea
                value={detailSettings.sellingPoints}
                onChange={(event) => updateDetailSetting("sellingPoints", event.target.value)}
                placeholder="每行一个卖点，可留空"
              />
            </label>
          </section>
        </div>

        <div className="detailPanelFooter">
          <Button
            size="md"
            tone="primary"
            type="button"
            disabled={detailStatus === "planning"}
            onClick={() => void createDetailPromptPlan()}
          >
            {detailStatus === "planning" ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            <span>{detailStatus === "planning" ? "分析中..." : "生成分段提示词"}</span>
          </Button>
        </div>
      </aside>

      <section className={`detailResultBoard ${detailInfoItem ? "withInfo" : ""}`}>
        <div className="detailBoardMain">
          {detailGroups.length === 0 ? (
            <div className="detailEmpty">
              <FileText size={34} />
              <span>上传产品图后，点击「生成分段提示词」开始</span>
            </div>
          ) : (
            <>
              <div className="detailGroupTabs">
                <div>
                  {detailGroups.map((group, index) => (
                    <button
                      className={activeDetailGroup?.id === group.id ? "active" : ""}
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setActiveDetailGroupId(group.id);
                        setDetailInfoSelection(null);
                      }}
                    >
                      分组 #{detailGroups.length - index}{group.stylePack ? `·${group.stylePack.id}` : ""}
                    </button>
                  ))}
                </div>
                <div className="detailViewControls">
                  <label>
                    <span>每行展示</span>
                    <select value={detailColumns} onChange={(event) => setDetailColumns(Number(event.target.value))}>
                      {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </label>
                  <button
                    className={`switchButton ${detailForwardSort ? "active" : ""}`}
                    type="button"
                    onClick={() => setDetailForwardSort((current) => !current)}
                  >
                    <span>正向排序</span>
                    <i />
                  </button>
                </div>
              </div>

              {activeDetailGroup && (
                <article className="detailGroup" key={activeDetailGroup.id}>
                  <ModuleHeader
                    title={activeDetailGroup.label}
                    subtitle={
                      <>{activeDetailGroup.stylePack ? `${activeDetailGroup.stylePack.id}·${activeDetailGroup.stylePack.name} · ` : ""}
                      {activeDetailGroup.params.platform}{activeDetailGroup.params.pageType} ·
                      {activeDetailGroup.params.model} · {activeDetailGroup.params.ratio} · {activeDetailGroup.params.imageSize} ·
                      已出图 {activeDetailResults.length} 屏</>
                    }
                    action={
                      <div className="detailGroupActions">
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => markDeferredFeature("切换模型")}
                        >
                          <Settings size={14} />
                          <span>切换模型</span>
                        </Button>
                        <Button size="sm" type="button" onClick={() => downloadDetailGroup(activeDetailGroup)}>
                          <Download size={14} />
                          <span>下载全部</span>
                        </Button>
                        <Button size="sm" type="button" disabled={selectedCount === 0} onClick={() => downloadDetailGroup(activeDetailGroup, true)}>
                          <Download size={14} />
                          <span>下载选中</span>
                        </Button>
                        <Button
                          size="md"
                          tone="primary"
                          type="button"
                          onClick={() => void generateDetailGroup(activeDetailGroup.id)}
                        >
                          {detailRunningCount > 0 ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                          <span>批量生成</span>
                        </Button>
                      </div>
                    }
                  />

                  <section className="detailPromptConfirm">
                    <ModuleHeader
                      title="分段提示词确认"
                      subtitle="确认每一屏内容无误后，再点击批量生成或单屏生成。"
                      divider={false}
                    />
                    <div className="detailPromptGrid">
                      {visibleDetailPrompts.map((prompt) => (
                        <article className={`detailPromptCard ${prompt.status}`} key={`${activeDetailGroup.id}-${prompt.screen}`}>
                          <header>
                            <label className="detailCheck">
                              <input
                                type="checkbox"
                                checked={prompt.enabled}
                                onChange={() => toggleDetailPrompt(activeDetailGroup.id, prompt.screen)}
                              />
                              <span>第{prompt.screen}屏</span>
                            </label>
                            <small>{prompt.intervention}</small>
                          </header>
                          <h3>{prompt.title}</h3>
                          <p>{prompt.summary}</p>
                          {prompt.referenceStrategy && <small>{prompt.referenceStrategy}</small>}
                          <StableTextarea
                            value={prompt.text}
                            onChange={(event) => updateDetailPrompt(activeDetailGroup.id, prompt.screen, { text: event.target.value })}
                          />
                          <div className="detailPromptActions">
                            <Button size="sm" type="button" onClick={() => void copyText(prompt.text, `第${prompt.screen}屏提示词已复制`)}>
                              <Copy size={14} />
                              <span>复制</span>
                            </Button>
                            <Button size="sm" type="button" onClick={() => applyDetailPromptToQuickgen(prompt)}>
                              <Sparkles size={14} />
                              <span>推送</span>
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              disabled={prompt.status === "running"}
                              onClick={() => void generateDetailPrompt(activeDetailGroup, prompt, prompt.screen)}
                            >
                              {prompt.status === "running" ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
                              <span>生成</span>
                            </Button>
                          </div>
                          {(prompt.generationMs || prompt.status === "failed") && (
                            <div className="detailPromptStatus">
                              {prompt.generationMs && <span>用时 {formatMs(prompt.generationMs)}</span>}
                              {prompt.error && <strong>{prompt.error}</strong>}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>

                  {activeDetailResults.length > 0 && (
                    <section className="detailImageSection">
                      <ModuleHeader
                        title="生成分屏"
                        subtitle="左键点击查看信息，按住拖拽调整拼图顺序，右键打开图片操作。"
                        divider={false}
                      />
                      <div className="detailScreensGrid" style={{ "--detail-columns": detailColumns }}>
                        {activeDetailResults.map(({ prompt, result }, resultIndex) => {
                          const src = imageSourceFromResult(result.image);
                          const selected = selectedIds.has(result.id);
                          return (
                            <article
                              className={`detailScreenCard ${detailInfoSelection?.resultId === result.id ? "selected" : ""} ${detailDragScreen?.screen === prompt.screen ? "dragging" : ""}`}
                              key={result.id}
                              draggable
                              onDragStart={(event) => beginDetailScreenDrag(event, activeDetailGroup.id, prompt.screen)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => dropDetailScreen(event, activeDetailGroup.id, prompt.screen)}
                              onDragEnd={endDetailScreenDrag}
                            >
                              <header>
                                <span>{String(resultIndex + 1).padStart(2, "0")}</span>
                                <i>⋮</i>
                              </header>
                              <button
                                className="detailScreenSelect"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSelected(result.id);
                                }}
                                aria-label="选择分屏图片"
                              >
                                {selected ? <CheckSquare size={18} /> : <Square size={18} />}
                              </button>
                              <button
                                className="detailScreenImage"
                                type="button"
                                draggable={false}
                                onClick={() => {
                                  selectDetailResult(activeDetailGroup, prompt, result);
                                  openPreview(result);
                                }}
                                onContextMenu={(event) => openContextMenu(event, result.id)}
                              >
                                <CachedImage
                                  src={src}
                                  alt={`第${prompt.screen}屏结果`}
                                  draggable
                                  onDragStart={(event) => beginResultImageDrag(event, result, resultIndex)}
                                  diagnostic={{ requestId: result.requestId || result.id, endpoint: "/api/images", module: "一键详情", placement: `detail-screen-${prompt.screen}` }}
                                />
                              </button>
                              <button
                                className="detailScreenPrompt"
                                type="button"
                                onClick={() => void copyText(prompt.text, `第${prompt.screen}屏提示词已复制`)}
                                title={prompt.text}
                              >
                                {prompt.text}
                              </button>
                              <div className="detailReferenceTray">
                                <ReferenceThumbTray references={result.references} count={result.referenceCount} max={5} onOpen={openReferencePreview} onContextMenu={openReferenceContextMenu} onImageDragStart={beginReferenceImageDrag} />
                                <button type="button" onClick={() => markDeferredFeature("追加参考图")}>
                                  <Plus size={13} />
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </article>
              )}
            </>
          )}
        </div>

        {detailInfoItem && (
          <aside className="detailInfoPanel">
            <ModuleHeader
              title="生图信息"
              subtitle={`第${detailInfoItem.prompt.screen}屏 · ${detailInfoItem.prompt.title}`}
              action={<Button size="sm" iconOnly aria-label="关闭" type="button" onClick={() => setDetailInfoSelection(null)}>
                <X size={16} />
              </Button>}
              divider={false}
            />
            <button
              className="detailInfoPreview"
              type="button"
              onClick={() => openPreview(detailInfoItem.result)}
              onContextMenu={(event) => openContextMenu(event, detailInfoItem.result.id)}
            >
              <CachedImage
                src={imageSourceFromResult(detailInfoItem.result.image)}
                alt="详情分屏预览"
                draggable
                onDragStart={(event) => beginResultImageDrag(event, detailInfoItem.result)}
                diagnostic={{ requestId: detailInfoItem.result.requestId || detailInfoItem.result.id, endpoint: "/api/images", module: "一键详情", placement: "detail-info" }}
              />
            </button>
            <div className="detailInfoMeta">
              <span>模型</span><strong>{detailInfoItem.result.modelLabel}</strong>
              <span>尺寸</span><strong>{detailInfoItem.result.imageSize} · {detailInfoItem.result.aspectRatio}</strong>
              <span>参考图</span><strong>{detailInfoItem.result.referenceCount} 张</strong>
              <span>用时</span><strong>{detailInfoItem.result.generationMs ? formatMs(detailInfoItem.result.generationMs) : "--"}</strong>
              <span>状态</span><strong>{detailInfoItem.prompt.status === "success" ? "已完成" : detailInfoItem.prompt.status}</strong>
            </div>
            <section className="detailInfoReferences">
              <span>本张参考图</span>
              <ReferenceThumbTray references={detailInfoItem.result.references} count={detailInfoItem.result.referenceCount} max={6} onOpen={openReferencePreview} onContextMenu={openReferenceContextMenu} onImageDragStart={beginReferenceImageDrag} />
            </section>
            <label className="detailInfoPrompt">
              <span>提示词</span>
              <textarea value={detailInfoItem.prompt.text} readOnly />
            </label>
            <div className="detailInfoActions">
              <Button size="sm" type="button" onClick={() => void copyText(detailInfoItem.prompt.text, "提示词已复制")}>
                <Copy size={14} />
                <span>复制提示词</span>
              </Button>
              <Button size="sm" type="button" onClick={() => rerunResult(detailInfoItem.result, 1)}>
                <RotateCcw size={14} />
                <span>重刷</span>
              </Button>
              <Button size="sm" type="button" onClick={() => void downloadItem(detailInfoItem.result, 0)}>
                <Download size={14} />
                <span>下载</span>
              </Button>
            </div>
          </aside>
        )}

        {events.length > 0 && (
          <div className="eventPill">
            <strong>{events[0].label}</strong>
            <span>{events[0].detail}</span>
          </div>
        )}
      </section>
    </section>
  );
}
