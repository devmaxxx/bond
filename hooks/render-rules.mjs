/**
 * How shared/standing-rules.md becomes the text a session starts with, kept
 * importable so it can be unit-tested: standing-rules.mjs does the I/O, this
 * decides what the session actually reads.
 */

/**
 * The name is per-person, so it never ships in the rules file. The git identity
 * is the fallback rather than the source: it is a commit author, and a session
 * greeting someone by their commit handle is worse than one that does not greet
 * them at all — hence the empty string, which drops the greeting entirely.
 */
export function pickName(configured, gitName) {
  return (configured ?? "").trim() || (gitName ?? "").trim();
}

/**
 * `name` empty drops the Name rule rather than printing an instruction to
 * address the user as nobody.
 */
export function renderRules(file, name) {
  // The file opens with a note to whoever reads it in the repo. That is not an
  // instruction to the session, so context starts at the first rule heading.
  const firstRule = file.search(/^## /m);
  const rules = firstRule === -1 ? file : file.slice(firstRule);

  // Split on headings rather than matching "## Name up to the next ## ": that
  // form silently fails when Name is the last section, leaving {{NAME}} raw.
  const sections = rules.split(/(?=^## )/m);
  const kept = name
    ? sections
    : sections.filter((section) => !/^## Name\b/.test(section));

  return `${kept.join("").replaceAll("{{NAME}}", name).trim()}\n`;
}
