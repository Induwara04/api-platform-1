/*
 * Copyright (c) 2026, WSO2 LLC (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { useEffect, useMemo, useState, type FC } from 'react';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@wso2/oxygen-ui';
import { ChevronLeft, ChevronRight, Flag } from '@wso2/oxygen-ui-icons-react';
import type { AIWorkspaceHostPort } from './hostPort';
import type { Environment, PromotionPath } from './types';
import { assembleEnvironments, orderEnvironments, type EnvironmentDTO } from './utils';

export type ProjectPipelineCardProps = {
  port: AIWorkspaceHostPort;
};

type PipelineDTO = {
  id: string;
  name: string;
  description?: string;
  promotionPaths?: PromotionPath[];
};
type PipelineListDTO = { list?: PipelineDTO[] };
type EnvironmentListDTO = { list?: EnvironmentDTO[] };
type ProjectPipelineDTO = { pipeline?: string };

type CardStage = { name: string; critical: boolean };
type CardData = { name: string; description?: string; stages: CardStage[] };

/** Stages shown at once; more than this turns the strip into a carousel. */
const VISIBLE_STAGES = 3;

const stageSx = (critical: boolean) => ({
  flex: 1,
  minWidth: 0,
  height: 64,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0.25,
  px: 0.5,
  borderRadius: 1.5,
  border: '1px solid',
  borderColor: critical ? 'error.main' : 'divider',
  color: critical ? 'error.light' : 'text.primary',
  bgcolor: critical ? 'transparent' : 'background.paper',
  backgroundImage: critical
    ? 'repeating-linear-gradient(135deg, rgba(244,67,54,0.14) 0 6px, transparent 6px 12px)'
    : undefined,
});

/**
 * Project overview card showing the deployment pipeline the project is bound to:
 * its name, optional description, a promotion-ordered stage strip (a carousel
 * past three environments) and, only when the pipeline has any, a "critical"
 * count. Renders nothing while loading, on error, or when no pipeline is bound,
 * so it never blocks or clutters the page it sits on.
 */
const ProjectPipelineCard: FC<ProjectPipelineCardProps> = ({ port }) => {
  const { apiFetch, projectHandle } = port;
  const [data, setData] = useState<CardData | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!projectHandle) {
      setData(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const binding = await apiFetch<ProjectPipelineDTO>(
          'GET',
          `/projects/${encodeURIComponent(projectHandle)}/deployment-pipeline`
        );
        const boundId = binding?.pipeline;
        if (!boundId) {
          if (!cancelled) setData(null);
          return;
        }
        const [pipelineList, environmentList] = await Promise.all([
          apiFetch<PipelineListDTO>('GET', '/pipelines'),
          apiFetch<EnvironmentListDTO>('GET', '/environments'),
        ]);
        const pipeline = (pipelineList?.list ?? []).find((candidate) => candidate.id === boundId);
        if (!pipeline) {
          if (!cancelled) setData(null);
          return;
        }
        const environments: Environment[] = assembleEnvironments(environmentList?.list ?? []);
        const stages = orderEnvironments(pipeline.promotionPaths ?? []).map((name) => ({
          name,
          critical: environments.find((environment) => environment.name === name)?.critical ?? false,
        }));
        if (!cancelled) {
          setOffset(0);
          setData({
            name: pipeline.name,
            description: pipeline.description?.trim() || undefined,
            stages,
          });
        }
      } catch {
        // A decorative overview card: a failed read hides it rather than erroring the page.
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, projectHandle]);

  const stages = data?.stages ?? [];
  const criticalCount = useMemo(() => stages.filter((stage) => stage.critical).length, [stages]);

  if (!data || stages.length === 0) return null;

  const carousel = stages.length > VISIBLE_STAGES;
  const maxOffset = stages.length - VISIBLE_STAGES;
  const visible = carousel ? stages.slice(offset, offset + VISIBLE_STAGES) : stages;

  return (
    <Card variant="outlined" sx={{ borderRadius: '14px' }}>
      <CardHeader
        title="Deployment Pipeline"
        action={
          <Button size="small" variant="text" href="#">
            Change
          </Button>
        }
        slotProps={{
          title: { variant: 'subtitle2', color: 'text.secondary', sx: { fontWeight: 600 } },
        }}
        sx={{ px: 2.25, pt: 2.25, pb: 1 }}
      />
      <CardContent sx={{ px: 2.25, py: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {data.name}
        </Typography>
        {data.description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {data.description}
          </Typography>
        ) : null}
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 2 }}>
          {carousel ? (
            <IconButton
              size="small"
              aria-label="Previous stages"
              disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={16} />
            </IconButton>
          ) : null}
          {visible.map((stage, index) => (
            <Box key={stage.name} sx={{ display: 'contents' }}>
              {index > 0 ? (
                <Typography aria-hidden color="text.secondary" variant="body2">
                  →
                </Typography>
              ) : null}
              <Box sx={stageSx(stage.critical)}>
                {stage.critical ? <Flag size={14} aria-label="Critical" /> : null}
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ fontWeight: 600, color: 'inherit', maxWidth: '100%' }}
                >
                  {stage.name}
                </Typography>
              </Box>
            </Box>
          ))}
          {carousel ? (
            <IconButton
              size="small"
              aria-label="Next stages"
              disabled={offset >= maxOffset}
              onClick={() => setOffset((current) => Math.min(maxOffset, current + 1))}
            >
              <ChevronRight size={16} />
            </IconButton>
          ) : null}
        </Stack>
      </CardContent>
      {criticalCount > 0 ? (
        <>
          <Divider sx={{ mx: 2.25, mt: 2 }} />
          <CardActions sx={{ px: 2.25, py: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: 'error.main' }}>
              <Flag size={14} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {criticalCount} critical
              </Typography>
            </Stack>
          </CardActions>
        </>
      ) : (
        <Box sx={{ pb: 2.25 }} />
      )}
    </Card>
  );
};

export default ProjectPipelineCard;
