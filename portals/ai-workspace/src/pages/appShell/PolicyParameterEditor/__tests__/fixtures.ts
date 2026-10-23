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

import { parsePolicyYaml } from '../yamlParser';
import type { PolicyDefinition } from '../types';

/**
 * Real policy definitions copied from wso2/gateway-controllers (policies/<name>/policy-definition.yaml).
 */
export type FixtureName =
  | 'oauth2-generator'
  | 'cors'
  | 'set-headers'
  | 'request-rewrite'
  | 'token-based-ratelimit'
  | 'log-message'
  | 'advanced-ratelimit'
  | 'aws-bedrock-guardrail'
  | 'json-xml-mediator'
  | 'api-key-auth'
  | 'content-length-guardrail';

const files = import.meta.glob('./fixtures/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const cache = new Map<FixtureName, PolicyDefinition>();

export function fixture(name: FixtureName): PolicyDefinition {
  if (!cache.has(name)) {
    const text = files[`./fixtures/${name}.yaml`];
    if (!text) throw new Error(`Missing fixture ${name}.yaml`);
    cache.set(name, parsePolicyYaml(text));
  }
  return cache.get(name)!;
}
