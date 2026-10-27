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

import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Card,
  Divider,
  InputAdornment,
  Skeleton,
  TextField,
  Typography,
} from '@wso2/oxygen-ui';
import { ArrowRight, Clock, Plus, Search } from '@wso2/oxygen-ui-icons-react';
import { formatRelativeTime } from '../../../../contexts/ApplicationsContext';
import type { ProjectBase } from '../../../../utils/types';

/** Rows shown at once; the rest are reached through "View all". */
export const MAX_PROJECT_ROWS = 5;

type ProjectsCardProps = {
  projects: ProjectBase[];
  isLoading?: boolean;
  /** Proxies per project handle; a project missing from the map shows none. */
  proxiesByProject: Record<string, number>;
  isProxyCountLoading?: boolean;
  canCreate: boolean;
  onOpenProject: (project: ProjectBase) => void;
  onCreateProject: () => void;
  onViewAll: () => void;
};

const timeOf = (project: ProjectBase): number =>
  new Date(project.updatedAt || project.createdAt || 0).getTime();

export default function ProjectsCard({
  projects,
  isLoading,
  proxiesByProject,
  isProxyCountLoading,
  canCreate,
  onOpenProject,
  onCreateProject,
  onViewAll,
}: ProjectsCardProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const total = projects.length;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...projects]
      .filter(
        (project) =>
          !needle || (project.displayName ?? '').toLowerCase().includes(needle)
      )
      .sort((a, b) => timeOf(b) - timeOf(a))
      .slice(0, MAX_PROJECT_ROWS);
  }, [projects, query]);

  return (
    <Card variant="outlined" sx={{ width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          p: 2.5,
        }}
      >
        <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 500 }}>
          Projects
        </Typography>
        <Divider orientation="vertical" flexItem />
        <Typography variant="body2" color="text.secondary">
          {isLoading ? '—' : total}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder="Search projects"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ width: 240 }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search projects' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} aria-hidden />
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          variant="outlined"
          sx={{ borderRadius: '20px' }}
          startIcon={<Plus size={16} aria-hidden />}
          disabled={!canCreate}
          onClick={onCreateProject}
        >
          New project
        </Button>
      </Box>
      <Divider />

      {isLoading ? (
        <Box sx={{ p: 2.5 }}>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} height={48} />
          ))}
        </Box>
      ) : rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2.5 }}>
          {query.trim()
            ? `No projects match "${query.trim()}".`
            : 'No projects available.'}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {rows.map((project, index) => {
            const proxyCount = proxiesByProject[project.id] ?? 0;
            return (
              <Box
                component="li"
                key={project.id}
                sx={{
                  borderTop: index === 0 ? 'none' : '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={() => onOpenProject(project)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    width: '100%',
                    px: 2.5,
                    py: 1.5,
                    font: 'inherit',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: 'none',
                    bgcolor: 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Avatar
                    aria-hidden
                    sx={(theme) => ({
                      width: 36,
                      height: 36,
                      color: 'common.white',
                      background: theme.gradient.primary,
                    })}
                  >
                    {(project.displayName || '?').charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body1"
                      noWrap
                      sx={{ fontWeight: 500 }}
                    >
                      {project.displayName || 'No name'}
                    </Typography>
                    {project.description?.trim() ? (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {project.description.trim()}
                      </Typography>
                    ) : null}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {isProxyCountLoading ? (
                      <Skeleton width={56} />
                    ) : (
                      `${proxyCount} ${proxyCount === 1 ? 'proxy' : 'proxies'}`
                    )}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      color: 'text.secondary',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Clock size={14} aria-hidden />
                    <Typography variant="caption">
                      {formatRelativeTime(project.updatedAt || project.createdAt)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Button
          variant="text"
          endIcon={<ArrowRight size={16} aria-hidden />}
          onClick={onViewAll}
        >
          {`View all ${total} ${total === 1 ? 'project' : 'projects'}`}
        </Button>
      </Box>
    </Card>
  );
}
