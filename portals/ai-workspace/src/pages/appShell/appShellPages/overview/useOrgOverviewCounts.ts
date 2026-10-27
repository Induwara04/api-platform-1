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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppShell } from '../../../../contexts/AppShellContext';
import { isFeatureEnabled } from '../../../../config.env';
import { PLATFORM_API_BASE_URL } from '../../../../paths';
import { logger } from '../../../../utils/logger';
import * as llmProviderApis from '../../../../apis/llmProviderApis';
import * as proxyApis from '../../../../apis/proxyApis';
import * as gatewayApis from '../../../../apis/gatewayApis';
import { mcpProxiesApis } from '../../../../apis/MCP/mcpProxiesApis';
import { agentProxiesApis } from '../../../../apis/agent/agentProxiesApis';
import type { CapabilityId } from './capabilities';

/** `count` is null until known or when its request failed. */
export type CountState = { count: number | null; isLoading: boolean };

export type OrgOverviewCounts = {
  capabilities: Record<CapabilityId, CountState>;
  /** Proxies (LLM, MCP and agent) per project handle. */
  proxiesByProject: Record<string, number>;
  isProxyCountLoading: boolean;
};

type ListLike = { count?: number; pagination?: { total?: number } };

// A one-item page is enough: only the server's total is read.
const totalOf = (response: ListLike): number =>
  response.pagination?.total ?? response.count ?? 0;

const LOADING: CountState = { count: null, isLoading: true };
const IDLE: CountState = { count: null, isLoading: false };

const initialCapabilities = (): Record<CapabilityId, CountState> => ({
  'llm-providers': LOADING,
  'mcp-proxies': LOADING,
  'agent-proxies': isFeatureEnabled('agent-proxy') ? LOADING : IDLE,
  gateways: LOADING,
});

/**
 * Organization-wide resource counts for the Overview page.
 *
 * Providers and gateways are organization-level. Proxies are listed per
 * project, so they are counted by asking every project for a single item and
 * reading the total. Each count settles independently, and a failed request
 * leaves that count null instead of blocking the others.
 */
export function useOrgOverviewCounts(): OrgOverviewCounts {
  const { currentOrganization, projectsForCurrentOrganization } = useAppShell();
  const organizationId = currentOrganization?.uuid ?? '';
  const [capabilities, setCapabilities] = useState(initialCapabilities);
  const [proxiesByProject, setProxiesByProject] = useState<
    Record<string, number>
  >({});
  const [isProxyCountLoading, setIsProxyCountLoading] = useState(true);
  const runRef = useRef(0);

  const settle = useCallback(
    (run: number, id: CapabilityId, count: number | null) => {
      if (runRef.current !== run) return;
      setCapabilities((prev) => ({
        ...prev,
        [id]: { count, isLoading: false },
      }));
    },
    []
  );

  useEffect(() => {
    const run = (runRef.current += 1);
    if (!organizationId) return;
    const agentEnabled = isFeatureEnabled('agent-proxy');
    const projectIds = projectsForCurrentOrganization.map(
      (project) => project.id
    );

    setCapabilities(initialCapabilities());
    setProxiesByProject({});
    setIsProxyCountLoading(true);

    const guarded = async (
      id: CapabilityId,
      fetchTotal: () => Promise<number>
    ) => {
      try {
        settle(run, id, await fetchTotal());
      } catch (err) {
        logger.error(`Failed to count ${id}:`, err);
        settle(run, id, null);
      }
    };

    void guarded('llm-providers', async () =>
      totalOf(
        await llmProviderApis.getLLMProviders(
          organizationId,
          PLATFORM_API_BASE_URL,
          1,
          0
        )
      )
    );
    void guarded('gateways', async () =>
      totalOf(await gatewayApis.getGateways(organizationId))
    );

    // Per project and kind; null marks a failed request.
    const perProject = async (projectId: string) => {
      const requests: Array<Promise<ListLike>> = [
        proxyApis.getProxies(
          organizationId,
          projectId,
          PLATFORM_API_BASE_URL,
          1,
          0
        ),
        mcpProxiesApis.getMCPServers(projectId, PLATFORM_API_BASE_URL, 1, 0),
        ...(agentEnabled
          ? [
              agentProxiesApis.getAgentProxies(
                projectId,
                PLATFORM_API_BASE_URL,
                1,
                0
              ),
            ]
          : []),
      ];
      return Promise.allSettled(
        requests.map((request) => request.then(totalOf))
      );
    };

    void (async () => {
      const results = await Promise.all(
        projectIds.map(async (projectId) => ({
          projectId,
          results: await perProject(projectId),
        }))
      );
      if (runRef.current !== run) return;

      const byProject: Record<string, number> = {};
      results.forEach(({ projectId, results: kindResults }) => {
        byProject[projectId] = kindResults.reduce(
          (sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0),
          0
        );
      });
      setProxiesByProject(byProject);
      setIsProxyCountLoading(false);

      // MCP is the 2nd request and agent proxies the 3rd of each project.
      const kindTotal = (index: number): number | null => {
        const settled = results.map((r) => r.results[index]);
        if (settled.some((r) => r.status === 'rejected')) return null;
        return settled.reduce(
          (sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0),
          0
        );
      };
      settle(run, 'mcp-proxies', kindTotal(1));
      if (agentEnabled) settle(run, 'agent-proxies', kindTotal(2));
    })();
  }, [organizationId, projectsForCurrentOrganization, settle]);

  return { capabilities, proxiesByProject, isProxyCountLoading };
}
