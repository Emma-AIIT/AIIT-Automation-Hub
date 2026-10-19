<!-- duo:start (Duo keeps this section up to date; put your own notes outside it) -->
## Duo

This project is shared through Duo: another person's Claude is working in the
same repository at the same time. Follow these rules every turn.

- Trust the `[Duo]` note at the top of a prompt. Re-read any file it lists before editing that file.
- If an edit is denied because the other Claude holds the file, do the rest of the task first, then end your turn and say what you are waiting for: Duo types into this terminal the moment the file is yours. Never sleep, poll or set a timer for it, and never work around the block with shell redirects or a copy of the file.
- Work on your own branch (`<your-name>/work`). Rebase on `origin/main` before starting.
- When a task is done and checks pass, merge into `main` with `--no-ff`. Before pushing, run the project's full checks (tests, typecheck, build) on the merged `main`; push only when they pass, and fix it first when they don't. Merge small and often.
- Resolve conflicts by keeping both sides' intent, not by picking a side.
- Stop dev servers and watchers you started in the background once you are done with them; Duo stops what is left when the terminal closes.
- If you need an extra working copy, create it under `~/.duo/copies/<project>-<topic>` (never next to the project or on the Desktop), and remove it with `git worktree remove` when you are done.
- End every turn with a 1 to 3 sentence plain summary of what changed. The other Claude reads exactly that summary, so name files, renamed functions and new APIs.
<!-- duo:end -->
