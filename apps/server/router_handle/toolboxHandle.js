import { ensureNotVisitor, ensureUserOrAdminPolicy } from '../util/auth.js';
import { resultData } from '../util/common.js';
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
import {
  createToolboxProject,
  createToolboxProjectRevision,
  getToolboxProject,
  listToolboxHomeProjects,
  listToolboxProjectRevisions,
  listToolboxProjects,
  openToolboxProject,
  restoreToolboxProjectRevision,
  updateToolboxProject,
} from '../util/toolbox/project.js';

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

export function getCatalog(_req, res) {
  return res.send(resultData(getToolboxCatalog()));
}

export async function getKnowledgeOverview(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const overview = await getToolboxKnowledgeOverview({ userId: readUserId(req) });
    return res.send(resultData(overview));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getHome(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const userId = readUserId(req);
    const [workspaces, tasks, projects] = await Promise.all([
      listToolboxHomeWorkspaces({ userId }),
      listToolboxHomeTasks({ userId }),
      listToolboxHomeProjects({ userId }),
    ]);
    return res.send(resultData({ schemaVersion: 2, workspaces, tasks, projects }));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listProjects(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const page = await listToolboxProjects({
      userId: readUserId(req),
      type: req.query?.type,
      status: req.query?.status,
      limit: req.query?.limit,
      cursor: req.query?.cursor,
    });
    return res.send(resultData(page));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createProject(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const project = await createToolboxProject({ userId: req.user.id, input: req.body });
    return res.status(201).send(resultData(project));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getProject(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const project = await getToolboxProject({ userId: readUserId(req), projectId: req.params.projectId });
    return res.send(resultData(project));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateProject(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const project = await updateToolboxProject({
      userId: req.user.id,
      projectId: req.params.projectId,
      input: req.body,
    });
    return res.send(resultData(project));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function openProject(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const project = await openToolboxProject({ userId: req.user.id, projectId: req.params.projectId });
    return res.send(resultData(project));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listProjectRevisions(req, res) {
  if (!requireRead(req, res)) return;
  try {
    const page = await listToolboxProjectRevisions({
      userId: readUserId(req),
      projectId: req.params.projectId,
      limit: req.query?.limit,
      cursor: req.query?.cursor,
    });
    return res.send(resultData(page));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createProjectRevision(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const project = await createToolboxProjectRevision({
      userId: req.user.id,
      projectId: req.params.projectId,
      input: req.body,
    });
    return res.status(201).send(resultData(project));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function restoreProjectRevision(req, res) {
  if (!requireWrite(req, res)) return;
  try {
    const project = await restoreToolboxProjectRevision({
      userId: req.user.id,
      projectId: req.params.projectId,
      revisionNo: req.params.revisionNo,
      input: req.body,
    });
    return res.status(201).send(resultData(project));
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
    return res.send(resultData(receipt));
  } catch (error) {
    return sendError(res, error);
  }
}
