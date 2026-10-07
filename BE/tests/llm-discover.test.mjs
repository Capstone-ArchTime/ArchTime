import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { classify, discoverModels, listEndpoint, parseModelList } from '../src/infrastructure/llm/discover.ts';

test('models that cannot draw an architecture are marked with the reason', () => {
  assert.deepEqual(classify('llama-3.3-70b-versatile'), { chat: true });
  assert.deepEqual(classify('openai/gpt-oss-20b'), { chat: true });
  assert.equal(classify('meta-llama/llama-prompt-guard-2-22m').reason, 'safety classifier, not a chat model'); // the model that failed in testing
  assert.equal(classify('openai/gpt-oss-safeguard-20b').chat, false);
  assert.equal(classify('whisper-large-v3-turbo').reason, 'speech model');
  assert.equal(classify('playai-tts').chat, false);
  assert.equal(classify('text-embedding-004').reason, 'embedding model');
  assert.equal(classify('mistral-ocr-latest').reason, 'OCR model');
  assert.equal(classify('mistral-large-latest').chat, true, '"ocr" only as a whole word');
  assert.equal(classify('x', { active: false }).reason, 'not active');
  assert.equal(classify('x', { outputModalities: ['image'] }).chat, false);
});

test('Groq, OpenRouter, Gemini and Ollama lists are read the same way', () => {
  const groq = parseModelList({ object: 'list', data: [
    { id: 'whisper-large-v3', owned_by: 'OpenAI', active: true, context_window: 448 },
    { id: 'llama-3.3-70b-versatile', owned_by: 'Meta', active: true, context_window: 131072 },
    { id: 'openai/gpt-oss-20b', owned_by: 'OpenAI', active: true, context_window: 131072 },
  ] }, false);
  assert.deepEqual(groq.map(m => [m.id, m.chat]), [['llama-3.3-70b-versatile', true], ['openai/gpt-oss-20b', true], ['whisper-large-v3', false]]);
  assert.equal(groq[0].contextWindow, 131072);
  assert.equal(groq[0].free, false, 'no price published: not claimed free');

  const openrouter = parseModelList({ data: [
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', context_length: 65536, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
    { id: 'anthropic/claude-sonnet-x', pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { output_modalities: ['text'] } },
    { id: 'some/image-model', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['image'] } },
  ] }, false);
  assert.equal(openrouter[0].id, 'meta-llama/llama-3.3-70b-instruct:free', 'free chat models first');
  assert.equal(openrouter[0].free, true);
  assert.equal(openrouter[0].name, 'Llama 3.3 70B (free)');
  assert.deepEqual(openrouter[1].pricing, { inputPerMTok: 3, outputPerMTok: 15 });
  assert.equal(openrouter[2].chat, false);

  const gemini = parseModelList({ object: 'list', data: [{ id: 'models/gemini-3.6-flash', owned_by: 'google' }, { id: 'models/gemini-3.6-flash' }] }, false);
  assert.deepEqual(gemini.map(m => m.id), ['gemini-3.6-flash'], 'prefix dropped, duplicates removed');

  const ollama = parseModelList({ models: [{ name: 'llama3.1:8b' }] }, true);
  assert.deepEqual([ollama[0].id, ollama[0].free], ['llama3.1:8b', true], 'a model on this machine costs nothing');

  const small = parseModelList({ data: [{ id: 'allam-2-7b', context_window: 4096 }, { id: 'big', context_window: 131072 }, { id: 'unknown-size' }] }, false);
  assert.deepEqual(small.map(m => [m.id, m.chat]), [['big', true], ['unknown-size', true], ['allam-2-7b', false]], 'largest context first; too small is not offered');
  assert.equal(small[2].reason, 'context window too small (4k)');
  assert.throws(() => parseModelList({ error: 'nope' }, false), /not with a list of models/);
});

test('each provider is asked at its own address with its own credentials', () => {
  assert.deepEqual(listEndpoint({ provider: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1/', apiKey: 'k' }), { url: 'https://api.groq.com/openai/v1/models', headers: { Authorization: 'Bearer k' } });
  assert.deepEqual(listEndpoint({ provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1' }).headers, {}, 'no key for a local server');
  assert.equal(listEndpoint({ provider: 'gemini', apiKey: 'k' }).url, 'https://generativelanguage.googleapis.com/v1beta/openai/models');
  const anthropic = listEndpoint({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'k' });
  assert.equal(anthropic.url, 'https://api.anthropic.com/v1/models?limit=100');
  assert.equal(anthropic.headers['x-api-key'], 'k');
  assert.throws(() => listEndpoint({ provider: 'openai-compatible' }), /base URL/);
  assert.throws(() => listEndpoint({ provider: 'gemini' }), /API key/);
});

function server(handler) {
  const seen = [];
  const srv = http.createServer((req, res) => { seen.push({ url: req.url, auth: req.headers.authorization }); handler(req, res); });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise(r => { srv.closeAllConnections?.(); srv.close(r); }) })));
}

test('discovery against a server: success, rejected key, wrong base URL', async () => {
  const srv = await server((req, res) => {
    if (req.headers.authorization === 'Bearer bad') { res.writeHead(401); res.end('{}'); return; }
    if (req.url === '/v1/models') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'llama3.1:8b' }] })); return; }
    res.writeHead(404); res.end('not found');
  });
  try {
    const models = await discoverModels({ provider: 'openai-compatible', baseUrl: `${srv.url}/v1`, apiKey: 'good' });
    assert.deepEqual(models.map(m => [m.id, m.chat, m.free]), [['llama3.1:8b', true, true]]);
    assert.equal(srv.seen[0].auth, 'Bearer good');
    await assert.rejects(discoverModels({ provider: 'openai-compatible', baseUrl: `${srv.url}/v1`, apiKey: 'bad' }), /rejected the API key/);
    await assert.rejects(discoverModels({ provider: 'openai-compatible', baseUrl: srv.url }), /most providers end it with \/v1/);
  } finally { await srv.close(); }
  await assert.rejects(discoverModels({ provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:9' }, 2000), /Could not reach/);
});
