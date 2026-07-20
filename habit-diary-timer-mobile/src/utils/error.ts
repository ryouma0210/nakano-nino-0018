export function formatError(error: unknown) {
  const lines = [`発生時刻: ${new Date().toISOString()}`];
  appendError(lines, error, "ERROR");
  return lines.join("\n");
}

function appendError(lines: string[], value: unknown, label: string) {
  if (value instanceof Error) {
    lines.push(`${label}.name: ${value.name}`);
    lines.push(`${label}.message: ${value.message}`);
    if (value.stack) lines.push(`${label}.stack:\n${value.stack}`);
    if (value.cause !== undefined) appendError(lines, value.cause, `${label}.cause`);
    const extra = Object.fromEntries(Object.entries(value));
    if (Object.keys(extra).length) lines.push(`${label}.properties:\n${safeStringify(extra)}`);
    return;
  }
  lines.push(`${label}: ${safeStringify(value)}`);
}

function safeStringify(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
