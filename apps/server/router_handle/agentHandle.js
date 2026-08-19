/**
 * Agent HTTP 公开入口。
 *
 * 路由只依赖这层稳定 facade；语义与执行由 runtime 模块负责，端点协议映射集中在
 * agentEndpointHandlers，避免路由层重新拥有意图、材料或工具决策权。
 */
export {
  agentChat,
  confirmAgentTool,
  generateAgentFollowUps,
  prepareAgentToolAction,
  rejectAgentTool,
  replaceAgentNoteTargetDirectory,
  respondAgentInteraction,
} from './agentEndpointHandlers.js';
