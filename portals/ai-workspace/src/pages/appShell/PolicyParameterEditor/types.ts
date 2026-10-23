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

import type { PolicyForm, ViewNode } from './engine';

/**
 * A sub-schema used in a condition or a combinator branch (anyOf / oneOf / allOf /
 * if / then / else / not). Branches usually only say which keys must be present
 * and what value a sibling has.
 */
export interface SchemaCondition {
  required?: string[];
  properties?: Record<string, Partial<ParameterSchema> & { const?: unknown }>;
  not?: SchemaCondition;
  anyOf?: SchemaCondition[];
  oneOf?: SchemaCondition[];
  allOf?: SchemaCondition[];
  if?: SchemaCondition;
  then?: SchemaCondition;
  else?: SchemaCondition;
  minLength?: number;
  minItems?: number;
  minProperties?: number;
}

/**
 * JSON Schema-like structure parsed from YAML policy definitions
 */
export interface ParameterSchema {
  type: 'object' | 'array' | 'string' | 'boolean' | 'number' | 'integer';
  title?: string;
  description?: string;
  default?: unknown;
  const?: unknown;
  enum?: string[];
  format?: string;
  examples?: unknown[];
  properties?: Record<string, ParameterSchema>;
  items?: ParameterSchema;
  required?: string[];
  additionalProperties?: ParameterSchema | boolean; // For dynamic key-value objects
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: SchemaCondition;
  minProperties?: number;
  maxProperties?: number;
  minimum?: number;
  maximum?: number;
  'x-wso2-policy-advanced-param'?: boolean;
  'x-wso2-policy-deprecated-param'?: boolean;
  'x-wso2-policy-property-order'?: string[];
  'wso2/defaultValue'?: string;
  // Cross-field rules. The editor turns these into choice selectors, fields that
  // appear only when another field has a given value, and validation.
  anyOf?: SchemaCondition[];
  oneOf?: SchemaCondition[];
  allOf?: SchemaCondition[];
  not?: SchemaCondition;
  if?: SchemaCondition;
  then?: SchemaCondition;
  else?: SchemaCondition;
}

/**
 * Policy definition parsed from YAML
 */
export interface PolicyDefinition {
  name: string;
  version: string;
  displayName?: string;
  description: string;
  parameters: ParameterSchema;
  systemParameters?: ParameterSchema;
}

/**
 * Form values - nested object structure
 */
export type ParameterValues = Record<string, unknown>;

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Props for field renderers. `node` is the engine's view of one field: its
 * schema, current value, whether it is visible/required, and its errors.
 */
export interface FieldRendererProps {
  node: ViewNode;
  form: PolicyForm;
  error?: string;
  disabled?: boolean;
}
