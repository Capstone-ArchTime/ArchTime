import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ClaudeClient, isPrivateHost } from '../src/infrastructure/llm/ClaudeClient.ts';
import { OpenAiCompatibleClient } from '../src/infrastructure/llm/OpenAiCompatibleClient.ts';
import { loadLlmRuntime } from '../src/infrastructure/llm/runtime.ts';

function server(handler) {
  const requests = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const record = { method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null };
      requests.push(record);
      handler(record, res);
    });
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, requests, close: () => new Promise(r => { srv.closeAllConnections?.(); srv.close(r); }) })));
}
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const message = (over = {}) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: '{"components":[]}' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...over });
const MESSAGES = [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' }, { role: 'user', content: 'Again' }];

test('Claude client sends the SDK request we expect and reads the text', async () => {
  const srv = await server((req, res) => json(res, 200, message()));
  try {
    const client = new ClaudeClient({ apiKey: 'sk-test', model: 'claude-opus-5-5', baseUrl: srv.url, timeoutMs: 5000 });
    assert.deepEqual(client.info, { provider: 'anthropic', model: 'claude-opus-5-5', host: srv.url.replace('http://', ''), external: false });
    const text = await client.complete(MESSAGES, { schema: { type: 'object', properties: {}, additionalProperties: false } });
    assert.equal(text, '{"components":[]}');
    const [req] = srv.requests;
    assert.equal(req.method, 'POST');
    assert.match(req.url, /^\/v1\/messages/);
    assert.equal(req.headers['x-api-key'], 'sk-test');
    assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(req.body.model, 'claude-opus-5-5');
    assert.equal(req.body.fallbacks, 'default');
    assert.equal(req.body.system, 'Be brief.');
    assert.deepEqual(req.body.messages.map(m => m.role), ['user', 'assistant', 'user']);
    assert.equal(req.body.output_config.format.type, 'json_schema');
    assert.equal(req.body.output_config.effort, 'medium');
    for (const removed of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(removed in req.body), `${removed} must not be sent to this model`);
    assert.ok(req.body.max_tokens >= 4000);
  } finally { await srv.close(); }
});

test('Claude client turns provider outcomes into typed errors', async () => {
  const cases = [
    [() => ({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'bad key' } } }), 'auth'],
    [() => ({ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, headers: { 'retry-after-ms': '5' } }), 'rate_limit'],
    [() => ({ status: 200, body: message({ stop_reason: 'refusal', content: [] }) }), 'refusal'],
    [() => ({ status: 200, body: message({ stop_reason: 'max_tokens' }) }), 'truncated'],
    [() => ({ status: 200, body: message({ content: [{ type: 'text', text: '   ' }] }) }), 'other'],
    [() => ({ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'nope' } } }), 'request'],
    [() => ({ status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: claude-opus-5-5' } } }), 'request'],
    [() => ({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'boom' } }, headers: { 'retry-after-ms': '5' } }), 'other'],
  ];
  for (const [reply, kind] of cases) {
    const srv = await server((req, res) => { const r = reply(); json(res, r.status, r.body, r.headers); });
    try {
      const client = new ClaudeClient({ apiKey: 'k', model: 'm', baseUrl: srv.url, timeoutMs: 5000 });
      await assert.rejects(client.complete(MESSAGES), e => e.name === 'LlmError' && e.kind === kind, kind);
    } finally { await srv.close(); }
  }
});

test('provider messages are kept so the user can see what went wrong', async () => {
  const srv = await server((req, res) => json(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format: schema is too complex' } }));
  try {
    const client = new ClaudeClient({ apiKey: 'k', model: 'm', baseUrl: srv.url, timeoutMs: 5000 });
    await assert.rejects(client.complete(MESSAGES), e => e.kind === 'request' && /schema is too complex/.test(e.message));
  } finally { await srv.close(); }
  const missing = await server((req, res) => json(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'model: nope' } }));
  try {
    const client = new ClaudeClient({ apiKey: 'k', model: 'nope', baseUrl: missing.url, timeoutMs: 5000 });
    await assert.rejects(client.complete(MESSAGES), e => e.kind === 'request' && /Model "nope" was not found/.test(e.message) && /LLM_MODEL/.test(e.message));
  } finally { await missing.close(); }
});

