/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  Skeleton,
  Typography,
} from '@wso2/oxygen-ui';
import { ArrowRight, Plus } from '@wso2/oxygen-ui-icons-react';
import { useAppAuth } from '../../../../contexts/AppAuthContext';
import { useAppShell } from '../../../../contexts/AppShellContext';
import { buildOrgPath } from '../../../../utils/projectRouting';
import ExpandingFunctions from './ExpandingFunctions';
import type { Capability, CapabilityId } from './capabilities';
import type { CountState } from './useOrgOverviewCounts';

type CapabilityHeroProps = {
  capabilities: Capability[];
  counts: Record<CapabilityId, CountState>;
};

const countLabel = (state: CountState): string =>
  state.count === null ? '—' : String(state.count);

function statusText(capability: Capability, state: CountState): string {
  if (state.isLoading) return 'Loading';
  if (state.count === null) return 'Unavailable';
  if (state.count === 0) return capability.emptyStatus;
  return `${state.count} ${capability.activeStatus}`;
}

export default function CapabilityHero({
  capabilities,
  counts,
}: CapabilityHeroProps): React.JSX.Element {
  const navigate = useNavigate();
  const { hasPermission } = useAppAuth();
  const { currentOrganization } = useAppShell();
  const [selectedId, setSelectedId] = useState<CapabilityId>(
    capabilities[0].id
  );
  const selected =
    capabilities.find((capability) => capability.id === selectedId) ??
    capabilities[0];
  const selectedCount = counts[selected.id];
  const orgPath = (suffix: string) => buildOrgPath(currentOrganization, suffix);

  const linkNoun =
    selectedCount.count === 1 ? selected.singularNoun : selected.pluralNoun;

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: '14px',
        display: 'flex',
        flexWrap: 'wrap',
        overflow: 'hidden',
      }}
    >
      <Box
        role="tablist"
        aria-label="Capabilities"
        aria-orientation="vertical"
        onKeyDown={(event) => {
          const step =
            event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const index = capabilities.findIndex((c) => c.id === selected.id);
          const next =
            capabilities[
              (index + step + capabilities.length) % capabilities.length
            ];
          setSelectedId(next.id);
          document.getElementById(`capability-tab-${next.id}`)?.focus();
        }}
        sx={{
          flex: { xs: '1 1 280px', md: '0 0 36%' },
          minWidth: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          p: 1.5,
          position: 'relative',
          '&::after': {
            content: '""',
            display: { xs: 'none', md: 'block' },
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: '1px',
            bgcolor: 'divider',
          },
        }}
      >
        {capabilities.map((capability) => {
          const state = counts[capability.id];
          const isSelected = capability.id === selected.id;
          const hasItems = (state.count ?? 0) > 0;
          return (
            <Box
              key={capability.id}
              component="button"
              type="button"
              role="tab"
              id={`capability-tab-${capability.id}`}
              aria-selected={isSelected}
              aria-controls="capability-panel"
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelectedId(capability.id)}
              sx={(theme) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                width: '100%',
                flex: 1,
                px: 1.75,
                py: 1.25,
                textAlign: 'left',
                font: 'inherit',
                color: 'text.primary',
                cursor: 'pointer',
                borderRadius: '12px',
                border: '1px solid',
                borderColor: isSelected
                  ? `color-mix(in srgb, ${theme.palette.primary.main} 40%, transparent)`
                  : 'transparent',
                bgcolor: isSelected
                  ? `color-mix(in srgb, ${theme.palette.primary.main} 10%, transparent)`
                  : 'transparent',
                '&:hover': { bgcolor: 'action.selected' },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                },
              })}
            >
              <Box
                sx={(theme) => ({
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isSelected ? 'common.white' : 'primary.main',
                  background: isSelected
                    ? theme.gradient.primary
                    : theme.palette.action.selected,
                })}
              >
                {capability.icon}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {capability.label}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box
                    aria-hidden
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: hasItems ? 'success.main' : 'text.disabled',
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {statusText(capability, state)}
                  </Typography>
                </Box>
              </Box>
              {state.isLoading ? (
                <Skeleton width={20} />
              ) : (
                <Typography
                  variant="h6"
                  component="span"
                  sx={{
                    fontWeight: 300,
                    color: hasItems ? 'text.primary' : 'text.disabled',
                  }}
                >
                  {countLabel(state)}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      <Box
        role="tabpanel"
        id="capability-panel"
        aria-labelledby={`capability-tab-${selected.id}`}
        sx={(theme) => ({
          flex: '1 1 400px',
          minWidth: 0,
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          background: `radial-gradient(circle at top right, color-mix(in srgb, ${theme.palette.primary.main} 10%, transparent), transparent 55%)`,
        })}
      >
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: 'primary.main',
            mb: -1.5,
          }}
        >
          {selected.overline}
        </Typography>
        <Box>
          <Typography variant="h5" sx={{ fontSize: 24, fontWeight: 500 }}>
            {selected.headline}
          </Typography>
          <Typography
            color="text.secondary"
            sx={{
              fontSize: 14,
              lineHeight: 1.4,
              maxWidth: 560,
              mt: 1,
              opacity: 0.7,
            }}
          >
            {selected.description}
          </Typography>
        </Box>

        <ExpandingFunctions
          functions={selected.functions}
          resetKey={selected.id}
        />

        <Box
          sx={{
            mt: 'auto',
            pt: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="contained"
            sx={{ borderRadius: '20px' }}
            startIcon={<Plus size={16} aria-hidden />}
            disabled={!hasPermission(selected.createScope)}
            onClick={() => navigate(orgPath(selected.createPath))}
          >
            {selected.createLabel}
          </Button>
          <Button
            variant="text"
            endIcon={<ArrowRight size={16} aria-hidden />}
            sx={{
              color:
                selectedCount.count === 0 ? 'text.disabled' : 'primary.main',
            }}
            onClick={() => navigate(orgPath(selected.listPath))}
          >
            {selectedCount.isLoading
              ? `View ${selected.pluralNoun}`
              : `${countLabel(selectedCount)} ${linkNoun}`}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
