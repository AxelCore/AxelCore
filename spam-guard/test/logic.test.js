// Unit tests for the pure logic in Code.gs. Run: node --test spam-guard/test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// Code.gs is plain JS; load it as a CommonJS module.
const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const m = new Module('Code.gs');
m._compile(src, 'Code.gs');
const g = m.exports;

const cfg = g.CONFIG;

test('scam above threshold goes to spam', () => {
  assert.strictEqual(g.decideAction({ category: 'scam', confidence: 0.9 }, cfg), 'spam');
});

test('scam below threshold stays', () => {
  assert.strictEqual(g.decideAction({ category: 'scam', confidence: 0.5 }, cfg), 'keep');
});

test('cold sales needs higher confidence than scam', () => {
  assert.strictEqual(g.decideAction({ category: 'cold_sales', confidence: 0.75 }, cfg), 'keep');
  assert.strictEqual(g.decideAction({ category: 'cold_sales', confidence: 0.85 }, cfg), 'spam');
});

test('legit is never moved, whatever the confidence', () => {
  assert.strictEqual(g.decideAction({ category: 'legit', confidence: 1 }, cfg), 'keep');
});

test('marketing only moves when MOVE_MARKETING is on', () => {
  const v = { category: 'marketing', confidence: 0.95 };
  assert.strictEqual(g.decideAction(v, cfg), 'keep');
  assert.strictEqual(g.decideAction(v, { ...cfg, MOVE_MARKETING: true }), 'spam');
});

test('extractAddress handles display names and bare addresses', () => {
  assert.strictEqual(g.extractAddress('Jane Doe <Jane@Example.com>'), 'jane@example.com');
  assert.strictEqual(g.extractAddress('bob@example.com'), 'bob@example.com');
  assert.strictEqual(g.extractAddress(''), '');
});

test('allowlist matches domain and subdomains but not lookalikes', () => {
  assert.ok(g.isAllowlisted('rep@broadcom.com', cfg));
  assert.ok(g.isAllowlisted('noreply@mail.broadcom.com', cfg));
  assert.ok(!g.isAllowlisted('ceo@fakebroadcom.com', cfg));
  assert.ok(!g.isAllowlisted('ceo@broadcom.com.evil.io', cfg));
});

test('allowlist matches exact addresses case-insensitively', () => {
  const c = { ...cfg, ALLOWED_ADDRESSES: ['Friend@Gmail.com'] };
  assert.ok(g.isAllowlisted('friend@gmail.com', c));
  assert.ok(!g.isAllowlisted('other@gmail.com', c));
});

test('parseVerdict reads the text block and clamps confidence', () => {
  const v = g.parseVerdict({
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: '{"category":"scam","confidence":1.4,"reason":"Fake invoice"}' },
    ],
  });
  assert.strictEqual(v.category, 'scam');
  assert.strictEqual(v.confidence, 1);
});

test('parseVerdict throws on refusal and unknown categories', () => {
  assert.throws(() => g.parseVerdict({ stop_reason: 'refusal', content: [] }), /declined/);
  assert.throws(
    () => g.parseVerdict({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"category":"maybe","confidence":1,"reason":"x"}' }] }),
    /Unknown category/
  );
});

test('request body uses structured output and fallbacks', () => {
  const body = g.buildRequestBody(
    { from: 'a@b.com', to: 'me@x.com', subject: 's', date: 'd', body: 'hi', hasAttachment: false },
    cfg
  );
  assert.strictEqual(body.model, 'claude-opus-5-5');
  assert.strictEqual(body.output_config.format.type, 'json_schema');
  assert.strictEqual(body.output_config.effort, 'low');
  assert.strictEqual(body.fallbacks, 'default');
  assert.ok(!('thinking' in body), 'Opus 5.5 must not send a thinking override');
});

test('long bodies are truncated', () => {
  const text = g.formatEmailForPrompt(
    { from: 'a', to: 'b', subject: 's', date: 'd', body: 'x'.repeat(10000), hasAttachment: true },
    100
  );
  assert.ok(text.includes('[... body truncated for length ...]'));
  assert.ok(text.length < 1000);
});
