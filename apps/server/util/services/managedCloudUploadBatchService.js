import { abortManagedCloudUpload, confirmManagedCloudUpload, prepareManagedCloudUpload } from './managedCloudUploadService.js';

/** 仅合并传输；权限、事务、配额与幂等仍由单文件领域服务执行。 */
export async function processManagedUploadBatch(request) {
  const items = request.body?.items;
  const operations = { prepareManagedUpload: prepareManagedCloudUpload, confirmManagedUpload: confirmManagedCloudUpload, abortManagedUpload: abortManagedCloudUpload };
  if (!Array.isArray(items) || !items.length || items.length > 3 || items.some((item) =>
    !item || !Object.hasOwn(operations, item.operation) || !item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload),
  )) return { status: 400, msg: '上传批次无效，最多同时处理 3 项', data: null };

  const data = await Promise.all(items.map(async ({ operation, payload }) => {
    try {
      // 显式投影，不能让批次载荷覆盖认证上下文或传入服务内部参数。
      const result = await operations[operation]({
        userId: request.user?.id,
        userRole: request.user?.role,
        request,
        fileName: payload.fileName,
        fileType: payload.fileType,
        fileSize: payload.fileSize,
        objectKey: payload.objectKey,
        folderId: payload.folderId,
        addToInbox: payload.addToInbox === true,
        inboxSource: payload.inboxSource || 'quick_capture',
      });
      return { status: 200, data: result, msg: '' };
    } catch {
      // 每项独立失败；不把数据库、对象存储或其他内部异常原文返回客户端。
      return { status: 400, data: null, msg: '文件处理失败，请重试' };
    }
  }));
  return { status: 200, data, msg: '' };
}
