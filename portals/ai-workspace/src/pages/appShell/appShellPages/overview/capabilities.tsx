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

import type { ReactNode } from 'react';
import {
  Activity,
  Bot,
  BrainCircuit,
  Cloud,
  Filter,
  Fingerprint,
  Gauge,
  KeyRound,
  ListChecks,
  Network,
  Plug,
  ScrollText,
  Server,
  ShieldCheck,
  Shuffle,
} from '@wso2/oxygen-ui-icons-react';
import { SCOPES } from '../../../../auth/permissions';

export type CapabilityId =
  | 'llm-providers'
  | 'mcp-proxies'
  | 'agent-proxies'
  | 'gateways';

export type CapabilityFunction = {
  icon: ReactNode;
  title: string;
  hint: string;
};

export type Capability = {
  id: CapabilityId;
  label: string;
  icon: ReactNode;
  /** Status line when nothing exists yet. */
  emptyStatus: string;
  /** Status line suffix once at least one exists, e.g. "connected". */
  activeStatus: string;
  overline: string;
  headline: string;
  description: string;
  functions: CapabilityFunction[];
  createLabel: string;
  createScope: string;
  /** Suffix of the org route to the create flow. */
  createPath: string;
  /** Suffix of the org route to the list page. */
  listPath: string;
  singularNoun: string;
  pluralNoun: string;
};

const icon = (Icon: typeof Bot, size = 18) => <Icon size={size} aria-hidden />;

export const CAPABILITIES: Capability[] = [
  {
    id: 'llm-providers',
    label: 'LLM providers',
    icon: icon(BrainCircuit, 20),
    emptyStatus: 'Not set up',
    activeStatus: 'connected',
    overline: 'LLM PROVIDERS · APP LLM PROXIES',
    headline: 'Route your apps to any model through one endpoint',
    description:
      'Connect a provider once and give each app its own governed proxy.',
    functions: [
      {
        icon: icon(KeyRound),
        title: 'One key per app',
        hint: 'Provider credentials stay in the workspace.',
      },
      {
        icon: icon(Gauge),
        title: 'Rate limits and quotas',
        hint: 'Cap tokens and requests per app.',
      },
      {
        icon: icon(Shuffle),
        title: 'Model routing',
        hint: 'Switch or fail over between providers.',
      },
    ],
    createLabel: 'Add LLM provider',
    createScope: SCOPES.LLM_PROVIDER_CREATE,
    createPath: '/service-provider/create',
    listPath: '/service-provider',
    singularNoun: 'provider',
    pluralNoun: 'providers',
  },
  {
    id: 'mcp-proxies',
    label: 'MCP proxies',
    icon: icon(Plug, 20),
    emptyStatus: 'Not set up',
    activeStatus: 'active',
    overline: 'MCP PROXIES',
    headline: 'Put your MCP servers behind the gateway',
    description: 'Expose MCP servers to agents with access control.',
    functions: [
      {
        icon: icon(ShieldCheck),
        title: 'Authenticated access',
        hint: 'Only approved agents can connect.',
      },
      {
        icon: icon(ListChecks),
        title: 'Tool-level control',
        hint: 'Allow or hide individual tools.',
      },
      {
        icon: icon(ScrollText),
        title: 'Audit trail',
        hint: 'See which agent called which tool.',
      },
    ],
    createLabel: 'Create MCP proxy',
    createScope: SCOPES.MCP_PROXY_CREATE,
    createPath: '/mcp-proxy/create',
    listPath: '/mcp-proxy',
    singularNoun: 'MCP proxy',
    pluralNoun: 'MCP proxies',
  },
  {
    id: 'agent-proxies',
    label: 'Agent proxies',
    icon: icon(Bot, 20),
    emptyStatus: 'Not set up',
    activeStatus: 'active',
    overline: 'AGENT PROXIES',
    headline: 'Secure the traffic your agents generate',
    description: 'Govern the models and tools your agents call.',
    functions: [
      {
        icon: icon(Fingerprint),
        title: 'Agent identity',
        hint: 'Each agent gets its own credentials.',
      },
      {
        icon: icon(Filter),
        title: 'Guardrails',
        hint: 'Apply content and PII policies.',
      },
      {
        icon: icon(Activity),
        title: 'Observability',
        hint: 'Trace calls across models and tools.',
      },
    ],
    createLabel: 'Create agent proxy',
    createScope: SCOPES.AGENT_PROXY_CREATE,
    createPath: '/agent-proxy/create',
    listPath: '/agent-proxy',
    singularNoun: 'agent proxy',
    pluralNoun: 'agent proxies',
  },
  {
    id: 'gateways',
    label: 'AI gateways',
    icon: icon(Network, 20),
    emptyStatus: 'Not connected',
    activeStatus: 'connected',
    overline: 'AI GATEWAYS',
    headline: 'Choose where your proxies run',
    description: 'Run proxies on a managed or self-hosted gateway.',
    functions: [
      {
        icon: icon(Cloud),
        title: 'Managed',
        hint: 'Hosted and updated by WSO2.',
      },
      {
        icon: icon(Server),
        title: 'Self-hosted',
        hint: 'Runs in your cloud or data center.',
      },
      {
        icon: icon(Activity),
        title: 'Health monitoring',
        hint: 'Track status and uptime of each gateway.',
      },
    ],
    createLabel: 'Connect a gateway',
    createScope: SCOPES.GATEWAY_CREATE,
    createPath: '/gateways/create',
    listPath: '/gateways',
    singularNoun: 'gateway',
    pluralNoun: 'gateways',
  },
];
