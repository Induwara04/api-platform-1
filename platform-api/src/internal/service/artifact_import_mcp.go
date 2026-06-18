/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org) All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

package service

import (
	"fmt"

	"platform-api/src/internal/constants"
	"platform-api/src/internal/model"
	"platform-api/src/internal/repository"
)

// mcpProxyImporter imports MCP Proxy artifacts (project-scoped).
type mcpProxyImporter struct {
	mcpProxyRepo repository.MCPProxyRepository
	artifactRepo repository.ArtifactRepository
}

func newMCPProxyImporter(mcpProxyRepo repository.MCPProxyRepository, artifactRepo repository.ArtifactRepository) *mcpProxyImporter {
	return &mcpProxyImporter{mcpProxyRepo: mcpProxyRepo, artifactRepo: artifactRepo}
}

func (i *mcpProxyImporter) Kind() string          { return constants.MCPProxy }
func (i *mcpProxyImporter) RequiresProject() bool { return true }

func (i *mcpProxyImporter) Import(ctx *ImportContext) (*ImportResult, error) {
	version := importVersion(ctx)

	var cfg model.MCPProxyConfiguration
	if err := decodeSpec(ctx.Configuration.Spec, &cfg); err != nil {
		return nil, err
	}

	if ctx.Existing == nil {
		projectID := ctx.ProjectID
		proxy := &model.MCPProxy{
			UUID:             ctx.ID,
			Handle:           importHandle(ctx),
			OrganizationUUID: ctx.OrgID,
			ProjectUUID:      &projectID,
			Name:             importDisplayName(ctx),
			Version:          version,
			Status:           "CREATED",
			Origin:           constants.OriginDP,
			Configuration:    cfg,
		}
		if err := i.mcpProxyRepo.Create(proxy); err != nil {
			return nil, fmt.Errorf("failed to create MCP proxy from gateway import: %w", err)
		}
		return &ImportResult{ID: proxy.UUID, DeployedVersion: version, Deployable: true}, nil
	}

	existing, err := i.mcpProxyRepo.GetByUUID(ctx.ID, ctx.OrgID)
	if err != nil {
		return nil, fmt.Errorf("failed to load existing MCP proxy: %w", err)
	}
	if existing == nil {
		return &ImportResult{ID: ctx.ID, DeployedVersion: version, Deployable: true}, nil
	}

	if shouldWriteMetadata(ctx.Existing, ctx.SyncMetadata) {
		existing.Name = importDisplayName(ctx)
		existing.Version = version
		projectID := ctx.ProjectID
		existing.ProjectUUID = &projectID
		existing.Configuration = cfg
	} else {
		// CP-owned (or non-syncing gateway): only update gateway-specific upstream.
		existing.Configuration.Upstream = cfg.Upstream
	}
	if err := i.mcpProxyRepo.Update(existing); err != nil {
		return nil, fmt.Errorf("failed to update MCP proxy from gateway import: %w", err)
	}
	return &ImportResult{ID: ctx.ID, DeployedVersion: version, Deployable: true}, nil
}
