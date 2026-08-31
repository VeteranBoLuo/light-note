import { describe, expect, it, vi } from 'vitest';
import {
  TOOLBOX_PROJECT_REVISION_RETENTION_POLICY,
  createToolboxProject,
  createToolboxProjectRevision,
  getToolboxProject,
  listToolboxProjectRevisions,
  listToolboxProjects,
  restoreToolboxProjectRevision,
  updateToolboxProject,
} from './project.js';

function documentContent(value) {
  return {
    type: 'document',
    schemaVersion: 1,
    body: { format: 'markdown', value },
    page: { size: 'auto', orientation: 'portrait' },
  };
}

function createDatabase() {
  const state = { projects: [], revisions: [], resources: [], revisionRequests: [] };
  const connection = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
    query: vi.fn(async (rawSql, params = []) => {
      const sql = String(rawSql).replace(/\s+/gu, ' ').trim();
      if (sql === 'SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[{ id: params[0] }]];
      }
      if (sql.startsWith('SELECT COALESCE(SUM(content_bytes), 0) AS account_bytes')) {
        const [projectId, userId] = params;
        const owned = state.revisions.filter((row) => row.user_id === userId);
        return [
          [
            {
              account_bytes: owned.reduce((sum, row) => sum + Number(row.content_bytes || 0), 0),
              project_bytes: owned
                .filter((row) => row.project_id === projectId)
                .reduce((sum, row) => sum + Number(row.content_bytes || 0), 0),
            },
          ],
        ];
      }
      if (sql.startsWith('SELECT * FROM toolbox_projects WHERE user_id = ? AND create_request_id = ?')) {
        return [
          state.projects
            .filter((row) => row.user_id === params[0] && row.create_request_id === params[1])
            .map((row) => ({ ...row })),
        ];
      }
      if (sql.startsWith('SELECT * FROM toolbox_projects WHERE id = ? AND user_id = ?')) {
        return [
          state.projects.filter((row) => row.id === params[0] && row.user_id === params[1]).map((row) => ({ ...row })),
        ];
      }
      if (sql.includes('FROM toolbox_project_revision_requests')) {
        return [
          state.revisionRequests
            .filter((row) => row.user_id === params[0] && row.client_request_id === params[1])
            .map((row) => ({ ...row })),
        ];
      }
      if (sql.includes('FROM toolbox_project_revisions WHERE user_id = ? AND client_request_id = ?')) {
        return [
          state.revisions
            .filter((row) => row.user_id === params[0] && row.client_request_id === params[1])
            .map((row) => ({ ...row })),
        ];
      }
      if (sql.includes('FROM toolbox_project_revisions WHERE id = ? AND project_id = ? AND user_id = ?')) {
        return [
          state.revisions
            .filter((row) => row.id === params[0] && row.project_id === params[1] && row.user_id === params[2])
            .map((row) => ({ ...row })),
        ];
      }
      if (sql.includes('FROM toolbox_project_revisions WHERE project_id = ? AND user_id = ? AND revision_no = ?')) {
        return [
          state.revisions
            .filter((row) => row.project_id === params[0] && row.user_id === params[1] && row.revision_no === params[2])
            .map((row) => ({ ...row })),
        ];
      }
      if (sql.startsWith('SELECT * FROM toolbox_project_resources')) {
        return [state.resources.filter((row) => row.project_id === params[0] && row.user_id === params[1])];
      }
      if (sql.startsWith('INSERT INTO toolbox_projects')) {
        const [
          id,
          userId,
          projectType,
          title,
          metadataJson,
          currentRevisionId,
          requestId,
          createDigest,
          createdAt,
          updatedAt,
        ] = params;
        state.projects.push({
          id,
          user_id: userId,
          project_type: projectType,
          title,
          metadata_json: metadataJson,
          status: 'active',
          version: 1,
          current_revision: 1,
          current_revision_id: currentRevisionId,
          create_request_id: requestId,
          create_digest: createDigest,
          last_opened_at: null,
          trashed_at: null,
          create_time: createdAt,
          updated_at: updatedAt,
        });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO toolbox_project_revisions')) {
        if (sql.includes('VALUES (?, ?, ?, 1,')) {
          const [
            id,
            projectId,
            userId,
            schemaVersion,
            contentJson,
            contentBytes,
            contentHash,
            changeKind,
            requestId,
            requestDigest,
            createTime,
          ] = params;
          state.revisions.push({
            id,
            project_id: projectId,
            user_id: userId,
            revision_no: 1,
            parent_revision_id: null,
            restored_from_revision_id: null,
            schema_version: schemaVersion,
            content_json: contentJson,
            content_bytes: contentBytes,
            content_hash: contentHash,
            change_kind: changeKind,
            label: null,
            client_request_id: requestId,
            request_digest: requestDigest,
            create_time: createTime,
          });
        } else if (sql.includes("'restore'")) {
          const [
            id,
            projectId,
            userId,
            revisionNo,
            parentId,
            sourceId,
            schemaVersion,
            contentJson,
            contentBytes,
            contentHash,
            requestId,
            requestDigest,
            createTime,
          ] = params;
          state.revisions.push({
            id,
            project_id: projectId,
            user_id: userId,
            revision_no: revisionNo,
            parent_revision_id: parentId,
            restored_from_revision_id: sourceId,
            schema_version: schemaVersion,
            content_json: contentJson,
            content_bytes: contentBytes,
            content_hash: contentHash,
            change_kind: 'restore',
            label: null,
            client_request_id: requestId,
            request_digest: requestDigest,
            create_time: createTime,
          });
        } else {
          const [
            id,
            projectId,
            userId,
            revisionNo,
            parentId,
            schemaVersion,
            contentJson,
            contentBytes,
            contentHash,
            changeKind,
            label,
            requestId,
            requestDigest,
            createTime,
          ] = params;
          state.revisions.push({
            id,
            project_id: projectId,
            user_id: userId,
            revision_no: revisionNo,
            parent_revision_id: parentId,
            restored_from_revision_id: null,
            schema_version: schemaVersion,
            content_json: contentJson,
            content_bytes: contentBytes,
            content_hash: contentHash,
            change_kind: changeKind,
            label,
            client_request_id: requestId,
            request_digest: requestDigest,
            create_time: createTime,
          });
        }
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO toolbox_project_revision_requests')) {
        const [
          id,
          userId,
          projectId,
          requestId,
          requestDigest,
          resultRevisionId,
          resultRevisionNo,
          outcome,
          createTime,
        ] = params;
        state.revisionRequests.push({
          id,
          user_id: userId,
          project_id: projectId,
          client_request_id: requestId,
          request_digest: requestDigest,
          result_revision_id: resultRevisionId,
          result_revision_no: resultRevisionNo,
          outcome,
          create_time: createTime,
        });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE toolbox_projects SET current_revision')) {
        const project = state.projects.find((row) => row.id === params.at(-2) && row.user_id === params.at(-1));
        project.current_revision = params[0];
        project.current_revision_id = params[1];
        project.version += 1;
        project.updated_at = sql.includes('updated_at = ?') ? params[2] : new Date();
        return [{ affectedRows: 1 }];
      }
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    }),
  };
  return { state, connection, database: { getConnection: vi.fn(async () => connection), query: connection.query } };
}

