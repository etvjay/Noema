// Human-readable and machine-readable rendering of command output.
import type { CommandOutput } from "./exit.js";

export interface OutputOptions {
  format: "text" | "json";
}

function summarizeDetails(details: Record<string, unknown>, indent = 2): string {
  const lines: string[] = [];
  const pad = " ".repeat(indent);
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: (empty)`);
      } else if (value.every((item) => typeof item === "object" && item !== null)) {
        lines.push(`${pad}${key}:`);
        value.forEach((item, index) => {
          lines.push(`${pad}  [${index}]:`);
          lines.push(summarizeDetails(item as Record<string, unknown>, indent + 4));
        });
      } else {
        lines.push(`${pad}${key}: ${value.map(formatScalar).join(", ")}`);
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${pad}${key}:`);
      lines.push(summarizeDetails(value as Record<string, unknown>, indent + 2));
    } else {
      lines.push(`${pad}${key}: ${formatScalar(value)}`);
    }
  }
  return lines.join("\n");
}

function formatScalar(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null) return "null";
  return String(value);
}

export function renderOutput(result: CommandOutput, options: OutputOptions): string {
  if (options.format === "json") {
    return `${JSON.stringify({ code: result.code, summary: result.summary, details: result.details }, null, 2)}\n`;
  }
  const header = `${result.summary} [exit ${result.code}]`;
  const body = summarizeDetails(result.details);
  return body.length > 0 ? `${header}\n${body}\n` : `${header}\n`;
}