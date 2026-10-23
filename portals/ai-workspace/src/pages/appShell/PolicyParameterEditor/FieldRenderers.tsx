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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@wso2/oxygen-ui';
import { Eye, EyeOff, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { FieldRendererProps } from './types';
import { useStyles } from './styles';
import { isTemplateExpression } from './schemaUtils';
import type { Path, ViewNode } from './engine';

/** Dot path used in data-testids, e.g. "request.headers.0.name" (same as before). */
export const testPath = (path: Path): string => path.join('.');

const textOf = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value);

/** First error for a list: its own, or the first one on any of its items. */
const listError = (node: ViewNode): string | undefined =>
  node.errors[0] ?? node.items?.find((item) => item.errors.length)?.errors[0];

type SimpleTagInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  testId?: string;
};

const SimpleTagInput: React.FC<SimpleTagInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  error,
  helperText,
  testId,
}) => {
  const classes = useStyles();
  const [inputValue, setInputValue] = useState('');

  const normalizedValues = useMemo(
    () => value.map((item) => item.trim()).filter(Boolean),
    [value]
  );

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }
    if (normalizedValues.includes(trimmed)) {
      return;
    }
    onChange([...normalizedValues, trimmed]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(inputValue);
      setInputValue('');
      return;
    }

    if (event.key === 'Backspace' && inputValue === '' && value.length > 0) {
      onChange(normalizedValues.slice(0, -1));
    }
  };

  const handleDelete = (tagToDelete: string) => {
    onChange(normalizedValues.filter((tag) => tag !== tagToDelete));
  };

  return (
    <Box sx={classes.tagInputContainer} data-testid={testId}>
      {normalizedValues.length > 0 && (
        <Box sx={classes.tagInputChips}>
          {normalizedValues.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onDelete={
                disabled ? undefined : () => handleDelete(tag)
              }
            />
          ))}
        </Box>
      )}
      <TextField
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        size="small"
        error={!!error}
        sx={classes.tagInputField}
        inputProps={{
          'data-testid': testId ? `${testId}-input` : undefined,
        }}
      />
      {helperText && (
        <FormHelperText error={!!error} sx={classes.tagInputHelperText}>
          {helperText}
        </FormHelperText>
      )}
    </Box>
  );
};

/**
 * Renders a plain or URL string field
 */
export const StringFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  error,
  disabled,
}) => {
  const classes = useStyles();
  const { field } = node;
  return (
    <Box sx={classes.fieldContainer}>
      <TextField
        value={textOf(node.value)}
        onChange={(e) => form.setValue(node.path, e.target.value)}
        disabled={disabled || field.readOnly}
        error={!!error}
        helperText={error}
        fullWidth
        size="small"
        sx={classes.fieldInput}
        placeholder={
          field.placeholder ?? (field.hasDefault ? textOf(field.default) : '')
        }
        inputProps={{
          'data-testid': `field-${testPath(node.path)}`,
          maxLength: field.constraints.maxLength,
          'aria-label': field.label,
        }}
      />
    </Box>
  );
};

/**
 * Renders a credential (client secret, password, token) as a masked field
 */
