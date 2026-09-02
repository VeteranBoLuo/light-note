import { ensureNotVisitor, ensureUserOrAdminPolicy } from '../util/auth.js';
import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { recordServerOperation } from '../util/operationLog.js';
import { parseToolboxError } from '../util/toolbox/errors.js';
import { getToolboxKnowledgeOverview } from '../util/toolbox/knowledgeStructure.js';
import {
  cancelToolboxJob,
  createToolboxJob,
  createToolboxQuote,
  getToolboxArtifact,
  getToolboxCatalog,
  getToolboxJob,
  listToolboxHomeTasks,
  listToolboxJobs,
  prepareToolboxUpload,
  saveToolboxArtifactToNote,
} from '../util/toolbox/service.js';
import {
  addToolboxWorkspaceResources,
  createToolboxWorkspace,
  createToolboxWorkspaceItem,
  createToolboxWorkspaceSession,
  getToolboxWorkspace,
  listToolboxHomeWorkspaces,
  listToolboxWorkspaces,
  markToolboxWorkspaceOpened,
  removeToolboxWorkspaceResource,
  updateToolboxWorkspace,
  updateToolboxWorkspaceItem,
} from '../util/toolbox/workspace.js';

function sendError(res, error) {
  const parsed = parseToolboxError(error);
  return res.status(parsed.status).send(resultData(parsed.data, parsed.status, parsed.message));
}

function requireWrite(req, res) {
  return ensureNotVisitor(req, res);
}

function requireRead(req, res) {
  return ensureUserOrAdminPolicy(req, res, ['read']);
}

function readUserId(req) {
  return (req.resourceUser || req.user)?.id;
}

async function recordToolboxOperation(req, operation) {
  try {
    await recordServerOperation(req, { module: '知识工坊', operation });
  } catch (error) {
    // 操作日志是审计旁路，不能把已经成功的工坊写操作反转成 500。
    console.error('[toolbox] operation log failed code=%s', stableAgentErrorCode(error));
  }
}

export function getCatalog(_req, res) {
  return res.send(resultData(getToolboxCatalog()));
}

export async function getKnowledgeOverview(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const overview = await getToolboxKnowledgeOverview({
      userId: readUserId(req),
      analysisOptions: { includeNodes: false },
    });
    return res.send(resultData(overview));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getHome(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const userId = readUserId(req);
    const [workspaces, tasks] = await Promise.all([
      listToolboxHomeWorkspaces({ userId }),
      listToolboxHomeTasks({ userId }),
    ]);
    return res.send(resultData({ schemaVersion: 2, workspaces, tasks }));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listWorkspaces(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const items = await listToolboxWorkspaces({
      userId: readUserId(req),
      kind: req.query?.kind,
      status: req.query?.status,
    });
    return res.send(resultData({ items }));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createWorkspace(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const workspace = await createToolboxWorkspace({ userId: req.user.id, input: req.body });
    await recordToolboxOperation(req, `新建持续工作区【${workspace.kind || 'unknown'}】`);
    return res.status(201).send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getWorkspace(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const workspace = await getToolboxWorkspace({
      userId: readUserId(req),
      workspaceId: req.params.workspaceId,
    });
    return res.send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function openWorkspace(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const workspace = await markToolboxWorkspaceOpened({
      userId: req.user.id,
      workspaceId: req.params.workspaceId,
    });
    return res.send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateWorkspace(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const workspace = await updateToolboxWorkspace({
      userId: req.user.id,
      workspaceId: req.params.workspaceId,
      input: req.body,
    });
    await recordToolboxOperation(req, '更新持续工作区');
    return res.send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function addWorkspaceResources(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const workspace = await addToolboxWorkspaceResources({
      userId: req.user.id,
      workspaceId: req.params.workspaceId,
      resourceRefs: req.body?.resourceRefs,
    });
    await recordToolboxOperation(req, '添加工作区资料');
    return res.send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function removeWorkspaceResource(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const workspace = await removeToolboxWorkspaceResource({
      userId: req.user.id,
      workspaceId: req.params.workspaceId,
      resource: req.body?.resource,
    });
    await recordToolboxOperation(req, '移除工作区资料');
    return res.send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createWorkspaceItem(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const workspace = await createToolboxWorkspaceItem({
      userId: req.user.id,
      workspaceId: req.params.workspaceId,
      input: req.body,
    });
    await recordToolboxOperation(req, '新建工作区事项');
    return res.status(201).send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateWorkspaceItem(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const workspace = await updateToolboxWorkspaceItem({
      userId: req.user.id,
      workspaceId: req.params.workspaceId,
      itemId: req.params.itemId,
      input: req.body,
    });
    await recordToolboxOperation(req, '更新工作区事项');
    return res.send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createWorkspaceSession(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const workspace = await createToolboxWorkspaceSession({
      userId: req.user.id,
      workspaceId: req.params.workspaceId,
      input: req.body,
    });
    await recordToolboxOperation(req, '记录工作区推进');
    return res.status(201).send(resultData(workspace));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createQuote(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const quote = await createToolboxQuote({
      userId: req.user.id,
      toolId: req.body?.toolId,
      rawInput: req.body?.input,
      billingMedium: req.body?.billingMedium,
      clientRequestId: req.body?.clientRequestId,
    });
    return res.send(resultData(quote));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function prepareUpload(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const prepared = await prepareToolboxUpload({
      userId: req.user.id,
      sessionId: req.user.sessionId || '',
      toolId: req.body?.toolId,
      fileName: req.body?.fileName,
      fileType: req.body?.fileType,
      fileSize: req.body?.fileSize,
    });
    return res.send(resultData(prepared));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createJob(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const job = await createToolboxJob({
      userId: req.user.id,
      quoteId: req.body?.quoteId,
      clientRequestId: req.body?.clientRequestId,
    });
    await recordToolboxOperation(req, `创建处理任务【${job.toolId || 'unknown'}】`);
    return res.status(202).send(resultData(job));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listJobs(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const jobs = await listToolboxJobs({ userId: readUserId(req), limit: req.query?.limit });
    return res.send(resultData({ items: jobs }));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getJob(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const job = await getToolboxJob({ userId: readUserId(req), jobId: req.params.jobId });
    return res.send(resultData(job));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function cancelJob(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const job = await cancelToolboxJob({ userId: req.user.id, jobId: req.params.jobId });
    if (job.status === 'cancelled') {
      await recordToolboxOperation(req, `取消处理任务【${job.toolId || 'unknown'}】`);
    }
    return res.send(resultData(job));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getArtifact(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const artifact = await getToolboxArtifact({ userId: readUserId(req), artifactId: req.params.artifactId });
    return res.send(resultData(artifact));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function saveArtifact(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const receipt = await saveToolboxArtifactToNote({
      userId: req.user.id,
      userRole: req.user.role,
      artifactId: req.params.artifactId,
      clientRequestId: req.body?.clientRequestId,
      action: req.body?.action,
      request: req,
    });
    if (!receipt.idempotent) {
      await recordToolboxOperation(
        req,
        req.body?.action === 'recreate_missing_target' ? '重新保存工具成果为新笔记' : '保存工具成果为笔记',
      );
    }
    return res.send(resultData(receipt));
  } catch (error) {
    return sendError(res, error);
  }
}
