/**
 * T3: shows what importing a Jira JSON export would give, without a database: the tasks the parser reads and each
 * sprint's progress, or why the whole file is refused (MSG22 for a task without a key).
 *
 *   npm run jira-preview -- <export.json> [<export.json> ...]
 */
import fs from "node:fs";
import { JiraExportError, parseJiraExport } from "../src/domain/tasks/jiraExport.js";
import { sprintProgress } from "../src/domain/tasks/tasks.js";

let refused = 0;
for (const file of process.argv.slice(2)) {
  console.log(`--- ${file}`);
  try {
    const { tasks, sprints } = parseJiraExport(fs.readFileSync(file, "utf8"));
    console.table(tasks);
    for (const s of sprints) {
      const p = sprintProgress(tasks.filter(t => t.sprint === s.id).map(t => ({ statusCategory: t.statusCategory, removed: false, storyPoints: t.storyPoints })));
      console.log(`${s.name} (${s.state ?? "no state"}): ${p.done}/${p.total} done, ${p.percent === null ? "n/a" : `${p.percent} %`}`);
    }
    const backlog = tasks.filter(t => !t.sprint).length;
    if (backlog) console.log(`Backlog: ${backlog} task${backlog === 1 ? "" : "s"}`);
  } catch (error) {
    if (!(error instanceof JiraExportError)) throw error;
    refused++;
    console.log(`REFUSED [${error.messageId ?? "invalid"}] ${error.message}`);
  }
}
if (!process.argv.slice(2).length) console.log("Usage: npm run jira-preview -- <export.json> [...]");
process.exitCode = refused ? 2 : 0;
