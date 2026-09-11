import crypto from 'node:crypto';
import { prepareFreeOcrInputs } from './freeOcr.js';
import { getObjectBufferFromObs } from '../obsClient.js';
import { parseDocumentBuffer } from '../aiDocument/parser.js';
import { recognizePdfWithLocalOcr } from '../aiDocument/localOcr.js';
import { deepseekVisionProvider } from '../imageRecognition/deepseekVisionProvider.js';
import { runAiExecution } from '../aiExecution/service.js';
import { toolboxError } from './errors.js';

// Read original bytes under the owner boundary, never the free OCR cache or its garbled text.
export async function executeAiOcr(job, inputs, identity, database, dependencies = {}) {
  const prepare = dependencies.prepare || prepareFreeOcrInputs;
  const read = dependencies.read || getObjectBufferFromObs;
  const parse = dependencies.parse || parseDocumentBuffer;
  const vision = dependencies.vision || deepseekVisionProvider;
  const render = dependencies.render || recognizePdfWithLocalOcr;
  const execute = dependencies.execute || runAiExecution;
  const files = await prepare(database, job.user_id, inputs);
  const pageCount = files.reduce((sum, file) => sum + file.pages, 0);
  let modelCalled = false;
  return execute(
    {
      requestId: dependencies.requestId || job.id,
      taskType: 'skill_toolbox_ocr_to_text',
      surface: 'toolbox',
      identity: identity.user,
      subjectIdentity: identity.user,
      request: {
        user: identity.user,
        securityRestrictions: identity.restrictions,
        headers: {},
        body: {},
        ip: 'toolbox-worker',
      },
      billingPolicy: job.billing_medium === 'points' ? 'system' : 'user',
      ...(job.billing_medium === 'points' ? { systemId: 'toolbox_points' } : {}),
      reservationTokens: 12000 * pageCount,
      providerPlan: { image_recognition: { billingScope: 'user', maxCalls: pageCount } },
      resolveResultOutcome: (result) => ({ status: result.outcome === 'partial_succeeded' ? 'partial' : 'success' }),
    },
    async () => {
      const outputs = [];
      for (const { descriptor: source, hash } of files) {
        const buffer = await read(source.object_key);
        if (crypto.createHash('sha256').update(buffer).digest('hex') !== hash)
          throw toolboxError('TOOLBOX_RESOURCE_STALE', '文件已变化，请重新选择', 409);
        let recognitionError;
        let uncertain = false;
        const recognizeImage = async (data, options) => {
          if (recognitionError) throw recognitionError;
          try {
            const result = await vision.recognizeImage(data, {
              ...options,
              maxTokens: 4096,
              beforeRequest: async () => {
                await dependencies.beforeRequest?.();
                modelCalled = true;
              },
            });
            uncertain ||= Boolean(result.metadata?.uncertainSegments?.length);
            return result;
          } catch (error) {
            // The generic PDF parser collects page errors. Preserve quota/provider failures at the root.
            recognitionError = error;
            throw error;
          }
        };
        let result;
        try {
          result = await parse(
            buffer,
            {
              fileName: source.file_name,
              fileType: source.file_type,
              fileSize: buffer.length,
            },
            {
              imageProvider: { recognizeImage },
              ocrProvider: {
                recognizePdf: (data, options) =>
                  render(data, {
                    ...options,
                    recognizePage: async (page, pageOptions) => (await recognizeImage(page, pageOptions)).content,
                  }),
              },
            },
          );
        } catch (error) {
          throw recognitionError || error;
        }
        if (recognitionError) throw recognitionError;
        outputs.push({ source, result, uncertain });
      }
      const readable = outputs.filter(({ result }) => String(result.text || '').trim());
      if (!readable.length) throw toolboxError('TOOLBOX_OCR_EMPTY', '未识别到可读文字，请换用清晰文件');
      const partial =
        readable.length !== outputs.length ||
        outputs.some(({ result, uncertain }) => uncertain || result.coverage?.complete === false);
      return {
        type: 'ocr_text',
        title: '文字识别结果',
        contentType: 'markdown',
        content: readable
          .map(
            ({ source, result, uncertain }) =>
              `# ${String(source.file_name).replace(/[\r\n#]/g, ' ')}\n\n${result.text}${uncertain ? '\n\n> 部分文字无法确认，请对照原文件核对。' : ''}`,
          )
          .join('\n\n---\n\n'),
        sources: outputs.map(({ source, result }) => ({
          id: source.id,
          type: source.kind === 'file' ? 'file' : 'document',
          title: source.file_name,
          coverage: result.coverage,
        })),
        coverage: { complete: !partial, warnings: partial ? ['ocr_partial'] : [] },
        meta: { sourceCount: outputs.length, recognitionMode: 'ai', modelCalled },
        outcome: partial ? 'partial_succeeded' : 'succeeded',
      };
    },
  );
}
