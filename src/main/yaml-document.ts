/** Bound one YAML document without interpreting its mapping values. */
export function splitSingleYamlDocument(content: string): {
  prefix: string;
  body: string;
  suffix: string;
} | null {
  let bodyStart = 0;
  let bodyEnd = content.length;
  let started = false;
  let ended = false;
  let sawContent = false;
  let cursor = 0;
  while (cursor < content.length) {
    const end = content.indexOf("\n", cursor);
    const next = end < 0 ? content.length : end + 1;
    const line = content.slice(cursor, end < 0 ? next : end).replace(/\r$/, "");
    const marker = line.match(/^(---|\.\.\.)(?:[ \t]+(?:#.*)?)?$/)?.[1];
    if (marker === "---") {
      if (started || ended || sawContent) return null;
      started = true;
      bodyStart = next;
    } else if (marker === "...") {
      if (ended) return null;
      ended = true;
      bodyEnd = cursor;
    } else if (line.trim() && !line.trimStart().startsWith("#")) {
      // Directives or inline document headers need a full YAML editor. No
      // setting may be read/replaced across another document or its trailer.
      if (ended || /^(?:%|---[ \t]|\.\.\.[ \t])/.test(line)) return null;
      sawContent = true;
    }
    cursor = next;
  }
  return {
    prefix: content.slice(0, bodyStart),
    body: content.slice(bodyStart, bodyEnd),
    suffix: content.slice(bodyEnd),
  };
}
