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

// llmProviderImporter imports LLM Provider artifacts (organization-level).
type llmProviderImporter struct {
	providerRepo repository.LLMProviderRepository
	templateRepo repository.LLMProviderTemplateRepository
	artifactRepo repository.ArtifactRepository
}

func newLLMProviderImporter(providerRepo repository.LLMProviderRepository,
	templateRepo repository.LLMProviderTemplateRepository, artifactRepo repository.ArtifactRepository) *llmProviderImporter {
	return &llmProviderImporter{providerRepo: providerRepo, templateRepo: templateRepo, artifactRepo: artifactRepo}
}

func (i *llmProviderImporter) Kind() string          { return constants.LLMProvider }
func (i *llmProviderImporter) RequiresProject() bool { return false }

func (i *llmProviderImporter) Import(ctx *ImportContext) (*ImportResult, error) {
	version := importVersion(ctx)

	var cfg model.LLMProviderConfig
	if err := decodeSpec(ctx.Configuration.Spec, &cfg); err != nil {
		return nil, err
	}
	// The gateway carries security and rate-limiting as policies; lift them back into
	// the control plane's first-class Security/RateLimiting fields so the AI Workspace
	// renders them natively.
	cfg.Security, cfg.RateLimiting, cfg.Policies = liftLLMPolicies(cfg.Policies)

	if ctx.Existing == nil {
		templateUUID, err := i.resolveTemplateUUID(cfg.Template, ctx.OrgID)
		if err != nil {
			return nil, err
		}
		provider := &model.LLMProvider{
			UUID:             ctx.ID,
			OrganizationUUID: ctx.OrgID,
			ID:               importHandle(ctx),
			Name:             importDisplayName(ctx),
			Version:          version,
			TemplateUUID:     templateUUID,
			Status:           "CREATED",
			Origin:           constants.OriginDP,
			Configuration:    cfg,
		}
		if err := i.providerRepo.Create(provider); err != nil {
			return nil, fmt.Errorf("failed to create LLM provider from gateway import: %w", err)
		}
		return &ImportResult{ID: provider.UUID, DeployedVersion: version, Deployable: true}, nil
	}

	existing, err := i.providerRepo.GetByID(ctx.Existing.Handle, ctx.OrgID)
	if err != nil {
		return nil, fmt.Errorf("failed to load existing LLM provider: %w", err)
	}
	if existing == nil {
		return &ImportResult{ID: ctx.ID, DeployedVersion: version, Deployable: true}, nil
	}

	if shouldWriteMetadata(ctx.Existing, ctx.SyncMetadata) {
		existing.Name = importDisplayName(ctx)
		existing.Version = version
		existing.Configuration = cfg
		if cfg.Template != "" {
			templateUUID, err := i.resolveTemplateUUID(cfg.Template, ctx.OrgID)
			if err != nil {
				return nil, err
			}
			existing.TemplateUUID = templateUUID
		}
	} else {
		// CP-owned (or non-syncing gateway): only update gateway-specific upstream.
		existing.Configuration.Upstream = cfg.Upstream
	}
	if err := i.providerRepo.Update(existing); err != nil {
		return nil, fmt.Errorf("failed to update LLM provider from gateway import: %w", err)
	}
	return &ImportResult{ID: ctx.ID, DeployedVersion: version, Deployable: true}, nil
}

// resolveTemplateUUID resolves the template handle referenced by the provider spec
// to its UUID. The template must already exist (FK requirement).
func (i *llmProviderImporter) resolveTemplateUUID(templateHandle, orgID string) (string, error) {
	if templateHandle == "" {
		return "", fmt.Errorf("%w: LLM provider import requires a template reference", constants.ErrInvalidInput)
	}
	tmpl, err := i.templateRepo.GetByID(templateHandle, orgID)
	if err != nil {
		return "", fmt.Errorf("failed to resolve LLM provider template %q: %w", templateHandle, err)
	}
	if tmpl == nil {
		return "", fmt.Errorf("%w: referenced LLM provider template %q does not exist", constants.ErrInvalidInput, templateHandle)
	}
	return tmpl.UUID, nil
}
