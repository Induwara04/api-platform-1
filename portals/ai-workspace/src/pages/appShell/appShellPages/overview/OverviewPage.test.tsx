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

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';

import { renderWithProviders, screen } from '../../../../test/utils';
import { CAPABILITIES } from './capabilities';
import CapabilityHero from './CapabilityHero';
import ExpandingFunctions from './ExpandingFunctions';
import ProjectsCard, { MAX_PROJECT_ROWS } from './ProjectsCard';
import type { CountState } from './useOrgOverviewCounts';
import type { ProjectBase } from '../../../../utils/types';

vi.mock('../../../../contexts/AppAuthContext', () => ({
  useAppAuth: () => ({ hasPermission: () => true }),
}));
vi.mock('../../../../contexts/AppShellContext', () => ({
  useAppShell: () => ({ currentOrganization: { handle: 'acme' } }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const counts = (
  providers: number,
  mcp: number
): Record<(typeof CAPABILITIES)[number]['id'], CountState> => ({
  'llm-providers': { count: providers, isLoading: false },
  'mcp-proxies': { count: mcp, isLoading: false },
  'agent-proxies': { count: 0, isLoading: false },
  gateways: { count: 0, isLoading: false },
});

describe('CapabilityHero', () => {
  beforeEach(() => navigate.mockClear());

  it('shows the selected capability and switches on tab click', async () => {
    const { user } = renderWithProviders(
      <CapabilityHero capabilities={CAPABILITIES} counts={counts(2, 0)} />
    );

    expect(screen.getByRole('tab', { name: /LLM providers/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(
      screen.getByText('Route your apps to any model through one endpoint')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 providers' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /MCP proxies/ }));

    expect(screen.getByRole('tab', { name: /MCP proxies/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(
      screen.getByText('Put your MCP servers behind the gateway')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '0 MCP proxies' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('routes the primary button to the create flow and the count to the list', async () => {
    const { user } = renderWithProviders(
      <CapabilityHero capabilities={CAPABILITIES} counts={counts(2, 0)} />
    );

    await user.click(screen.getByRole('button', { name: /Add LLM provider/ }));
    expect(navigate).toHaveBeenLastCalledWith(
      '/organizations/acme/service-provider/create'
    );

    await user.click(screen.getByRole('button', { name: '2 providers' }));
    expect(navigate).toHaveBeenLastCalledWith(
      '/organizations/acme/service-provider'
    );
  });

  it('shows a dash when a count failed and keeps create enabled', () => {
    renderWithProviders(
      <CapabilityHero
        capabilities={CAPABILITIES}
        counts={{
          ...counts(0, 0),
          'llm-providers': { count: null, isLoading: false },
        }}
      />
    );

    expect(
      screen.getByRole('button', { name: /Add LLM provider/ })
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: '— providers' })).toBeInTheDocument();
  });
});

describe('ExpandingFunctions', () => {
  const functions = CAPABILITIES[0].functions;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const activeTitle = () =>
    screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('data-active') === 'true')
      ?.getAttribute('aria-label');

  it('cycles the active function every 3 seconds', () => {
    renderWithProviders(
      <ExpandingFunctions functions={functions} resetKey="a" />
    );
    expect(activeTitle()).toBe(functions[0].title);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(activeTitle()).toBe(functions[1].title);
  });

  it('pauses on hover and resumes on mouse leave', () => {
    renderWithProviders(
      <ExpandingFunctions functions={functions} resetKey="a" />
    );
    const pills = screen.getAllByRole('button');

    fireEvent.mouseEnter(pills[2]);
    expect(activeTitle()).toBe(functions[2].title);

    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(activeTitle()).toBe(functions[2].title);

    fireEvent.mouseLeave(pills[2].parentElement as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(activeTitle()).toBe(functions[0].title);
  });

  it('resets to the first function when the content changes', () => {
    const { rerender } = renderWithProviders(
      <ExpandingFunctions functions={functions} resetKey="a" />
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(activeTitle()).toBe(functions[1].title);

    rerender(<ExpandingFunctions functions={functions} resetKey="b" />);
    expect(activeTitle()).toBe(functions[0].title);
  });
});

describe('ProjectsCard', () => {
  const project = (n: number): ProjectBase => ({
    id: `p${n}`,
    displayName: `Project ${n}`,
    organizationId: 'org',
    // Higher n is more recent.
    updatedAt: new Date(2026, 0, n + 1).toISOString(),
  });
  const projects = Array.from({ length: 8 }, (_, i) => project(i + 1));

  const renderCard = (list: ProjectBase[] = projects) =>
    renderWithProviders(
      <ProjectsCard
        projects={list}
        proxiesByProject={{ p8: 2 }}
        canCreate
        onOpenProject={vi.fn()}
        onCreateProject={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

  it('caps the list at five rows, most recent first', () => {
    renderCard();

    const names = screen
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    expect(names).toHaveLength(MAX_PROJECT_ROWS);
    expect(names[0]).toContain('Project 8');
    expect(names[4]).toContain('Project 4');
    expect(screen.queryByText('Project 3')).not.toBeInTheDocument();
    expect(screen.getByText('2 proxies')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /View all 8 projects/ })
    ).toBeInTheDocument();
  });

  it('filters by name and shows the empty text when nothing matches', async () => {
    const { user } = renderCard();
    const search = screen.getByRole('textbox', { name: 'Search projects' });

    await user.type(search, 'project 2');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Project 2')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('No projects match "zzz".')).toBeInTheDocument();
  });
});
