import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

const root = process.cwd();
const overridesRoot = join(root, 'data', 'overrides');
const errors = [];
let validatedFiles = 0;

const allowedModelKeys = new Set([
  '$comment',
  'id',
  'name',
  'description',
  'reasoning',
  'tool_call',
  'attachment',
  'temperature',
  'knowledge',
  'release_date',
  'last_updated',
  'open_weights',
  'modalities',
  'limit',
  'cost',
  'currency',
]);

function listJsonFiles(directory) {
  if (!existsSync(directory)) return [];

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(path));
    } else if (entry.isFile() && extname(entry.name) === '.json') {
      files.push(path);
    }
  }
  return files;
}

function fileLabel(path) {
  return relative(root, path);
}

function readObject(path) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${fileLabel(path)}: invalid JSON (${error.message})`);
    return null;
  }

  validatedFiles += 1;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${fileLabel(path)}: top-level value must be an object`);
    return null;
  }
  return value;
}

function validateString(value, path, field) {
  if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
    errors.push(`${fileLabel(path)}: ${field} must be a non-empty string`);
  }
}

function validateDate(value, path, field) {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${fileLabel(path)}: ${field} must use YYYY-MM-DD`);
  }
}

function validateStringArray(value, path, field) {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    errors.push(`${fileLabel(path)}: ${field} must be an array of non-empty strings`);
  }
}

function validateModelOverride(path) {
  const value = readObject(path);
  if (!value) return;

  for (const key of Object.keys(value)) {
    if (!allowedModelKeys.has(key)) {
      errors.push(`${fileLabel(path)}: unsupported model field ${JSON.stringify(key)}`);
    }
  }

  validateString(value.id, path, 'id');
  validateString(value.name, path, 'name');
  validateString(value.description, path, 'description');
  validateDate(value.release_date, path, 'release_date');
  validateDate(value.last_updated, path, 'last_updated');

  const modelId = basename(path, '.json');
  if (value.id !== undefined && value.id !== modelId) {
    errors.push(`${fileLabel(path)}: id must match filename ${JSON.stringify(modelId)}`);
  }

  for (const field of ['reasoning', 'tool_call', 'attachment', 'temperature', 'open_weights']) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      errors.push(`${fileLabel(path)}: ${field} must be a boolean`);
    }
  }

  if (value.modalities !== undefined) {
    if (
      !value.modalities ||
      typeof value.modalities !== 'object' ||
      Array.isArray(value.modalities)
    ) {
      errors.push(`${fileLabel(path)}: modalities must be an object`);
    } else {
      validateStringArray(value.modalities.input, path, 'modalities.input');
      validateStringArray(value.modalities.output, path, 'modalities.output');
    }
  }

  if (value.limit !== undefined) {
    if (!value.limit || typeof value.limit !== 'object' || Array.isArray(value.limit)) {
      errors.push(`${fileLabel(path)}: limit must be an object`);
    } else {
      for (const field of ['context', 'output']) {
        const limit = value.limit[field];
        if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) {
          errors.push(`${fileLabel(path)}: limit.${field} must be a positive safe integer`);
        }
      }
    }
  }

  if (
    value.cost !== undefined &&
    (!value.cost || typeof value.cost !== 'object' || Array.isArray(value.cost))
  ) {
    errors.push(`${fileLabel(path)}: cost must be an object`);
  }
}

function validateLocalizedText(value, path, field) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${fileLabel(path)}: ${field} must be a locale-to-text object`);
    return;
  }
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text !== 'string' || text.trim() === '') {
      errors.push(`${fileLabel(path)}: ${field}.${locale} must be a non-empty string`);
    }
  }
}

function validateI18nOverride(path) {
  const value = readObject(path);
  if (!value) return;

  for (const key of Object.keys(value)) {
    if (!['name', 'description'].includes(key)) {
      errors.push(`${fileLabel(path)}: unsupported i18n field ${JSON.stringify(key)}`);
    }
  }
  validateLocalizedText(value.name, path, 'name');
  validateLocalizedText(value.description, path, 'description');
}

function validateGenericOverride(path) {
  readObject(path);
}

for (const path of listJsonFiles(join(overridesRoot, 'models'))) {
  validateModelOverride(path);
}
for (const path of listJsonFiles(join(overridesRoot, 'providers'))) {
  validateGenericOverride(path);
}
for (const path of listJsonFiles(join(overridesRoot, 'i18n'))) {
  validateI18nOverride(path);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  console.error(`Override validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`Validated ${validatedFiles} override file(s).`);
