// Guardrails: Spam Guard must never reply, send, forward, draft, open attachments,
// or call anything but the Claude API. These tests fail if such a call ever appears in Code.gs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raw = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
// Strip comments so the rules in the header don't trip the scan.
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const forbidden = {
  'reply to an email': /\.reply(All)?\s*\(/,
  'forward an email': /\.forward\s*\(/,
  'send an email': /sendEmail|MailApp|\.send\s*\(/,
  'create a draft': /createDraft|createDraftReply|createDraftReplyAll/,
  'open an attachment': /getAttachments|getAttachment\b|\.getBlob\s*\(|getRawContent|getAs\s*\(/,
  'delete an email': /moveToTrash|\.remove\s*\(|deleteMessage|deleteThread/,
  'use the Advanced Gmail service': /\bGmail\.Users\b/,
};

for (const [what, pattern] of Object.entries(forbidden)) {
  test(`Code.gs never tries to ${what}`, () => {
    assert.ok(!pattern.test(code), `found forbidden call matching ${pattern}`);
  });
}

test('the only network call goes to the Claude API', () => {
  const fetches = [...code.matchAll(/UrlFetchApp\.fetch(All)?\s*\(\s*([^,]+),/g)].map((m) => m[2].trim());
  assert.deepStrictEqual(fetches, ["'https://api.anthropic.com/v1/messages'"]);
});

test('Claude is given no tools, so it can only return a label', () => {
  assert.ok(!/\btools\s*:/.test(code));
  assert.ok(!/mcp_servers/.test(code));
});

test('the only actions taken on a thread are labeling and moving to spam', () => {
  const threadCalls = new Set([...code.matchAll(/\bthread\.(\w+)\s*\(/g)].map((m) => m[1]));
  assert.deepStrictEqual([...threadCalls].sort(), ['addLabel', 'getId', 'getMessages', 'moveToSpam']);
});