test('an unfunded account is reported as billing and nothing else is tried', async () => {
  const srv = await server((req, res) => json(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }));
  try {
    const client = new ClaudeClient({ apiKey: 'k', model: 'claude-opus-5-5', baseUrl: srv.url, timeoutMs: 5000 });
    await assert.rejects(client.complete(MESSAGES, { schema: { type: 'object', additionalProperties: false } }), e => e.kind === 'billing' && e.fatal && /no credit left/.test(e.message) && /self-hosted/.test(e.message));
    assert.equal(srv.requests.length, 1, 'no retry and no option is dropped');
    assert.deepEqual(client.notes(), []);
  } finally { await srv.close(); }
});

test('optional request features the provider rejects are switched off, in order, and stay off', async () => {
  const reject = message => ({ type: 'error', error: { type: 'invalid_request_error', message } });
  const srv = await server((req, res) => {
    if ('fallbacks' in req.body) return json(res, 400, reject('fallbacks: not enabled for this organization'));
    if (req.body.output_config?.format) return json(res, 400, reject('output_config.format: not supported here'));
    json(res, 200, message());
  });
  try {
    const client = new ClaudeClient({ apiKey: 'k', model: 'claude-opus-5-5', baseUrl: srv.url, timeoutMs: 5000 });
    const schema = { type: 'object', properties: {}, additionalProperties: false };
    assert.equal(await client.complete(MESSAGES, { schema }), '{"components":[]}');
    assert.deepEqual(srv.requests.map(r => ['fallbacks' in r.body, !!r.body.output_config?.format]), [[true, true], [false, true], [false, false]]);
    assert.equal(srv.requests.at(-1).headers['anthropic-beta'], undefined);
    const notes = client.notes();
    assert.equal(notes.length, 2);
    assert.match(notes[0], /not enabled for this organization/);
    assert.match(notes[1], /not supported here/);
    await client.complete(MESSAGES, { schema });
    assert.equal(srv.requests.length, 4, 'once switched off, later calls go straight through');
    assert.deepEqual(client.notes(), notes);
  } finally { await srv.close(); }
});

test('Claude client times out', async () => {
  const srv = await server(() => { /* never answers */ });
  try {
    const client = new ClaudeClient({ apiKey: 'k', model: 'm', baseUrl: srv.url, timeoutMs: 150 });
    await assert.rejects(client.complete(MESSAGES), e => e.name === 'LlmError' && e.kind === 'timeout');
  } finally { await srv.close(); }
});

test('self-hosted client speaks the chat-completions protocol', async () => {
  const srv = await server((req, res) => json(res, 200, { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }));
  try {
    const client = new OpenAiCompatibleClient({ baseUrl: `${srv.url}/v1`, model: 'qwen', apiKey: 'secret', timeoutMs: 5000, jsonMode: true });
    assert.equal(client.info.external, false, 'a loopback server keeps the data on this machine');
    assert.equal(await client.complete(MESSAGES, { schema: { type: 'object' } }), '{"ok":true}');
    const [req] = srv.requests;
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer secret');
    assert.equal(req.body.model, 'qwen');
    assert.equal(req.body.temperature, 0);
    assert.deepEqual(req.body.response_format, { type: 'json_object' });
    assert.equal(req.body.messages.length, 4);
    assert.ok(!('schema' in req.body));
    const plain = new OpenAiCompatibleClient({ baseUrl: srv.url, model: 'm', timeoutMs: 5000, jsonMode: false });
    await plain.complete(MESSAGES);
    assert.ok(!('response_format' in srv.requests[1].body));
    assert.equal(srv.requests[1].headers.authorization, undefined);
  } finally { await srv.close(); }
});

