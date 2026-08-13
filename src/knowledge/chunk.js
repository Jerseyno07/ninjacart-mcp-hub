// Header-aware markdown chunking — splits on `#`/`##`/`###` headers so each
// chunk is a coherent section, rather than a fixed token window that could
// cut a section in half.
export function splitMarkdown(text, sourceFile) {
  const lines = text.split('\n');
  const chunks = [];
  let currentHeading = sourceFile;
  let currentLines = [];

  function flush() {
    const content = currentLines.join('\n').trim();
    if (content) chunks.push({ heading: currentHeading, content });
    currentLines = [];
  }

  for (const line of lines) {
    const headerMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headerMatch) {
      flush();
      currentHeading = headerMatch[2].trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return chunks;
}
