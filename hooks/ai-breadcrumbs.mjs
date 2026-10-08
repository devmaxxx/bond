/**
 * Shared by the commit-msg hook and the staged-docs scanner: the signatures AI
 * tools leave behind. Only signatures are matched — a tool's name in prose is
 * content, not attribution — because a signature is what changes who GitHub
 * shows as the owner of a commit, PR or document.
 */

const TOOLS =
  "(Claude|Copilot|Codex|Cursor|Gemini|ChatGPT|GPT|OpenAI|Anthropic|AI)";

export const AI_BREADCRUMBS = [
  new RegExp(
    `^\\s*[\\w-]+-(By|With):.*\\b${TOOLS}\\b`,
    "i",
  ),
  /noreply@anthropic\.com|copilot@github\.com/i,
  /^\s*Claude-Session:|claude\.ai\/code\/session_/i,
  new RegExp(`Generated (with|by) \\[?${TOOLS}\\b`, "i"),
  new RegExp(
    `(written|created|authored|drafted|made|built|produced|generated) (with|by|using) (an? )?${TOOLS}\\b( assist)?`,
    "i",
  ),
  /^\s*🤖/u,
];

/** @returns {{ line: number, text: string }[]} 1-based lines that carry a signature */
export function findAiBreadcrumbs(text) {
  return text
    .split("\n")
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter(({ text }) => AI_BREADCRUMBS.some((re) => re.test(text)));
}
