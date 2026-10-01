/**
 * 受限 JSON Schema 校验器（零依赖）。
 *
 * 为什么不引 Ajv：这个仓库的门禁是**零外部依赖**的（`validate.js` 的注释明写
 * 「不 require axios/cheerio，因此 CI 中无需 npm install 即可运行」），
 * 而 AI 候选的校验必须在自检里离线跑得起来。我们只用到 JSON Schema 的一个很小的子集，
 * 自己实现反而更容易被单测覆盖。
 *
 * 支持的词：type / properties / required / additionalProperties / items /
 *          minItems / maxItems / minProperties / enum / const / oneOf /
 *          minLength / maxLength / minimum / maximum
 *
 * **刻意不支持**：$ref、format、pattern、allOf/anyOf/not、数值取整约束。
 * 不支持的词出现在 schema 里会被当成**编写错误**报出来（fail-closed），
 * 而不是静默忽略 —— 静默忽略一个约束，等于这条约束不存在。
 */

'use strict';

const SUPPORTED = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'minProperties', 'enum', 'const', 'oneOf',
  'minLength', 'maxLength', 'minimum', 'maximum', 'description', 'title'
]);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function checkUnknownKeywords(schema, path, errors) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) {
      errors.push({ path, code: 'unsupported_keyword', message: `schema 用了不支持的词 "${key}"（要么实现它，要么别写）` });
    }
  }
}

function validate(schema, value, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object') {
    errors.push({ path, code: 'bad_schema', message: 'schema 节点必须是对象' });
    return errors;
  }
  checkUnknownKeywords(schema, path, errors);

  // const / enum 先判：它们是最强的约束，命中失败时后面的信息价值不大
  if ('const' in schema && !sameValue(value, schema.const)) {
    errors.push({ path, code: 'const', message: `必须是 ${JSON.stringify(schema.const)}，实际 ${show(value)}` });
    return errors;
  }
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some(item => sameValue(item, value))) {
      errors.push({ path, code: 'enum', message: `必须是 ${schema.enum.map(show).join('/')} 之一，实际 ${show(value)}` });
      return errors;
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const matched = [];
    schema.oneOf.forEach((sub, index) => {
      const subErrors = validate(sub, value, path, []);
      if (subErrors.length === 0) matched.push(index);
    });
    if (matched.length !== 1) {
      errors.push({
        path,
        code: 'oneOf',
        message: matched.length === 0
          ? `不满足 oneOf 的任何一支（实际 ${show(value)}）`
          : `同时满足 oneOf 的 ${matched.length} 支（schema 写得有歧义）`
      });
      return errors;
    }
  }

  if (schema.type !== undefined) {
    const wanted = [].concat(schema.type);
    const actual = typeOf(value);
    const ok = wanted.some(t => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) {
      errors.push({ path, code: 'type', message: `类型应为 ${wanted.join('|')}，实际 ${actual}` });
      return errors;
    }
  }

  const actualType = typeOf(value);

  if (actualType === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push({ path, code: 'minLength', message: `长度 ${value.length} < ${schema.minLength}` });
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push({ path, code: 'maxLength', message: `长度 ${value.length} > ${schema.maxLength}` });
    }
  }

  if (actualType === 'number' || actualType === 'integer') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push({ path, code: 'minimum', message: `${value} < ${schema.minimum}` });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push({ path, code: 'maximum', message: `${value} > ${schema.maximum}` });
    }
  }

  if (actualType === 'array') {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push({ path, code: 'minItems', message: `条数 ${value.length} < ${schema.minItems}` });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push({ path, code: 'maxItems', message: `条数 ${value.length} > ${schema.maxItems}` });
    }
    if (schema.items) {
      value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`, errors));
    }
  }

  if (actualType === 'object') {
    const props = schema.properties || {};
    const keys = Object.keys(value);
    if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
      errors.push({ path, code: 'minProperties', message: `字段数 ${keys.length} < ${schema.minProperties}` });
    }
    for (const key of [].concat(schema.required || [])) {
      if (!(key in value) || value[key] === undefined) {
        errors.push({ path: `${path}.${key}`, code: 'required', message: `缺少必填字段 ${key}` });
      }
    }
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        validate(props[key], value[key], `${path}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: `${path}.${key}`, code: 'additional', message: `多出了未声明的字段 ${key}` });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validate(schema.additionalProperties, value[key], `${path}.${key}`, errors);
      }
    }
  }

  return errors;
}

function show(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value && typeof value === 'object') return Array.isArray(value) ? `[${value.length} 项]` : '{…}';
  return String(value);
}

/**
 * @returns {{ok:boolean, errors:{path,code,message}[]}}
 */
function validateValue(schema, value) {
  const errors = validate(schema, value, '$', []);
  return { ok: errors.length === 0, errors };
}

/** 把校验失败归类成 `generateStructured` 的 invalid.reason */
function classify(errors) {
  if (!errors.length) return null;
  if (errors.some(e => e.code === 'required')) return 'missing_required';
  if (errors.some(e => e.code === 'enum' || e.code === 'const')) return 'enum_invalid';
  return 'schema_invalid';
}

module.exports = { validateValue, validate, classify, SUPPORTED, typeOf };
