# marketo-bulk-actions

Activate or deactivate many Marketo smart campaigns in one command, on one Marketo instance at a time.

```bash
pnpm campaigns:activate --instance=sec --list=q4-webinars
```

## Setup

Requires Node 22+ and pnpm.

```bash
pnpm install
```

### Add an instance

Each Marketo instance gets a folder under `instances/`, named after the instance. The name is what you pass to `--instance`.

```bash
cp -R instances/example instances/sec
mv instances/sec/.env.example instances/sec/.env
```

Fill in `instances/sec/.env`:

| Variable | Where to find it |
| --- | --- |
| `MARKETO_MUNCHKIN_ID` | Admin > Integration > Munchkin, e.g. `123-ABC-456` |
| `MARKETO_CLIENT_ID` | Admin > Integration > LaunchPoint > your API service > View Details |
| `MARKETO_CLIENT_SECRET` | Same place as the client ID |

`.env.local` in the same folder overrides `.env`. `config.json` stays `{}`, since no settings exist yet.

Every instance folder except `instances/example/` is gitignored, including its lists and run records.

## Commands

```bash
pnpm campaigns:activate --instance=<name> [references] [options]
pnpm campaigns:deactivate --instance=<name> [references] [options]
```

| Flag | Meaning |
| --- | --- |
| `--instance=<name>` | Required. Uses `instances/<name>/`. |
| `--list=<list>` | Reads references from `instances/<name>/lists/<list>.csv`. |
| `--campaign=<reference>` | One reference. Repeat for more. Combines with `--list`. |
| `--workspace=<name or id>` | Only match campaign names inside this Marketo workspace. |
| `--dry-run` | Show the plan and stop. Nothing changes. |
| `--yes` | Skip the confirmation prompt. |

## Campaign references

A reference names one smart campaign in one of three ways:

- **ID**, like `1692`. Anything made only of digits is an ID.
- **Name**, like `01 - Send Invite`. Works when exactly one campaign has that name.
- **Program and name**, like `Webinar 2026.10 Q4.01 - Send Invite`. The program name, a dot, the campaign name. Dots inside the program name are fine. For campaigns outside a program, use the parent folder name instead of the program.

Matching is exact and case-sensitive. A reference that matches no campaign, or more than one, fails that campaign only. For an ambiguous name, the error lists the `Program.Campaign` candidates to copy into your list.

## Lists

A list is a CSV file in the instance's `lists/` folder. Every non-empty cell is one reference, so you can paste a column, one per line, or a comma-separated row. Wrap names containing commas in double quotes. Lines starting with `#` are comments.

```csv
# Q4 webinar invites
1692
Webinar 2026.10 Q4.01 - Send Invite
"Newsletter, October.Send", 1701
```

## What a run does

1. Resolves every reference and reads each campaign from Marketo.
2. Prints the plan: campaigns it will change, campaigns it skips because they are already in the target state, and failures such as unknown, ambiguous or batch campaigns.
3. Asks for confirmation, unless `--yes`. `--dry-run` stops here.
4. Activates or deactivates each campaign. A Marketo error fails that campaign and the run continues.
5. Prints one line per campaign and the counts:

```
done     1692 01 - Send Invite
skipped  1701 02 - Reminder (already active)
failed   Newsletter, October.Send (not found)
1 done · 1 skipped · 1 failed
```

6. Saves a JSON record of the run to `instances/<name>/runs/`.

| Exit code | Meaning |
| --- | --- |
| `0` | Every campaign was done or skipped. |
| `1` | At least one campaign failed, or the daily API quota ran out. |
| `2` | Configuration error, such as an unknown instance, rejected credentials, a missing list or no references. |

Only trigger campaigns can be activated or deactivated. Batch campaigns are scheduled in Marketo and fail with a clear reason.

The tool keeps within Marketo's API limits: it reuses one access token per run and gets a new one when Marketo says it expired, retries throttled calls with back-off, and stops with a message when the daily quota of 50,000 calls is used up. The quota resets at 12:00 AM CST.

## Development

```bash
pnpm test
pnpm typecheck
```

Tests run the CLI against an in-memory fake Marketo, never a real instance. Domain terms are in [GLOSSARY.md](GLOSSARY.md).
