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

/**
 * Whether a value contains a Go-template expression resolved by the gateway.
 *
 * Tree building, default values, type coercion, empty-value removal and
 * validation now live in ./engine (see createPolicyForm), which reads the
 * whole policy definition including oneOf / allOf / if-then / not.
 */
export function isTemplateExpression(value: unknown): value is string {
  return typeof value === 'string' && /\{\{[\s\S]+?\}\}/.test(value);
}
