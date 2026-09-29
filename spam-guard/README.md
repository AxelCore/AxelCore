# Spam Guard

A Gmail filter that uses Claude to catch what Gmail's own spam filter lets through: cold sales pitches and scams. It runs inside your Google account as an Apps Script, so there is no server to host.

## How it works

Every 10 minutes it looks at inbox threads from the last 2 days that it hasn't checked yet.

1. **Skips anything it trusts without asking Claude.** That means mail from you, threads you've replied in, senders you have ever emailed, starred threads, and anything from `ALLOWED_DOMAINS` or `ALLOWED_ADDRESSES`.
2. **Sends everything else to Claude.** Claude gets the headers, the SPF/DKIM results, the attachment names and the first 6,000 characters of the body. It sorts the email into one of four categories: `legit`, `marketing`, `cold_sales` or `scam`.
3. **Acts on the verdict:**

   | Category | Default action |
   |---|---|
   | `scam`, 70% confidence or higher | Moved to Spam |
   | `cold_sales`, 80% confidence or higher | Moved to Spam |
   | `marketing` | Left alone (set `MOVE_MARKETING: true` to move it) |
   | `legit` | Never touched |

4. **Logs every decision** to a Google Sheet called "Spam Guard Log", with a link back to the email.

Every processed thread gets the `SpamGuard/Checked` label, so the same email is never classified (or billed) twice.

## Setup (about 5 minutes)

1. Go to [script.google.com](https://script.google.com) and click **New project**. Name it `Spam Guard`.
2. Replace the contents of `Code.gs` with this folder's `Code.gs`.
3. Open **Project Settings** (gear icon), tick **Show "appsscript.json" manifest file in editor**, and replace that file with this folder's `appsscript.json`.
4. Still in **Project Settings**, go to **Script Properties** and add:
   - `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)
5. Back in the editor, select the `setup` function and click **Run**. Approve the permissions. Google will warn that the app is unverified. That's expected, because you wrote it. Click **Advanced**, then **Go to Spam Guard**.
6. You're done. The View > Logs panel shows the URL of the log sheet.

## Go-live: dry run first

The script ships with `DRY_RUN: true`. In dry run nothing leaves your inbox. Emails it *would* move get the `SpamGuard/Would-Spam` label instead.

Leave it that way for 2 or 3 days. Then:

1. Open the `SpamGuard/Would-Spam` label in Gmail and look for anything real.
2. Add any real senders to `ALLOWED_DOMAINS` / `ALLOWED_ADDRESSES`, or raise the thresholds.
3. When the label only holds junk, set `DRY_RUN: false` and save. The next run starts moving mail to Spam.

## Undoing a mistake

Open the log sheet, find the row, and click the Gmail link. Then click **Not spam**. That also teaches Gmail. Add the sender to the allowlist so it can't happen again.

Gmail deletes Spam after 30 days, so check the log now and then.

## Controls

Everything lives in the `CONFIG` block at the top of `Code.gs`.

| Setting | What it does |
|---|---|
| `DRY_RUN` | `true` = label only, `false` = actually move to Spam |
| `THRESHOLDS` | Minimum confidence per category before it moves |
| `MOVE_MARKETING` | Also move bulk promo mail |
| `ALLOWED_DOMAINS` / `ALLOWED_ADDRESSES` | Never touched |
| `TRUST_PEOPLE_I_EMAILED` | Skip anyone you've ever sent mail to |
| `MODEL` / `EFFORT` | Which Claude model runs the classification, and how hard it thinks |
| `OWNER_CONTEXT` | Tells Claude who you are, so a real prospect isn't mistaken for a pitch |
| `SEARCH_QUERY` / `MAX_THREADS_PER_RUN` | What each run looks at |

To pause it, run `uninstall`. To resume, run `setup`.

## Cost

You pay one Claude API call per unknown sender's email. Emails from trusted senders are free, because they never reach Claude. At `claude-opus-5-5` list prices ($4 in / $20 out per million tokens), a typical email with low effort costs roughly one to two cents. That's an estimate: measure it on your real inbox using the usage page in the Anthropic console. To cut the cost about 4x, set `MODEL: 'claude-haiku-4-5'`. The tradeoff is that Haiku may be less sharp on borderline pitches. If you switch, remove `effort` and `fallbacks` from `buildRequestBody`, because Haiku 4.5 does not accept either.

## Known limits

- **Allowlisting trusts the From header.** A spoofed sender on an allowlisted domain with weak email authentication would be skipped. Gmail's own filter still sees that mail first. Keep the allowlist to domains you really deal with.
- **A 10-minute trigger means a pitch can sit in your inbox for up to 10 minutes** before it moves.
- **Only the latest message in each thread is judged.**

## Tests

The decision logic has unit tests that run under Node. They cover the thresholds, the allowlist and response parsing:

```
node --test spam-guard/test/logic.test.js
```