export const SecretFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  error,
  disabled,
}) => {
  const classes = useStyles();
  const [visible, setVisible] = useState(false);
  const { field } = node;
  return (
    <Box sx={classes.fieldContainer}>
      <TextField
        type={visible ? 'text' : 'password'}
        value={textOf(node.value)}
        onChange={(e) => form.setValue(node.path, e.target.value)}
        disabled={disabled || field.readOnly}
        error={!!error}
        helperText={error}
        fullWidth
        size="small"
        sx={classes.fieldInput}
        placeholder={field.placeholder ?? '{{ secret "handle" }}'}
        autoComplete="off"
        inputProps={{
          'data-testid': `field-${testPath(node.path)}`,
          'aria-label': field.label,
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? `Hide ${field.label}` : `Show ${field.label}`}
                data-testid={`field-${testPath(node.path)}-visibility`}
              >
                {visible ? <EyeOff size={14} /> : <Eye size={14} />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
};

/**
 * Renders long text (templates, PEM certificates, CEL expressions, JSON)
 */
export const TextAreaFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  error,
  disabled,
}) => {
  const classes = useStyles();
  const { field } = node;
  return (
    <Box sx={classes.fieldContainer}>
      <TextField
        value={textOf(node.value)}
        onChange={(e) => form.setValue(node.path, e.target.value)}
        disabled={disabled || field.readOnly}
        error={!!error}
        helperText={error}
        fullWidth
        multiline
        minRows={field.kind === 'json' ? 4 : 3}
        size="small"
        sx={[classes.fieldInput, classes.monospaceInput]}
        placeholder={field.placeholder ?? (field.kind === 'json' ? '{ }' : '')}
        inputProps={{
          'data-testid': `field-${testPath(node.path)}`,
          'aria-label': field.label,
        }}
      />
    </Box>
  );
};

/**
 * Renders an enum as a dropdown
 */
export const SelectFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  error,
  disabled,
}) => {
  const classes = useStyles();
  const { field } = node;
  return (
    <Box sx={classes.fieldContainer}>
      <FormControl fullWidth size="small" error={!!error} disabled={disabled || field.readOnly}>
        <Select
          value={textOf(node.value)}
          onChange={(e) => form.setValue(node.path, e.target.value as string)}
          displayEmpty
          variant="outlined"
          data-testid={`field-${testPath(node.path)}`}
          inputProps={{ 'aria-label': field.label }}
          sx={classes.enumSelect}
        >
          <MenuItem value="">
            <em>Select...</em>
          </MenuItem>
          {(field.options ?? []).map((option) => (
            <MenuItem key={String(option.value)} value={String(option.value)}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {error && <Box sx={classes.errorText}>{error}</Box>}
    </Box>
  );
};

/**
 * Renders a boolean field as a toggle switch
 */
export const BooleanFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  error,
  disabled,
}) => {
  const classes = useStyles();
  const checked = node.value === true || node.value === 'true';

  return (
    <Box sx={classes.fieldContainer}>
      <Box sx={classes.toggleContainer}>
        <Switch
          checked={checked}
          onChange={(e) => form.setValue(node.path, e.target.checked)}
          disabled={disabled || node.field.readOnly}
          size="small"
          inputProps={{ 'aria-label': node.field.label }}
          data-testid={`field-${testPath(node.path)}`}
        />
        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
          {checked ? 'true' : 'false'}
        </Typography>
      </Box>
      {error && <Box sx={classes.errorText}>{error}</Box>}
    </Box>
  );
};

/**
 * Renders a number/integer field. Template expressions ({{ env "LIMIT" }}) are
 * kept as text; anything else that isn't a number is kept so validation can
 * report it.
 */
export const NumberFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  error,
  disabled,
}) => {
  const classes = useStyles();
  const { field } = node;
  const isInteger = field.kind === 'integer';
  const [displayValue, setDisplayValue] = useState<string>(textOf(node.value));

  // Follow external changes (reset, loading existing values) without fighting the
  // user's in-progress typing ("1." still means 1).
  useEffect(() => {
    const external = textOf(node.value);
    if (external !== displayValue && Number(displayValue) !== node.value) {
      setDisplayValue(external);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);
    // The engine turns numeric text into a number, '' into "not set", and keeps
    // template expressions and invalid text as strings so validation can report them.
    form.setValue(node.path, inputValue);
  };

  return (
    <Box sx={classes.fieldContainer}>
      <TextField
        type="text"
        value={displayValue}
        onChange={handleChange}
        disabled={disabled || field.readOnly}
        error={!!error}
        helperText={error}
        fullWidth
        size="small"
        sx={classes.fieldInput}
        placeholder={field.hasDefault ? textOf(field.default) : ''}
        inputProps={{
          'data-testid': `field-${testPath(node.path)}`,
          'aria-label': field.label,
          min: field.constraints.minimum,
          max: field.constraints.maximum,
          step: isInteger ? 1 : 'any',
          inputMode: 'decimal',
        }}
      />
    </Box>
  );
};

/**
 * Renders a const value read-only
 */
export const ConstantFieldRenderer: React.FC<FieldRendererProps> = ({ node }) => {
  const classes = useStyles();
  return (
    <Box sx={classes.fieldContainer}>
      <TextField
        value={textOf(node.field.default)}
        disabled
        fullWidth
        size="small"
        sx={classes.fieldInput}
        inputProps={{
          'data-testid': `field-${testPath(node.path)}`,
          'aria-label': node.field.label,
        }}
      />
    </Box>
  );
};

/**
 * Renders a simple array field (strings, numbers or integers) as tags
 */
export const SimpleArrayFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  error,
  disabled,
}) => {
  const classes = useStyles();
  const itemKind = node.field.item?.kind;
  const arrayValue = Array.isArray(node.value)
    ? (node.value as unknown[]).map((item) => String(item))
    : [];

  const handleArrayChange = (newValue: string[]) => {
    if (itemKind === 'number' || itemKind === 'integer') {
      form.setValue(
        node.path,
        newValue.map((item) => {
          if (isTemplateExpression(item)) return item;
          const numberValue = Number(item);
          return Number.isNaN(numberValue) ? item : numberValue;
        })
      );
      return;
    }
    form.setValue(node.path, newValue);
  };

  return (
    <Box sx={classes.fieldContainer}>
      <SimpleTagInput
        testId={`field-${testPath(node.path)}`}
        placeholder="Type a value and press enter"
        value={arrayValue}
        onChange={handleArrayChange}
        helperText={error}
        error={!!error}
        disabled={disabled || node.field.readOnly}
      />
    </Box>
  );
};

