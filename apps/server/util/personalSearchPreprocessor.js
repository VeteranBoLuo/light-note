import { Worker } from 'node:worker_threads';
import { chunkResource, cleanText } from './personalKnowledgeText.js';

const ISOLATION_THRESHOLD = 32 * 1024;
const TIMEOUT_MS = 30_000;

function processingError(code) {
  return Object.assign(new Error('Private search text processing failed'), { code, status: 503 });
}

// One instance per admitted cold build, reused across its large resources and
// terminated at the end. It never connects to the database or reads credentials.
export function createPersonalSearchPreprocessor() {
  let worker = null;
  let pending = null;
  let closed = false;
  let failed = false;
  function finish(error, documents) {
    if (!pending) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    if (error) current.reject(error);
    else current.resolve(documents);
  }
  async function process(input, operation = 'chunk') {
    if (closed || failed) throw processingError('AI_PERSONAL_SEARCH_PREPROCESS_CLOSED');
    if (pending) throw processingError('AI_PERSONAL_SEARCH_PREPROCESS_CONCURRENT');
    if (String(input.content || '').length < ISOLATION_THRESHOLD)
      return operation === 'fileText' ? cleanText(input.content).slice(0, 4000) : chunkResource(input);
    if (!worker) {
      worker = new Worker(new URL('./personalSearchTextWorker.js', import.meta.url), {
        // Do not inherit API watch/preload/CLI entry-point flags.
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      worker.on('message', (result) => {
        if (result.error) finish(processingError(result.error));
        else finish(null, result.documents);
      });
      worker.on('error', () => {
        failed = true;
        finish(processingError('AI_PERSONAL_SEARCH_PREPROCESS_FAILED'));
      });
      worker.on('exit', () => {
        if (!closed) failed = true;
        finish(processingError('AI_PERSONAL_SEARCH_PREPROCESS_EXITED'));
      });
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        failed = true;
        finish(processingError('AI_PERSONAL_SEARCH_PREPROCESS_TIMEOUT'));
        void worker.terminate();
      }, TIMEOUT_MS);
      pending = { resolve, reject, timer };
      try {
        worker.postMessage({ ...input, operation });
      } catch {
        finish(processingError('AI_PERSONAL_SEARCH_PREPROCESS_FAILED'));
      }
    });
  }
  return {
    chunk: (input) => process(input),
    // Preserve file chunk cleaning exactly; truncate only after removing markup.
    fileText: (content) => process({ content }, 'fileText'),
    async close() {
      closed = true;
      finish(processingError('AI_PERSONAL_SEARCH_PREPROCESS_CLOSED'));
      if (worker) await worker.terminate();
    },
  };
}