test('self-hosted client turns failures into typed errors', async () => {
  const cases = [[401, {}, 'auth'], [403, {}, 'auth'], [429, {}, 'rate_limit'], [500, {}, 'other'], [200, { choices: [{ message: { content: 'x' }, finish_reason: 'length' }] }, 'truncated'], [200, { choices: [] }, 'other'], [200, { nope: 1 }, 'other']];
  for (const [status, body, kind] of cases) {
    const srv = await server((req, res) => json(res, status, body));
    try {
      const client = new OpenAiCompatibleClient({ baseUrl: srv.url, model: 'm', timeoutMs: 5000, jsonMode: true });
      await assert.rejects(client.complete(MESSAGES), e => e.kind === kind, `${status} ${kind}`);
    } finally { await srv.close(); }
  }
  const dead = new OpenAiCompatibleClient({ baseUrl: 'http://127.0.0.1:9', model: 'm', timeoutMs: 2000, jsonMode: true });
  await assert.rejects(dead.complete(MESSAGES), e => e.kind === 'network');
  const slow = await server(() => {});
  try {
    await assert.rejects(new OpenAiCompatibleClient({ baseUrl: slow.url, model: 'm', timeoutMs: 100, jsonMode: true }).complete(MESSAGES), e => e.kind === 'timeout');
  } finally { await slow.close(); }
});

test('hosts on a private network are not "external"', () => {
  for (const h of ['localhost:11434', '127.0.0.1', '10.1.2.3', '192.168.0.9:8000', '172.16.5.5', '172.31.255.1', '[::1]:11434', 'gpu-box.local', 'llm.internal']) assert.equal(isPrivateHost(h), true, h);
  for (const h of ['api.anthropic.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', 'example.com:443']) assert.equal(isPrivateHost(h), false, h);
});

test('configuration: off by default, explicit about why, and secrets never reach the capability report', () => {
  assert.equal(loadLlmRuntime({}).capability.enabled, false);
  assert.match(loadLlmRuntime({}).capability.reason, /No AI provider/);
  assert.match(loadLlmRuntime({ LLM_PROVIDER: 'anthropic' }).capability.reason, /ANTHROPIC_API_KEY/);
  assert.match(loadLlmRuntime({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'x' }).capability.reason, /LLM_BASE_URL/);
  assert.match(loadLlmRuntime({ LLM_PROVIDER: 'carrier-pigeon' }).capability.reason, /Unknown/);

  const claude = loadLlmRuntime({ ANTHROPIC_API_KEY: 'sk-ant-secret' });
  assert.deepEqual(claude.capability, { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5', host: 'api.anthropic.com', external: true });
  assert.ok(claude.client);
  assert.equal(loadLlmRuntime({ ANTHROPIC_API_KEY: 'sk-ant-secret', LLM_MODEL: 'claude-sonnet-5-5' }).capability.model, 'claude-sonnet-5-5');

  const local = loadLlmRuntime({ LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: 'http://localhost:11434/v1', LLM_MODEL: 'qwen2.5', LLM_API_KEY: 'local-secret' });
  assert.deepEqual(local.capability, { enabled: true, provider: 'openai-compatible', model: 'qwen2.5', host: 'localhost:11434', external: false });
  assert.ok(!JSON.stringify([claude.capability, local.capability]).includes('secret'));
  assert.equal(loadLlmRuntime({ LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: 'not a url', LLM_MODEL: 'm' }).capability.enabled, false);
  assert.equal(loadLlmRuntime({ LLM_MAX_MOVE_RATIO: '7' }).options.maxMoveRatio, 1);
  assert.equal(loadLlmRuntime({ LLM_MAX_REFINE_FILES: '10' }).options.maxRefineFiles, 10);
  assert.equal(loadLlmRuntime({ LLM_MAX_REFINE_FILES: 'abc' }).options.maxRefineFiles, 400);
});
