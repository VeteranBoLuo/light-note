import { parentPort } from 'node:worker_threads';
import { chunkResource, cleanText } from './personalKnowledgeText.js';

parentPort.on('message', (input) => {
  try {
    if (input.operation !== 'chunk' && input.operation !== 'fileText') throw new Error('Invalid operation');
    parentPort.postMessage({
      documents: input.operation === 'fileText' ? cleanText(input.content).slice(0, 4000) : chunkResource(input),
    });
  } catch {
    // Do not echo private content, raw parser errors or arbitrary object fields.
    parentPort.postMessage({ error: 'AI_PERSONAL_SEARCH_PREPROCESS_FAILED' });
  }
});
