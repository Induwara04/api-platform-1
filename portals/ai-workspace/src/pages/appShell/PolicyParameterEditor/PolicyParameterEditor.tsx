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

import React, { useState, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { Alert, Box, Button, Chip, Typography, Card, CardContent, Checkbox, FormControlLabel } from '@wso2/oxygen-ui';
import { ParameterValues, PolicyDefinition } from './types';
import {
  createPolicyForm,
  type PolicyDefinition as EngineDefinition,
  type Resolution,
} from './engine';
import SchemaTree from './SchemaTree';
import { useStyles } from './styles';

// Max lines to show before truncating description
const MAX_DESCRIPTION_LINES = 5;

/**
 * Format description text:
 * - Collapse single newlines within paragraphs to spaces
 * - Preserve paragraph breaks (double newlines)
 * - Preserve bullet points (lines starting with - or *)
 */
function formatDescriptionText(text: string): string {
  if (!text) return '';

  const trimmed = text.trim();

  // Split by double newlines (paragraph breaks)
  const paragraphs = trimmed.split(/\n\n+/);

  return paragraphs
    .map((paragraph) => {
      // Check if paragraph contains bullet points
      const lines = paragraph.split('\n');
      const hasBullets = lines.some((line) => /^\s*[-*•]/.test(line));

      if (hasBullets) {
        // Keep bullet point formatting, but collapse non-bullet continuation lines
        const result: string[] = [];
        let currentLine = '';

        for (const line of lines) {
          if (/^\s*[-*•]/.test(line)) {
            // This is a bullet point line
            if (currentLine) {
              result.push(currentLine);
            }
            currentLine = line;
          } else if (line.trim() === '') {
            // Empty line
            if (currentLine) {
              result.push(currentLine);
              currentLine = '';
            }
          } else {
            // Continuation of previous line
            currentLine = currentLine ? `${currentLine} ${line.trim()}` : line;
          }
        }
        if (currentLine) {
          result.push(currentLine);
        }
        return result.join('\n');
      } else {
        // Regular paragraph - collapse all newlines to spaces
        return paragraph.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      }
    })
    .join('\n\n');
}

/**
 * Component to render header description with show more/less
 */
const TruncatedHeaderDescription: React.FC<{
  description: string;
  classes: ReturnType<typeof useStyles>;
}> = ({ description, classes }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const formatted = formatDescriptionText(description);
  const lineCount = formatted.split('\n').length;
  const needsTruncation = lineCount > MAX_DESCRIPTION_LINES;

  if (!needsTruncation) {
    return <Typography sx={classes.headerDescription}>{formatted}</Typography>;
  }

  return (
    <>
      <Typography
        variant="body1"
        component="div"
        sx={
          isExpanded
            ? classes.headerDescription
            : classes.headerDescriptionTruncated
        }
      >
        {formatted}
      </Typography>
      <Box
        component="span"
        sx={classes.showMoreButton}
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer' }}
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </Box>
    </>
  );
};

interface PolicyParameterEditorProps {
  policyDefinition: PolicyDefinition;
  policyDisplayName?: string;
  existingValues?: ParameterValues;
  onCancel: () => void;
  onSubmit: (values: ParameterValues) => void;
  disabled?: boolean;
  // readOnly renders the parameters for viewing only: every field is
  // non-editable and the submit action is hidden, but the values remain visible
  // and the close/cancel action stays enabled.
  readOnly?: boolean;
}

/**
 * Mirrors the old "level one" check that keeps Add/Update disabled: every
 * required top-level field has a value (a required list has at least one item)
 * and every top-level "configure at least one" group has a selection.
 */
function isLevelOneValid(resolution: Resolution): boolean {
  const topLevel = resolution.errors.some(
    (e) => e.path.length <= 1 && /^(Required|Select at least)/.test(e.message)
  );
  if (topLevel) return false;
  return !(resolution.view.children ?? []).some(
    (c) =>
      c.visible &&
      c.required &&
      (c.field.kind === 'list' || c.field.kind === 'objectList' || c.field.kind === 'multiselect') &&
      (c.items?.length ?? 0) === 0
  );
}

/**
 * PolicyParameterEditor - A dynamic form editor for policy parameters
 * based on JSON Schema-like definitions from YAML policy files.
 *
 * The form logic (which fields show, which are required, defaults, validation,
 * and the values to submit) comes from ./engine. This component renders it.
 */
const PolicyParameterEditor: React.FC<PolicyParameterEditorProps> = ({
  policyDefinition,
  policyDisplayName,
  existingValues,
  onCancel,
  onSubmit,
  disabled = false,
  readOnly = false,
}) => {
  const classes = useStyles();
  const { name, description } = policyDefinition;

  // Use policyDisplayName if provided, then the definition's displayName, then its name
  const displayName = policyDisplayName || policyDefinition.displayName || name;

  // One form per policy definition. existingValues seeds it; defaults fill the rest.
  const form = useMemo(
    () =>
      createPolicyForm(policyDefinition as unknown as EngineDefinition, {
        initialConfig: existingValues,
      }),
    // existingValues changes are applied by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policyDefinition]
  );
  const resolution = useSyncExternalStore(form.subscribe, form.getResolution, form.getResolution);

  // Errors are shown after the first submit attempt, as before
  const [showErrors, setShowErrors] = useState(false);

  const canSubmit = useMemo(() => isLevelOneValid(resolution), [resolution]);

  useEffect(() => {
    if (existingValues) {
      form.reset(existingValues);
    }
  }, [existingValues, form]);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const current = form.getResolution();
    if (!current.valid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    // `config` holds typed values (numbers, booleans, objects), leaves out fields
    // hidden by a choice or rule, and omits optional values that were never set.
    onSubmit(current.config as ParameterValues);
  }, [form, onSubmit]);

  const errorCount = resolution.errors.length;

  return (
    <Box sx={[classes.root, { containerType: 'inline-size', containerName: 'policy-editor' }]}>
      {/* Header */}
      <Box sx={classes.header}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h5" sx={classes.headerTitle}>{displayName}</Typography>
          <Chip label={`v${policyDefinition.version.replace(/^v+/i, '')}`} size="small" variant="outlined"
            sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.secondary' }} />
          <FormControlLabel
            label="Show all errors"
            sx={{ ml: 'auto', mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
            control={<Checkbox size="small" checked={showErrors} onChange={(_, checked) => setShowErrors(checked)} />}
          />
        </Box>
        {description && (
          <TruncatedHeaderDescription
            description={description}
            classes={classes}
          />
        )}
      </Box>

      {/* Shown after a submit attempt that found problems */}
      {showErrors && errorCount > 0 && (
        <Alert severity="error" sx={{ mb: 1 }} data-testid="policy-param-errors">
          {errorCount === 1
            ? 'Fix the highlighted field to continue.'
            : `Fix the ${errorCount} highlighted fields to continue.`}
        </Alert>
      )}

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        '@container policy-editor (min-width: 760px)': {
          gridTemplateColumns: 'minmax(0, 1fr) 200px',
        },
        gap: 2,
        alignItems: 'start',
      }}>
        <Card>
          <CardContent>
            <SchemaTree
              view={resolution.view}
              form={form}
              showErrors={showErrors}
              disabled={disabled || readOnly}
            />
          </CardContent>
        </Card>
        <Card component="aside" aria-label="Policy validation status" data-testid="policy-status">
          <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: errorCount ? 1 : 0 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ fontSize: '0.75rem' }}>Status</Typography>
              <Chip size="small" sx={{ height: 20, fontSize: '0.6875rem' }} color={errorCount ? 'default' : 'success'}
                variant={errorCount ? 'outlined' : 'filled'} label={errorCount ? `${errorCount} to fix` : 'Valid'} />
            </Box>
            <Box aria-live="polite" aria-atomic="true">
              {errorCount > 0 && (
                <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                  {resolution.errors.map((error, index) => (
                    <Box component="li" key={`${error.pathKey}-${index}`} sx={{ mb: 0.5, lineHeight: 1.4, overflowWrap: 'anywhere', '&:last-child': { mb: 0 } }}>
                      <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', mr: 0.75 }}>
                        {error.path.join('.') || 'Parameters'}
                      </Typography>
                      <Typography component="span" variant="body2" sx={{ fontSize: '0.6875rem', color: 'error.main' }}>{error.message}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Action Buttons */}
      <Box sx={classes.buttonContainer}>
        <Button
          variant="outlined"
          color="secondary"
          onClick={onCancel}
          data-testid="policy-param-cancel"
          disabled={disabled}
        >
          {readOnly ? 'Close' : 'Cancel'}
        </Button>
        {!readOnly && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            data-testid="policy-param-submit"
            disabled={disabled || !canSubmit}
          >
            {existingValues ? 'Update' : 'Add'}
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default PolicyParameterEditor;
