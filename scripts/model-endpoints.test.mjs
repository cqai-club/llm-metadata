import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DataLoader } from '../dist/services/data-loader.js';
import { DataProcessor } from '../dist/services/data-processor.js';
import { NewApiBuilder } from '../dist/services/newapi-builder.js';

const validatorPath = fileURLToPath(new URL('./validate-overrides.mjs', import.meta.url));

function withOverride(endpoints, run) {
  const root = mkdtempSync(join(tmpdir(), 'llm-metadata-endpoints-'));
  const dataDir = join(root, 'data');
  const modelDir = join(dataDir, 'overrides', 'models', 'fixture');
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(
    join(modelDir, 'text-embedding-fixture.json'),
    JSON.stringify({
      $comment: 'Fixture source comment must not appear in the API.',
      id: 'text-embedding-fixture',
      modalities: { input: ['text'], output: ['embedding'] },
      ...(endpoints === undefined ? {} : { endpoints }),
    }),
  );
  try {
    return run({ root, dataDir });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('explicit endpoints survive override loading, normalization, localization and NewAPI export', () => {
  withOverride(['embeddings'], ({ dataDir }) => {
    const overrides = new DataLoader(dataDir, join(dataDir, '.cache')).loadOverrides();
    const processor = new DataProcessor();
    const source = { providers: { fixture: { id: 'fixture', models: { chat: { id: 'chat' } } } } };
    const processed = processor.processAllData(source, overrides, new Set());
    const localized = processor.localizeNormalizedData(processed, overrides, 'zh');
    const models = new NewApiBuilder({ exchangeRates: {}, providers: {} })
      .buildSyncPayload(localized).models;

    assert.deepEqual(processed.providers.fixture.models['text-embedding-fixture'].endpoints, ['embeddings']);
    assert.equal('$comment' in processed.providers.fixture.models['text-embedding-fixture'], false);
    assert.deepEqual(models.find((model) => model.model_name === 'text-embedding-fixture').endpoints, ['embeddings']);
    assert.equal(models.find((model) => model.model_name === 'chat').endpoints, null);
  });
});

test('a model name or embedding modality does not infer unverified endpoints', () => {
  withOverride(undefined, ({ dataDir }) => {
    const overrides = new DataLoader(dataDir, join(dataDir, '.cache')).loadOverrides();
    const processor = new DataProcessor();
    const normalized = processor.injectManualProviders({ providers: {} }, overrides);
    const processed = processor.processAllData(normalized, overrides, new Set());
    const model = new NewApiBuilder({ exchangeRates: {}, providers: {} })
      .buildSyncPayload(processed).models[0];
    assert.equal(model.endpoints, null);
  });
});

test('override validator accepts explicit endpoint arrays', () => {
  withOverride(['embeddings'], ({ root }) => {
    const result = spawnSync(process.execPath, [validatorPath], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
});

for (const endpoints of [null, 'embeddings', [], [''], [42], ['embeddings', 'embeddings']]) {
  test(`override validator rejects malformed endpoints ${JSON.stringify(endpoints)}`, () => {
    withOverride(endpoints, ({ root }) => {
      const result = spawnSync(process.execPath, [validatorPath], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /endpoints/);
    });
  });
}
