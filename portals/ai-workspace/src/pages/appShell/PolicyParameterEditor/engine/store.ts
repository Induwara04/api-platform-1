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

import type { BuildOptions, FormState, MapEntry, Path, PolicyDefinition, PolicyFormModel, Resolution } from './types';
import { buildModel } from './model';
import { coerceInput, emptyValue, fieldAt, initialState, toState } from './state';
import { resolve } from './resolve';
import { getIn, pathKey, setIn } from './utils';

export interface PolicyFormOptions extends BuildOptions {
  /** an existing config to edit */
  initialConfig?: Record<string, unknown>;
}

export interface PolicyForm {
  model: PolicyFormModel;
  getState(): FormState;
  /** memoised: same object until the state changes */
  getResolution(): Resolution;
  /** Set a value from an input. Strings are coerced to the field's type; '' clears it. */
  setValue(path: Path, raw: unknown): void;
  /** Turn an optional section on (filled with defaults) or off. */
  setEnabled(path: Path, enabled: boolean): void;
  setChoice(instanceKey: string, optionIds: string[]): void;
  addItem(listPath: Path): void;
  removeItem(listPath: Path, index: number): void;
  moveItem(listPath: Path, from: number, to: number): void;
  /** maps */
  addEntry(mapPath: Path): void;
  setEntryKey(mapPath: Path, index: number, key: string): void;
  /** Replace everything, e.g. when switching policies or loading a saved config. */
  reset(config?: Record<string, unknown>): void;
  subscribe(listener: () => void): () => void;
}

export function createPolicyForm(definition: PolicyDefinition | PolicyFormModel, options: PolicyFormOptions = {}): PolicyForm {
  const model: PolicyFormModel = 'root' in definition && 'fields' in definition
    ? (definition as PolicyFormModel)
    : buildModel(definition as PolicyDefinition, options);
  let state = initialState(model, options.initialConfig);
  let cached: Resolution | null = null;
  const listeners = new Set<() => void>();

  const commit = (next: FormState) => {
    state = next;
    cached = null;
    listeners.forEach((l) => l());
  };
  const setValues = (path: Path, v: unknown) => commit({ ...state, values: setIn(state.values, path, v) ?? {} });

  return {
    model,
    getState: () => state,
    getResolution() {
      if (!cached) cached = resolve(model, state);
      return cached;
    },
    setValue(path, raw) {
      const f = fieldAt(model, path);
      setValues(path, f ? coerceInput(f, raw) : raw);
    },
    setEnabled(path, enabled) {
      const f = fieldAt(model, path);
      if (!f) return;
      setValues(path, enabled ? emptyValue(f) : undefined);
    },
    setChoice(instanceKey, optionIds) {
      commit({ ...state, choices: { ...state.choices, [instanceKey]: optionIds } });
    },
    addItem(listPath) {
      const f = fieldAt(model, listPath);
      if (!f?.item) return;
      const arr = (getIn(state.values, listPath) as unknown[]) ?? [];
      const blank = f.kind === 'objectList' ? emptyValue(f.item) : f.kind === 'multiselect' ? f.options?.[0]?.value : undefined;
      setValues(listPath, [...arr, blank]);
    },
    removeItem(listPath, index) {
      const arr = ((getIn(state.values, listPath) as unknown[]) ?? []).slice();
      arr.splice(index, 1);
      // choices for items after the removed one would shift; drop choices under this list
      const prefix = `${pathKey(listPath)}[`;
      const choices = Object.fromEntries(Object.entries(state.choices).filter(([k]) => !k.startsWith(prefix)));
      commit({ choices, values: setIn(state.values, listPath, arr) });
    },
    moveItem(listPath, from, to) {
      const arr = ((getIn(state.values, listPath) as unknown[]) ?? []).slice();
      if (to < 0 || to >= arr.length) return;
      const [x] = arr.splice(from, 1);
      arr.splice(to, 0, x);
      setValues(listPath, arr);
    },
    addEntry(mapPath) {
      const f = fieldAt(model, mapPath);
      if (!f?.valueField) return;
      const arr = (getIn(state.values, mapPath) as MapEntry[]) ?? [];
      setValues(mapPath, [...arr, { key: '', value: emptyValue(f.valueField) }]);
    },
    setEntryKey(mapPath, index, key) {
      setValues([...mapPath, index, 'key'], key);
    },
    reset(config) {
      commit(initialState(model, config));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export { toState };
