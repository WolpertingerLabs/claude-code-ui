---
name: git-save-reboot
description: Run the full build, lint, format, commit, push, and redeploy pipeline. Stop immediately if any step fails.
---

## Steps

1. **Build** the project:

   ```
   npm run build
   ```

   Stop and fix any build errors before continuing.

2. **Lint** all files:

   ```
   npm run lint:all:fix
   ```

   Stop and fix any lint errors that could not be auto-fixed.

3. **Prettier** — format only touched (uncommitted) files:

   ```
   npm run prettier
   ```

4. **Git commit** — stage all changes (including any formatting/lint fixes from above) and commit with a descriptive message summarizing what changed:

   ```
   git add -A
   git commit -m "<descriptive message>"
   ```

5. **Git push**:

   ```
   git push
   ```

6. **Redeploy production** (run detached so it survives if the server process dies mid-redeploy):
   ```
   nohup npm run redeploy:prod > /tmp/claude-code-ui-redeploy.log 2>&1 &
   ```
   Wait 3 seconds, then confirm PM2 restarted:
   ```
   sleep 3 && pm2 list && echo "--- Redeploy log ---" && cat /tmp/claude-code-ui-redeploy.log
   ```

## Important

- If any step fails, **stop immediately**, diagnose the issue, fix it, and restart from the failed step.
- The commit message should accurately describe the changes — do NOT use a generic message like "save and reboot".
- After the final step, confirm that the PM2 process is running with `pm2 list`.
