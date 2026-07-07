# CLAUDE.md — Project Rules (Tasky CRM / "new auto")

Project-specific constraints. Universal agent protocol lives in `~/.claude/CLAUDE.md` — both apply; on conflict, this file wins for this project.

---

## 1. Database Schema Rules (project law)

- ALL schema changes (ALTER TABLE, CREATE TABLE) MUST have a migration file in `SCHEMA_DB/`.
- ALL `ALTER TABLE ADD COLUMN` MUST use `IF NOT EXISTS`.
- Never modify schema inline in application code or ad-hoc SQL without a corresponding migration file.
- Read existing migrations before writing a new one — never duplicate or conflict.

## 2. Git Discipline

- Commit or push ONLY when explicitly asked.
- Never force-push, never skip hooks, never amend others' commits.
- Before deleting/overwriting ANYTHING: inspect the target first. If reality contradicts the description you were given, surface the contradiction instead of proceeding.
- Verify merge-base/history before deleting branches. Unusual branch names ≠ safe to delete.
- Known repo quirk: `master` and `nightly/*` branches share NO common ancestor. Do not delete nightly branches; do not assume they are stale copies of master.
