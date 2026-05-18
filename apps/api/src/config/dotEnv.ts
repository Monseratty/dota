import fs from "node:fs";

export function loadDotEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env: Record<string, string> = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const equals = normalized.indexOf("=");
    if (equals === -1) {
      continue;
    }

    const key = normalized.slice(0, equals).trim();
    const value = unquote(normalized.slice(equals + 1).trim());
    if (!key) {
      continue;
    }

    env[key] = value;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return env;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
