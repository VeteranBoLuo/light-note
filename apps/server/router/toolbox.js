import express from 'express';
import * as toolboxHandle from '../router_handle/toolboxHandle.js';
import { aiActionRateLimiter, localProcessingRateLimiter } from '../util/requestRateLimit.js';

const router = express.Router();

router.get('/catalog', toolboxHandle.getCatalog);
router.get('/home', localProcessingRateLimiter, toolboxHandle.getHome);
router.get('/knowledge-overview', localProcessingRateLimiter, toolboxHandle.getKnowledgeOverview);
router.get('/workspaces', localProcessingRateLimiter, toolboxHandle.listWorkspaces);
router.post('/workspaces', localProcessingRateLimiter, toolboxHandle.createWorkspace);
router.get('/workspaces/:workspaceId', localProcessingRateLimiter, toolboxHandle.getWorkspace);
router.patch('/workspaces/:workspaceId', localProcessingRateLimiter, toolboxHandle.updateWorkspace);
router.post('/workspaces/:workspaceId/open', localProcessingRateLimiter, toolboxHandle.openWorkspace);
router.post('/workspaces/:workspaceId/resources', localProcessingRateLimiter, toolboxHandle.addWorkspaceResources);
router.post(
  '/workspaces/:workspaceId/resources/remove',
  localProcessingRateLimiter,
  toolboxHandle.removeWorkspaceResource,
);
router.post('/workspaces/:workspaceId/items', localProcessingRateLimiter, toolboxHandle.createWorkspaceItem);
router.patch('/workspaces/:workspaceId/items/:itemId', localProcessingRateLimiter, toolboxHandle.updateWorkspaceItem);
router.post('/workspaces/:workspaceId/sessions', localProcessingRateLimiter, toolboxHandle.createWorkspaceSession);
router.post('/quotes', aiActionRateLimiter, toolboxHandle.createQuote);
router.post('/uploads', localProcessingRateLimiter, toolboxHandle.prepareUpload);
router.get('/tasks', toolboxHandle.listJobs);
router.get('/jobs', toolboxHandle.listJobs);
router.post('/jobs', aiActionRateLimiter, toolboxHandle.createJob);
router.get('/jobs/:jobId', toolboxHandle.getJob);
router.post('/jobs/:jobId/cancel', toolboxHandle.cancelJob);
router.get('/artifacts/:artifactId', toolboxHandle.getArtifact);
router.post('/artifacts/:artifactId/save', toolboxHandle.saveArtifact);

export default router;
