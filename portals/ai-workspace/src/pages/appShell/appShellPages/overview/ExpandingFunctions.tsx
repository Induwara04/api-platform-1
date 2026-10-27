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

import React, { useEffect, useState } from 'react';
import { Box, ButtonBase, Typography } from '@wso2/oxygen-ui';
import type { CapabilityFunction } from './capabilities';

const CYCLE_MS = 3000;

type ExpandingFunctionsProps = {
  functions: CapabilityFunction[];
  /** Changes when the owner switches content, which restarts the cycle. */
  resetKey: string;
};

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

export default function ExpandingFunctions({
  functions,
  resetKey,
}: ExpandingFunctionsProps): React.JSX.Element {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setActive(0);
  }, [resetKey]);

  useEffect(() => {
    if (paused || reducedMotion || functions.length < 2) return undefined;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % functions.length),
      CYCLE_MS
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, functions.length, resetKey]);

  const activate = (index: number) => {
    setPaused(true);
    setActive(index);
  };
  const resume = () => setPaused(false);

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
      onMouseLeave={resume}
      onBlur={resume}
    >
      <Box sx={{ display: 'flex', gap: 1 }}>
        {functions.map((fn, index) => {
          const isActive = index === active;
          return (
            <ButtonBase
              key={fn.title}
              aria-label={fn.title}
              aria-pressed={isActive}
              data-active={isActive}
              onMouseEnter={() => activate(index)}
              onFocus={() => activate(index)}
              sx={(theme) => ({
                height: 44,
                minWidth: 44,
                borderRadius: '22px',
                px: '13px',
                justifyContent: 'flex-start',
                overflow: 'hidden',
                border: '1px solid',
                borderColor: isActive
                  ? `color-mix(in srgb, ${theme.palette.primary.main} 40%, transparent)`
                  : 'divider',
                color: 'text.primary',
                backgroundColor: isActive
                  ? `color-mix(in srgb, ${theme.palette.primary.main} 12%, transparent)`
                  : 'action.hover',
                transition: reducedMotion
                  ? 'none'
                  : 'background-color 400ms, border-color 400ms, color 400ms',
              })}
            >
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  flexShrink: 0,
                  color: isActive ? 'primary.main' : 'text.secondary',
                }}
              >
                {fn.icon}
              </Box>
              <Box
                component="span"
                sx={{
                  maxWidth: isActive ? 220 : 0,
                  ml: isActive ? 1 : 0,
                  pr: isActive ? '5px' : 0,
                  opacity: isActive ? 1 : 0,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: reducedMotion
                    ? 'none'
                    : 'max-width 400ms cubic-bezier(0.4,0,0.2,1), margin 400ms cubic-bezier(0.4,0,0.2,1), padding 400ms cubic-bezier(0.4,0,0.2,1), opacity 400ms cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {fn.title}
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        aria-live="polite"
        sx={{ fontSize: 13 }}
      >
        {functions[active]?.hint}
      </Typography>
    </Box>
  );
}
