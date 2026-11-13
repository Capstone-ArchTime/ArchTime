import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ProjectModel } from '../src/infrastructure/database/models/ProjectModel.ts';
import { MongoProjectRepository } from '../src/infrastructure/repositories/MongoProjectRepository.ts';
import { seal, unseal } from '../src/infrastructure/llm/secrets.ts';

// RF-17: the personal token of a private repository is stored encrypted, like an organization credential.
const TOKEN = 'ghp_personalToken1234';
const base = { name: 'w', repoUrl: 'https://github.com/a/b.git', visibility: 'private', status: 'PENDING', userId: 'u1' };
/** The stored shape: what seal() returns, without last4. */
const sealed = plain => { const { last4: _last4, ...secret } = seal(plain); return secret; };
/** A query that answers find/findById(...).select(...).lean(), remembering the fields asked for. */
const query = (result, asked = []) => ({ select: fields => { asked.push(fields); return { lean: async () => result }; } });

function captureCreate(t) {
  const created = [];
  t.mock.method(ProjectModel, 'create', async data => {
    created.push(data);
    return { toObject: () => ({ _id: new mongoose.Types.ObjectId(), ...data }) };
  });
  return created;
}

test('creating a workspace stores the token encrypted and never the plain text', async t => {
  const created = captureCreate(t);
  const project = await new MongoProjectRepository().create({ ...base, token: TOKEN });
  const [stored] = created;

  assert.equal(stored.token, undefined, 'no plain-text token reaches the database');
  assert.deepEqual(Object.keys(stored.tokenSecret).sort(), ['ciphertext', 'iv', 'tag']);
  assert.ok(!JSON.stringify(stored).includes(TOKEN.slice(-4)), 'not even its last four characters');
  assert.equal(unseal(stored.tokenSecret), TOKEN);
  assert.equal(project.token, undefined);
  assert.equal(project.tokenSecret, undefined);
});

test('a workspace without a token stores no secret', async t => {
  const created = captureCreate(t);
  await new MongoProjectRepository().create({ ...base, visibility: 'public' });
  assert.equal(created[0].tokenSecret, undefined);
  assert.equal(created[0].token, undefined);
});

test('the token is read only for cloning: decrypted from its secret, or a not yet encrypted one as it is', async t => {
  const repo = new MongoProjectRepository();
  const id = new mongoose.Types.ObjectId().toString();
  const asked = [];
  const find = t.mock.method(ProjectModel, 'findById', () => query({ tokenSecret: sealed(TOKEN) }, asked));

  assert.equal(await repo.resolveToken(id), TOKEN);
  assert.match(asked[0], /\+tokenSecret/, 'the secret is hidden by default, so it is selected on purpose');

  find.mock.mockImplementation(() => query({ token: 'ghp_legacy0001' }));
  assert.equal(await repo.resolveToken(id), 'ghp_legacy0001');

  find.mock.mockImplementation(() => query({}));
  assert.equal(await repo.resolveToken(id), undefined);
  assert.equal(await repo.resolveToken('not-an-id'), undefined);
});

test('the token and its secret are hidden by default and never serialised', () => {
  assert.equal(ProjectModel.schema.path('tokenSecret').options.select, false);
  assert.equal(ProjectModel.schema.path('token').options.select, false);
  const json = new ProjectModel({ ...base, token: TOKEN, tokenSecret: sealed(TOKEN) }).toJSON();
  assert.equal(json.token, undefined);
  assert.equal(json.tokenSecret, undefined);
});

test('plain-text tokens saved before RF-17 are encrypted and removed; running it again changes nothing', async t => {
  const plain = { _id: new mongoose.Types.ObjectId(), token: TOKEN };
  const empty = { _id: new mongoose.Types.ObjectId(), token: '' };
  const updates = [];
  const find = t.mock.method(ProjectModel, 'find', filter => {
    assert.deepEqual(filter, { token: { $exists: true } });
    return query([plain, empty]);
  });
  t.mock.method(ProjectModel, 'updateOne', async (filter, update) => {
    updates.push({ filter, update });
    return { modifiedCount: 1 };
  });

  assert.equal(await MongoProjectRepository.encryptLegacyTokens(), 1);
  const [first, second] = updates;
  assert.deepEqual(first.filter, { _id: plain._id, token: TOKEN }, 'a token changed meanwhile is not overwritten');
  assert.equal(unseal(first.update.$set.tokenSecret), TOKEN);
  assert.deepEqual(first.update.$unset, { token: 1 });
  assert.deepEqual(second.update, { $unset: { token: 1 } }, 'an empty token is just removed');

  find.mock.mockImplementation(() => query([]));
  updates.length = 0;
  assert.equal(await MongoProjectRepository.encryptLegacyTokens(), 0);
  assert.equal(updates.length, 0);
});
