/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import type { Path } from './types';

const ACRONYMS = new Set([
  'id', 'ids', 'url', 'urls', 'uri', 'uris', 'tls', 'ca', 'aws', 'arn', 'jwt', 'jwks', 'ttl', 'http', 'https',
  'api', 'ip', 'sts', 'iam', 'json', 'xml', 'cel', 'pii', 'ssn', 'mcp', 'llm', 'hmac', 'opa', 'sql', 'cors',
  'sse', 'ssl', 'db', 'pem', 'kid', 'iss', 'aud', 'sub', 'rpm', 'tpm', 'mtls', 'sni', 'dns', 'cidr', 'ms',
  'oidc', 'saml', 'crl', 'ocsp', 'gcp', 'uuid', 'regex', 'nlp', 'ai', 'sdk', 'cpu', 'tcp', 'udp',
]);
const SPECIAL: Record<string, string> = { oauth2: 'OAuth2', oauth: 'OAuth', openai: 'OpenAI', websub: 'WebSub', redis: 'Redis', regex: 'regex' };

/** "tokenEndpoint" → "Token endpoint", "awsAccessKeyID" → "AWS access key ID", "proxyURL" → "Proxy URL" */
export function humanize(key: string): string {
  if (!key) return '';
  const words = key
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (SPECIAL[lower] && lower !== 'regex') return SPECIAL[lower];
      if (ACRONYMS.has(lower) && lower !== 'regex') return lower === 'ids' ? 'IDs' : lower.toUpperCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

export function pathKey(path: Path): string {
  let out = '';
  for (const p of path) {
    if (typeof p === 'number') out += `[${p}]`;
    else out += out ? `.${p}` : p;
  }
  return out;
}

export function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
}

export function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

export function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

export function formatValue(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** Immutable set: creates arrays for numeric segments and objects for string segments. */
export function setIn(root: any, path: Path, value: unknown): any {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const container = root ?? (typeof head === 'number' ? [] : {});
  const copy: any = Array.isArray(container) ? container.slice() : { ...container };
  const next = setIn(copy[head as any], rest, value);
  if (next === undefined && !Array.isArray(copy)) delete copy[head as any];
  else copy[head as any] = next;
  return copy;
}

export function getIn(root: any, path: Path): any {
  let cur = root;
  for (const p of path) {
    if (cur == null) return undefined;
    cur = cur[p as any];
  }
  return cur;
}

/** Keys that look like credentials. Matches the end of the key so "tokenEndpoint" is not a secret. */
export const SECRET_KEY = /(secret|password|passwd|bearertoken|apikey|privatekey|secretaccesskey|clientsecret|accesstoken|sessiontoken)$/i;
/** Keys whose text is usually long or multi-line. */
export const MULTILINE_KEY = /(template|prompt|instructions|schema|inline|cert|certificate|pem|expression|body|policy|systemprompt|payload|script|rego)$/i;
