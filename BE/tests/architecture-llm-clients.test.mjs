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
  const cases = [[401, {}, 'auth'], [403, {}, 'auth'], [429, {}, 'rate_limit'], [500, {}, 'other'], [404, {}, 'request'], [200, { choices: [{ message: { content: 'x' }, finish_reason: 'length' }] }, 'truncated'], [200, { choices: [] }, 'other'], [200, { nope: 1 }, 'other']];
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

test('self-hosted client keeps the server explanation and reads Google-style errors', async () => {
  const cases = [
    [400, [{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }], 'auth', /API key not valid/],
    [429, [{ error: { code: 429, message: 'You exceeded your current quota.', status: 'RESOURCE_EXHAUSTED' } }], 'rate_limit', /exceeded your current quota/],
    [404, { error: { message: 'models/nope is not found for API version v1beta' } }, 'request', /models\/nope is not found/],
    [400, { error: { message: 'Unsupported parameter: max_tokens' } }, 'request', /Unsupported parameter/],
    [402, { error: { message: 'Insufficient credit on this account' } }, 'billing', /no credit/],
    [503, { error: { message: 'The model is overloaded' } }, 'other', /overloaded/],
  ];
  for (const [status, body, kind, text] of cases) {
    const srv = await server((req, res) => json(res, status, body));
    try {
      const client = new OpenAiCompatibleClient({ baseUrl: srv.url, model: 'm', timeoutMs: 5000, jsonMode: false });
      await assert.rejects(client.complete(MESSAGES), e => e.kind === kind && text.test(e.message), `${status} ${kind}`);
    } finally { await srv.close(); }
  }
});

test('JSON mode that the server rejects is switched off once, then stays off', async () => {
  const srv = await server((req, res) => (req.body.response_format ? json(res, 400, { error: { message: 'response_format is not supported' } }) : json(res, 200, { choices: [{ message: { content: '{"ok":1}' }, finish_reason: 'stop' }] })));
  try {
    const client = new OpenAiCompatibleClient({ baseUrl: srv.url, model: 'm', timeoutMs: 5000, jsonMode: true });
    assert.equal(await client.complete(MESSAGES), '{"ok":1}');
    assert.deepEqual(srv.requests.map(r => 'response_format' in r.body), [true, false]);
    assert.match(client.notes()[0], /JSON mode.*response_format is not supported.*switched off/);
    await client.complete(MESSAGES);
    assert.equal(srv.requests.length, 3);
  } finally { await srv.close(); }
});

test('Gemini goes through the OpenAI-compatible endpoint with its key, no temperature and room to think', async () => {
  const srv = await server((req, res) => json(res, 200, { choices: [{ message: { content: '{"components":[]}' }, finish_reason: 'stop' }] }));
  try {
    const runtime = loadLlmRuntime({ GEMINI_API_KEY: 'g-secret', LLM_BASE_URL: `${srv.url}/v1beta/openai/` });
    assert.equal(runtime.capability.provider, 'gemini');
    assert.equal(runtime.capability.model, 'gemini-3.6-flash');
    await runtime.client.complete(MESSAGES, { schema: { type: 'object' } });
    const [req] = srv.requests;
    assert.equal(req.url, '/v1beta/openai/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer g-secret');
    assert.equal(req.body.model, 'gemini-3.6-flash');
    assert.ok(!('temperature' in req.body), 'Gemini 3 is meant to run at its default temperature');
    assert.ok(req.body.max_tokens >= 16000);
    assert.deepEqual(req.body.response_format, { type: 'json_object' });
  } finally { await srv.close(); }
});

test('hosts on a private network are not "external"', () => {
  for (const h of ['localhost:11434', '127.0.0.1', '10.1.2.3', '192.168.0.9:8000', '172.16.5.5', '172.31.255.1', '[::1]:11434', 'gpu-box.local', 'llm.internal']) assert.equal(isPrivateHost(h), true, h);
  for (const h of ['api.anthropic.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', 'example.com:443']) assert.equal(isPrivateHost(h), false, h);
});

test('Gemini configuration', () => {
  assert.equal(loadLlmRuntime({ GEMINI_API_KEY: 'k' }).capability.provider, 'gemini');
  assert.deepEqual(loadLlmRuntime({ GEMINI_API_KEY: 'k' }).capability, { enabled: true, provider: 'gemini', model: 'gemini-3.6-flash', host: 'generativelanguage.googleapis.com', external: true });
  assert.equal(loadLlmRuntime({ GEMINI_API_KEY: 'k', LLM_MODEL: 'gemini-3.5-flash' }).capability.model, 'gemini-3.5-flash');
  assert.equal(loadLlmRuntime({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'k' }).capability.provider, 'anthropic', 'Claude wins unless LLM_PROVIDER says otherwise');
  assert.equal(loadLlmRuntime({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'k', LLM_PROVIDER: 'gemini' }).capability.provider, 'gemini');
  assert.equal(loadLlmRuntime({ LLM_PROVIDER: 'gemini', LLM_API_KEY: 'k' }).capability.enabled, true);
  assert.match(loadLlmRuntime({ LLM_PROVIDER: 'gemini' }).capability.reason, /GEMINI_API_KEY/);
  assert.ok(!JSON.stringify(loadLlmRuntime({ GEMINI_API_KEY: 'g-top-secret' }).capability).includes('secret'));
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

test('Claude client reports token usage, counting cached input with the rest, even for an answer it then rejects', async () => {
  const usage = { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 10 };
  let reply = message({ usage });
  const srv = await server((req, res) => json(res, 200, reply));
  try {
    const client = new ClaudeClient({ apiKey: 'sk-test', model: 'claude-opus-5-5', baseUrl: srv.url, timeoutMs: 5000 });
    const seen = [];
    await client.complete(MESSAGES, { onUsage: (u, ms) => seen.push([u, ms]) });
    assert.deepEqual(seen[0][0], { inputTokens: 1010, outputTokens: 40, cacheReadTokens: 900, estimated: false });
    assert.ok(seen[0][1] >= 0);
    reply = message({ usage, stop_reason: 'max_tokens' });
    await assert.rejects(client.complete(MESSAGES, { onUsage: u => seen.push([u]) }), e => e.kind === 'truncated');
    assert.equal(seen.length, 2, 'a cut-off answer was still paid for');
  } finally { await srv.close(); }
});

test('self-hosted client reports usage, and estimates it when the server sends none', async () => {
  let body = { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 500, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 100 }, completion_tokens_details: { reasoning_tokens: 30 } } };
  const srv = await server((req, res) => json(res, 200, body));
  try {
    const client = new OpenAiCompatibleClient({ baseUrl: srv.url, model: 'm', timeoutMs: 5000, jsonMode: false });
    const seen = [];
    await client.complete(MESSAGES, { onUsage: u => seen.push(u) });
    assert.deepEqual(seen[0], { inputTokens: 500, outputTokens: 80, cacheReadTokens: 100, reasoningTokens: 30, estimated: false });
    body = { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] };
    await client.complete(MESSAGES, { onUsage: u => seen.push(u) });
    assert.equal(seen[1].estimated, true);
    assert.equal(seen[1].outputTokens, Math.ceil('{"ok":true}'.length / 4));
    assert.ok(seen[1].inputTokens > 0);
  } finally { await srv.close(); }
});