async function createProject(database, suffix = 'base') {
  return createToolboxProject({
    userId: 'user-1',
    database,
    input: {
      clientRequestId: `create-request-${suffix}`,
      projectType: 'document',
      title: '生产文档',
      content: documentContent('v1'),
    },
  });
}

describe('生产项目事务与并发协议', () => {
  it('项目与修订列表使用稳定 keyset 游标持续读取，不把命名版本截在首屏', async () => {
    const projectRows = [
      {
        id: 'project-3',
        user_id: 'user-1',
        project_type: 'document',
        title: '三',
        status: 'active',
        version: 1,
        current_revision: 1,
        current_revision_id: 'revision-3',
        updated_at: new Date('2026-08-30T03:00:00.000Z'),
      },
      {
        id: 'project-2',
        user_id: 'user-1',
        project_type: 'document',
        title: '二',
        status: 'active',
        version: 1,
        current_revision: 1,
        current_revision_id: 'revision-2',
        updated_at: new Date('2026-08-30T02:00:00.000Z'),
      },
      {
        id: 'project-1',
        user_id: 'user-1',
        project_type: 'document',
        title: '一',
        status: 'active',
        version: 1,
        current_revision: 1,
        current_revision_id: 'revision-1',
        updated_at: new Date('2026-08-30T01:00:00.000Z'),
      },
    ];
    const projectDatabase = {
      query: vi
        .fn()
        .mockResolvedValueOnce([projectRows])
        .mockResolvedValueOnce([[projectRows[2]]]),
    };
    const firstProjects = await listToolboxProjects({
      userId: 'user-1',
      type: 'document',
      limit: 2,
      database: projectDatabase,
    });
    const nextProjects = await listToolboxProjects({
      userId: 'user-1',
      type: 'document',
      limit: 2,
      cursor: firstProjects.nextCursor,
      database: projectDatabase,
    });
    expect(firstProjects.items.map((item) => item.id)).toEqual(['project-3', 'project-2']);
    expect(firstProjects.nextCursor).toEqual(expect.any(String));
    expect(nextProjects.items.map((item) => item.id)).toEqual(['project-1']);
    expect(nextProjects.nextCursor).toBeNull();
    expect(projectDatabase.query.mock.calls[0][0]).toContain('ORDER BY updated_at DESC, id DESC');
    expect(projectDatabase.query.mock.calls[1][0]).toContain('updated_at < ?');

    const baseProject = projectRows[0];
    const revisionRows = [
      {
        id: 'revision-5',
        revision_no: 5,
        change_kind: 'autosave',
        label: null,
        content_hash: 'hash-5',
        create_time: new Date('2026-08-30T05:00:00.000Z'),
      },
      {
        id: 'revision-4',
        revision_no: 4,
        change_kind: 'autosave',
        label: null,
        content_hash: 'hash-4',
        create_time: new Date('2026-08-30T04:00:00.000Z'),
      },
      {
        id: 'revision-3',
        revision_no: 3,
        change_kind: 'named',
        label: '必须可达的命名版本',
        content_hash: 'hash-3',
        create_time: new Date('2026-08-30T03:00:00.000Z'),
      },
    ];
    const revisionDatabase = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[baseProject]])
        .mockResolvedValueOnce([revisionRows])
        .mockResolvedValueOnce([[baseProject]])
        .mockResolvedValueOnce([[revisionRows[2]]]),
    };
    const firstRevisions = await listToolboxProjectRevisions({
      userId: 'user-1',
      projectId: baseProject.id,
      limit: 2,
      database: revisionDatabase,
    });
    const nextRevisions = await listToolboxProjectRevisions({
      userId: 'user-1',
      projectId: baseProject.id,
      limit: 2,
      cursor: firstRevisions.nextCursor,
      database: revisionDatabase,
    });
    expect(firstRevisions.items.map((item) => item.revision)).toEqual([5, 4]);
    expect(nextRevisions.items[0]).toMatchObject({ revision: 3, label: '必须可达的命名版本' });
    expect(revisionDatabase.query.mock.calls[3][0]).toContain('revision_no < ?');
  });

  it('拒绝伪造或损坏的项目分页游标', async () => {
    await expect(
      listToolboxProjects({ userId: 'user-1', type: 'document', cursor: 'not-a-cursor', database: { query: vi.fn() } }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_PROJECT_CURSOR_INVALID', status: 400 });
  });

  it('创建请求可安全重放且只产生一个项目和一个初始修订', async () => {
    const { database, state } = createDatabase();
    const first = await createProject(database);
    const replay = await createProject(database);

    expect(state.projects).toHaveLength(1);
    expect(state.revisions).toHaveLength(1);
    expect(replay.project.id).toBe(first.project.id);
    expect(replay.project.currentRevision).toBe(replay.revision.revision);
  });

  it('只对严格 CAS 后的同内容自动保存做 no-op，命名版本仍保留不可变修订', async () => {
    const { database, state } = createDatabase();
    const created = await createProject(database, 'same-content');
    const projectId = created.project.id;

    await expect(
      createToolboxProjectRevision({
        userId: 'user-1',
        projectId,
        database,
        input: {
          clientRequestId: 'same-content-stale-cas',
          expectedVersion: 2,
          expectedRevision: 1,
          changeKind: 'autosave',
          content: documentContent('v1'),
        },
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_PROJECT_VERSION_CONFLICT', status: 409 });

    const deduplicated = await createToolboxProjectRevision({
      userId: 'user-1',
      projectId,
      database,
      input: {
        clientRequestId: 'same-content-autosave',
        expectedVersion: 1,
        expectedRevision: 1,
        changeKind: 'autosave',
        content: documentContent('v1'),
      },
    });
    expect(state.revisions).toHaveLength(1);
    expect(deduplicated.project).toMatchObject({ version: 1, currentRevision: 1 });
    expect(state.revisionRequests).toHaveLength(1);
    expect(state.revisionRequests[0]).toMatchObject({
      client_request_id: 'same-content-autosave',
      result_revision_no: 1,
      outcome: 'noop',
    });

    const immediateReplay = await createToolboxProjectRevision({
      userId: 'user-1',
      projectId,
      database,
      input: {
        clientRequestId: 'same-content-autosave',
        expectedVersion: 1,
        expectedRevision: 1,
        changeKind: 'autosave',
        content: documentContent('v1'),
      },
    });
    expect(immediateReplay.project).toMatchObject({ version: 1, currentRevision: 1 });
    expect(immediateReplay.revision).toMatchObject({ id: state.revisions[0].id, revision: 1 });
    expect(state.revisions).toHaveLength(1);
    expect(state.revisionRequests).toHaveLength(1);

    const named = await createToolboxProjectRevision({
      userId: 'user-1',
      projectId,
      database,
      input: {
        clientRequestId: 'same-content-named',
        expectedVersion: 1,
        expectedRevision: 1,
        changeKind: 'named',
        label: '相同正文也必须保留',
        content: documentContent('v1'),
      },
    });
    expect(state.revisions).toHaveLength(2);
    expect(named.project).toMatchObject({ version: 2, currentRevision: 2 });
    expect(state.revisions[1].label).toBe('相同正文也必须保留');
    expect(state.revisionRequests).toHaveLength(2);

    await expect(
      createToolboxProjectRevision({
        userId: 'user-1',
        projectId,
        database,
        input: {
          clientRequestId: 'same-content-autosave',
          expectedVersion: 1,
          expectedRevision: 1,
          changeKind: 'autosave',
          content: documentContent('v1'),
        },
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_PROJECT_REVISION_CONFLICT', status: 409 });
    expect(state.revisions).toHaveLength(2);
    expect(state.revisionRequests).toHaveLength(2);

    await expect(
      createToolboxProjectRevision({
        userId: 'user-1',
        projectId,
        database,
        input: {
          clientRequestId: 'same-content-autosave',
          expectedVersion: 2,
          expectedRevision: 2,
          changeKind: 'autosave',
          content: documentContent('different-content'),
        },
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_PROJECT_IDEMPOTENCY_KEY_REUSED', status: 409 });
  });

  it('按账户与项目累计快照字节硬拒绝新修订，且保留策略不静默删除历史', async () => {
    expect(TOOLBOX_PROJECT_REVISION_RETENTION_POLICY).toEqual({
      mode: 'immutable-quota-bound',
      automaticDeletion: false,
      deletionBoundary: 'account-deletion',
    });

    const accountDatabase = createDatabase();
    await expect(
      createToolboxProject({
        userId: 'user-1',
        database: accountDatabase.database,
        storageLimits: { projectBytes: 10_000, accountBytes: 1 },
        input: {
          clientRequestId: 'quota-create-request',
          projectType: 'document',
          title: '配额测试',
          content: documentContent('v1'),
        },
      }),
    ).rejects.toMatchObject({
      code: 'TOOLBOX_PROJECT_STORAGE_QUOTA_EXCEEDED',
      status: 413,
      data: { scope: 'account', retentionPolicy: 'immutable-quota-bound' },
    });
    expect(accountDatabase.state.projects).toHaveLength(0);
    expect(accountDatabase.state.revisions).toHaveLength(0);

    const projectDatabase = createDatabase();
    const created = await createProject(projectDatabase.database, 'quota-revision');
    const initialBytes = projectDatabase.state.revisions[0].content_bytes;
    await expect(
      createToolboxProjectRevision({
        userId: 'user-1',
        projectId: created.project.id,
        database: projectDatabase.database,
        storageLimits: { projectBytes: initialBytes, accountBytes: 10_000 },
        input: {
          clientRequestId: 'quota-revision-request',
          expectedVersion: 1,
          expectedRevision: 1,
          changeKind: 'autosave',
          content: documentContent('v2'),
        },
      }),
    ).rejects.toMatchObject({
      code: 'TOOLBOX_PROJECT_STORAGE_QUOTA_EXCEEDED',
      status: 413,
      data: { scope: 'project' },
    });
    expect(projectDatabase.state.revisions).toHaveLength(1);
    expect(projectDatabase.state.projects[0]).toMatchObject({ version: 1, current_revision: 1 });
  });

  it('后续修订存在时重放旧请求明确返回冲突，且不移动当前 head', async () => {
    const { database, state } = createDatabase();
    const created = await createProject(database, 'replay');
    const projectId = created.project.id;
    const request = {
      clientRequestId: 'revision-request-0001',
      expectedVersion: 1,
      expectedRevision: 1,
      changeKind: 'autosave',
      content: documentContent('v2'),
    };
    await createToolboxProjectRevision({ userId: 'user-1', projectId, input: request, database });
    await createToolboxProjectRevision({
      userId: 'user-1',
      projectId,
      database,
      input: {
        clientRequestId: 'revision-request-0002',
        expectedVersion: 2,
        expectedRevision: 2,
        changeKind: 'named',
        label: '第三版',
        content: documentContent('v3'),
      },
    });
    await expect(
      createToolboxProjectRevision({ userId: 'user-1', projectId, input: request, database }),
    ).rejects.toMatchObject({
      code: 'PRODUCTION_PROJECT_REVISION_CONFLICT',
      status: 409,
      data: { currentRevision: 3, currentVersion: 3 },
    });

    expect(state.revisions).toHaveLength(3);
    expect(state.projects[0]).toMatchObject({ version: 3, current_revision: 3 });
  });

  it('分别识别项目版本冲突和正文头冲突，不写入新修订', async () => {
    const { database, state } = createDatabase();
    const created = await createProject(database, 'conflict');
    const common = { userId: 'user-1', projectId: created.project.id, database };

    await expect(
      createToolboxProjectRevision({
        ...common,
        input: {
          clientRequestId: 'revision-conflict-v',
          expectedVersion: 2,
          expectedRevision: 1,
          changeKind: 'autosave',
          content: documentContent('x'),
        },
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_PROJECT_VERSION_CONFLICT', status: 409 });
    await expect(
      createToolboxProjectRevision({
        ...common,
        input: {
          clientRequestId: 'revision-conflict-r',
          expectedVersion: 1,
          expectedRevision: 2,
          changeKind: 'autosave',
          content: documentContent('x'),
        },
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_PROJECT_REVISION_CONFLICT', status: 409 });
    expect(state.revisions).toHaveLength(1);
    await expect(
      updateToolboxProject({
        ...common,
        input: { expectedVersion: 2, title: '过期更新' },
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_PROJECT_VERSION_CONFLICT', status: 409 });
  });

  it('所有权条件阻止其他用户读取项目', async () => {
    const { database } = createDatabase();
    const created = await createProject(database, 'owner');
    await expect(
      getToolboxProject({ userId: 'other-user', projectId: created.project.id, database }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_PROJECT_NOT_FOUND', status: 404 });
  });

  it('恢复旧版会新增不可变修订并保留来源和项目资料', async () => {
    const { database, state } = createDatabase();
    const created = await createProject(database, 'restore');
    const projectId = created.project.id;
    state.resources.push({
      id: 1,
      project_id: projectId,
      user_id: 'user-1',
      resource_type: 'note',
      resource_id: 'note-1',
      resource_version: 'v1',
      resource_title: '来源笔记',
      role: 'source',
      create_time: new Date(),
    });
    await createToolboxProjectRevision({
      userId: 'user-1',
      projectId,
      database,
      input: {
        clientRequestId: 'revision-before-restore',
        expectedVersion: 1,
        expectedRevision: 1,
        changeKind: 'autosave',
        content: documentContent('v2'),
      },
    });
    const restored = await restoreToolboxProjectRevision({
      userId: 'user-1',
      projectId,
      revisionNo: 1,
      database,
      input: {
        clientRequestId: 'restore-request-0001',
        expectedVersion: 2,
        expectedRevision: 2,
        sourceRevisionId: state.revisions[0].id,
      },
    });

    expect(state.revisions.map((row) => row.revision_no)).toEqual([1, 2, 3]);
    expect(restored.revision.changeKind).toBe('restore');
    expect(restored.revision.sourceRevisionId).toBe(state.revisions[0].id);
    expect(restored.revision.content.body.value).toBe('v1');
    expect(restored.resources).toHaveLength(1);
    await expect(
      restoreToolboxProjectRevision({
        userId: 'user-1',
        projectId,
        revisionNo: 1,
        database,
        input: {
          clientRequestId: 'restore-request-0002',
          expectedVersion: 3,
          expectedRevision: 3,
          sourceRevisionId: 'wrong-id',
        },
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_PROJECT_FIELD_INVALID', status: 400 });
  });

  it('恢复修订同样计入项目字节配额，拒绝时不移动当前 head', async () => {
    const { database, state } = createDatabase();
    const created = await createProject(database, 'restore-quota');
    await createToolboxProjectRevision({
      userId: 'user-1',
      projectId: created.project.id,
      database,
      input: {
        clientRequestId: 'restore-quota-second-revision',
        expectedVersion: 1,
        expectedRevision: 1,
        changeKind: 'autosave',
        content: documentContent('v2'),
      },
    });
    const usedBytes = state.revisions.reduce((sum, revision) => sum + revision.content_bytes, 0);

    await expect(
      restoreToolboxProjectRevision({
        userId: 'user-1',
        projectId: created.project.id,
        revisionNo: 1,
        database,
        storageLimits: { projectBytes: usedBytes, accountBytes: usedBytes * 10 },
        input: {
          clientRequestId: 'restore-quota-request',
          expectedVersion: 2,
          expectedRevision: 2,
          sourceRevisionId: state.revisions[0].id,
        },
      }),
    ).rejects.toMatchObject({
      code: 'TOOLBOX_PROJECT_STORAGE_QUOTA_EXCEEDED',
      data: { scope: 'project' },
    });
    expect(state.revisions).toHaveLength(2);
    expect(state.projects[0]).toMatchObject({ version: 2, current_revision: 2 });
  });

  it('恢复请求严格要求共享协议声明的 sourceRevisionId', async () => {
    const { database } = createDatabase();
    const created = await createProject(database, 'restore-contract');

    await expect(
      restoreToolboxProjectRevision({
        userId: 'user-1',
        projectId: created.project.id,
        revisionNo: 1,
        database,
        input: {
          clientRequestId: 'restore-contract-request',
          expectedVersion: 1,
          expectedRevision: 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_PROJECT_IDENTIFIER_INVALID', status: 400 });
  });
});