/**
 * Renders an array of enum values as a set of checkboxes
 */
export const MultiSelectFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  error,
  disabled,
}) => {
  const classes = useStyles();
  const selected = Array.isArray(node.value) ? (node.value as unknown[]) : [];
  const toggle = (value: unknown, on: boolean) => {
    const options = node.field.options ?? [];
    // keep the definition's order
    const next = options
      .map((o) => o.value)
      .filter((v) => (v === value ? on : selected.includes(v)));
    form.setValue(node.path, next);
  };
  return (
    <Box sx={classes.fieldContainer}>
      <Box sx={classes.multiSelectRow} data-testid={`field-${testPath(node.path)}`}>
        {(node.field.options ?? []).map((option) => (
          <FormControlLabel
            key={String(option.value)}
            label={<Typography sx={classes.choiceLabel}>{option.label}</Typography>}
            control={
              <Checkbox
                size="small"
                checked={selected.includes(option.value)}
                onChange={(e) => toggle(option.value, e.target.checked)}
                disabled={disabled || node.field.readOnly}
              />
            }
          />
        ))}
      </Box>
      {error && <Box sx={classes.errorText}>{error}</Box>}
    </Box>
  );
};

/**
 * Renders a dynamic object field with key-value pairs (for objects with additionalProperties)
 */
export const KeyValueFieldRenderer: React.FC<FieldRendererProps> = ({
  node,
  form,
  disabled,
}) => {
  const classes = useStyles();
  const entries = node.entries ?? [];
  const isLocked = disabled || node.field.readOnly;

  return (
    <Box sx={classes.fieldContainer}>
      {/* Existing entries */}
      {entries.map((entry) => {
        const ValueRenderer = getFieldRenderer(entry.node) ?? TextAreaFieldRenderer;
        const keyError = entry.keyErrors[0];
        return (
          <Box key={entry.index} sx={classes.keyValueRow}>
            <TextField
              value={entry.key}
              onChange={(e) => form.setEntryKey(node.path, entry.index, e.target.value)}
              disabled={isLocked}
              error={!!keyError}
              helperText={keyError}
              size="small"
              sx={classes.keyValueKey}
              inputProps={{
                'data-testid': `field-${testPath(node.path)}-key-${entry.key}`,
                'aria-label': 'Key',
              }}
            />
            <Box sx={classes.keyValueValue}>
              <ValueRenderer
                node={entry.node}
                form={form}
                error={entry.node.errors[0]}
                disabled={isLocked}
              />
            </Box>
            <IconButton
              size="small"
              onClick={() => form.removeItem(node.path, entry.index)}
              disabled={isLocked}
              sx={classes.keyValueDeleteButton}
              aria-label={`Delete ${entry.key || 'entry'}`}
            >
              <Trash2 size={14} />
            </IconButton>
          </Box>
        );
      })}
      {!isLocked && (
        <Button
          variant="outlined"
          size="small"
          onClick={() => form.addEntry(node.path)}
          data-testid={`field-${testPath(node.path)}-add`}
          startIcon={<Plus size={14} />}
          sx={{ borderStyle: 'dashed', textTransform: 'none', my: 0.5 }}
        >
          Add entry
        </Button>
      )}
    </Box>
  );
};

/**
 * Get the renderer for a field. Objects and lists of objects return null: the
 * tree renders those as expandable nodes.
 */
export const getFieldRenderer = (
  node: ViewNode
): React.FC<FieldRendererProps> | null => {
  switch (node.field.kind) {
    case 'text':
    case 'url':
      return StringFieldRenderer;
    case 'secret':
      return SecretFieldRenderer;
    case 'textarea':
    case 'json':
      return TextAreaFieldRenderer;
    case 'select':
      return SelectFieldRenderer;
    case 'boolean':
      return BooleanFieldRenderer;
    case 'integer':
    case 'number':
      return NumberFieldRenderer;
    case 'constant':
      return ConstantFieldRenderer;
    case 'list':
      return SimpleArrayFieldRenderer;
    case 'multiselect':
      return MultiSelectFieldRenderer;
    case 'map':
      return KeyValueFieldRenderer;
    default:
      return null;
  }
};

/** The error to show inline for a field renderer. */
export const fieldError = (node: ViewNode): string | undefined =>
  node.field.kind === 'list' || node.field.kind === 'multiselect'
    ? listError(node)
    : node.errors[0];
