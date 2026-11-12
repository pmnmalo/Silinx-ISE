// A tool call's arguments checked against the tool's inputSchema (server/mcp.js, #3535), before the tool runs: the
// missing and the unknown ones, then each value's type, enum, minimum and maximum, an array's items and size, an object's
// properties (a JSON Schema's subset the tools use: type, enum, minimum, maximum, maxItems, items, properties, required,
// additionalProperties, anyOf). One message for every tool: the argument named, with what it must be
// ("language: one of vhdl, verilog", "rows[2].radix: a string").

const A = { string: 'a string', number: 'a number', integer: 'an integer', boolean: 'true or false', array: 'an array', object: 'an object', null: 'null' };

const isType = (v, t) => t === 'integer' ? Number.isInteger(v)
  : t === 'number' ? typeof v === 'number' && Number.isFinite(v)
    : t === 'array' ? Array.isArray(v)
      : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v)
        : t === 'null' ? v === null
          : typeof v === t;

const typeWord = s => [].concat(s.type).map(t => A[t] || t).join(' or ');
const at = (where, key) => /^[A-Za-z_][\w-]*$/.test(key) ? (where ? `${where}.${key}` : key) : `${where}[${JSON.stringify(key)}]`;

/** What is wrong with value against schema at where: a list of "where: what it must be" (empty: it is right). */
export function schemaErrors(value, schema, where) {
  if (!schema || typeof schema !== 'object') return [];
  if (schema.anyOf) {
    if (schema.anyOf.some(s => !schemaErrors(value, s, where).length)) return [];
    // (one alternative of the value's type: its own errors; else the alternatives' types)
    const same = schema.anyOf.filter(s => !s.type || [].concat(s.type).some(t => isType(value, t)));
    return same.length === 1 ? schemaErrors(value, same[0], where) : [`${where}: ${schema.anyOf.map(typeWord).join(' or ')}`];
  }
  if (schema.type && ![].concat(schema.type).some(t => isType(value, t))) return [`${where}: ${typeWord(schema)}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${where}: one of ${schema.enum.join(', ')}`];
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) return [`${where}: at least ${schema.minimum}`];
  if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) return [`${where}: at most ${schema.maximum}`];
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return [`${where}: at most ${schema.maxItems} item(s)`];
    return schema.items ? value.flatMap((v, i) => schemaErrors(v, schema.items, `${where}[${i}]`)) : [];
  }
  if (isType(value, 'object') && (schema.properties || schema.additionalProperties !== undefined || schema.required)) return objectErrors(value, schema, where);
  return [];
}

// an object's properties: the missing, the unknown (additionalProperties false), then each one's value
function objectErrors(value, schema, where) {
  const props = schema.properties || {};
  const missing = (schema.required || []).filter(k => value[k] === undefined);
  const extra = schema.additionalProperties === false ? Object.keys(value).filter(k => !Object.hasOwn(props, k)) : [];
  const errors = [];
  if (missing.length) errors.push(`${where ? `${where}: ` : ''}missing ${missing.join(', ')}`);
  if (extra.length) errors.push(`${where ? `${where}: ` : ''}unknown ${extra.join(', ')}`);
  if (errors.length) return errors;
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const s = Object.hasOwn(props, k) ? props[k] : typeof schema.additionalProperties === 'object' ? schema.additionalProperties : null;
    errors.push(...schemaErrors(v, s, at(where, k)));
  }
  return errors;
}

/** A tool call's arguments checked: null when they are right, else the message (the tool's name, then what is wrong). */
export function checkArgs(tool, args) {
  if (!isType(args, 'object')) return `${tool.name}: the arguments: an object`;
  const errors = schemaErrors(args, tool.inputSchema, '');
  return errors.length ? `${tool.name}: ${errors.join('; ')}` : null;
}
