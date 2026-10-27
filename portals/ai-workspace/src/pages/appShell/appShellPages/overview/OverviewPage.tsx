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

import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, PageContent, Typography } from '@wso2/oxygen-ui';
import { useAppAuth } from '../../../../contexts/AppAuthContext';
import { useAppShell } from '../../../../contexts/AppShellContext';
import { SCOPES } from '../../../../auth/permissions';
import { isFeatureEnabled } from '../../../../config.env';
import {
  buildOrgPath,
  buildProjectPath,
} from '../../../../utils/projectRouting';
import { trackOverviewPageView } from '../../../../utils/app-insights';
import type { ProjectBase } from '../../../../utils/types';
import { CAPABILITIES } from './capabilities';
import { useOrgOverviewCounts } from './useOrgOverviewCounts';
import CapabilityHero from './CapabilityHero';
import ProjectsCard from './ProjectsCard';
import ExploreMoreCard from '../projects/ExploreMoreCard';

const firstNameOf = (full: string | null, fallback: string): string => {
  const first = full?.trim().split(/\s+/)[0];
  return first || fallback;
};

export default function OverviewPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { user, hasPermission } = useAppAuth();
  const {
    userName,
    userEmail,
    currentOrganization,
    projectsForCurrentOrganization,
    isProjectsLoading,
    setCurrentProject,
  } = useAppShell();
  const { capabilities, proxiesByProject, isProxyCountLoading } =
    useOrgOverviewCounts();

  useEffect(() => {
    if (user?.email) {
      trackOverviewPageView(currentOrganization?.uuid, user.email, user.email);
    }
    // Page-view telemetry fires once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agent proxies stay hidden until their feature flag is on.
  const visibleCapabilities = useMemo(
    () =>
      CAPABILITIES.filter(
        (capability) =>
          capability.id !== 'agent-proxies' || isFeatureEnabled('agent-proxy')
      ),
    []
  );

  const greetingName = firstNameOf(
    userName,
    userEmail?.split('@')[0] || 'there'
  );

  const openProject = (project: ProjectBase) => {
    setCurrentProject(project);
    navigate(buildProjectPath(currentOrganization, project, '/home'));
  };

  return (
    <PageContent fullWidth>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Box>
          <Typography
            variant="h1"
            sx={{ fontSize: 30, fontWeight: 400, lineHeight: 1.2 }}
          >
            {'Hello, '}
            <Box
              component="span"
              sx={(theme) => ({
                fontWeight: 600,
                color: 'primary.main',
                background: theme.gradient.primary,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              })}
            >
              {greetingName}
            </Box>
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ fontSize: 17, lineHeight: 1.3, mt: 0.25 }}
          >
            What do you want to connect today?
          </Typography>
        </Box>

        <CapabilityHero
          capabilities={visibleCapabilities}
          counts={capabilities}
        />

        <ProjectsCard
          projects={projectsForCurrentOrganization}
          isLoading={isProjectsLoading}
          proxiesByProject={proxiesByProject}
          isProxyCountLoading={isProxyCountLoading}
          canCreate={hasPermission(SCOPES.PROJECT_CREATE)}
          onOpenProject={openProject}
          onCreateProject={() =>
            navigate(buildOrgPath(currentOrganization, '/projects/create'))
          }
          onViewAll={() =>
            navigate(buildOrgPath(currentOrganization, '/projects/list'))
          }
        />

        <ExploreMoreCard />
      </Box>
    </PageContent>
  );
}
