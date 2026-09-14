import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import cpp from 'highlight.js/lib/languages/cpp';
import { createCodeHighlighter } from './codeHighlight';

export const highlightCode = createCodeHighlighter({ java, go, rust, cpp });
