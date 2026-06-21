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

// llmProxyImporter imports LLM Proxy artifacts (project-scoped).
type llmProxyImporter struct {
	proxyRepo    repository.LLMProxyRepository
	artifactRepo repository.ArtifactRepository
}

func newLLMProxyImporter(proxyRepo repository.LLMProxyRepository, artifactRepo repository.ArtifactRepository) *llmProxyImporter {
	return &llmProxyImporter{proxyRepo: proxyRepo, artifactRepo: artifactRepo}
}

func (i *llmProxyImporter) Kind() string          { return constants.LLMProxy }
func (i *llmProxyImporter) RequiresProject() bool { return true }

func (i *llmProxyImporter) Import(ctx *ImportContext) (*ImportResult, error) {
	version := importVersion(ctx)

	// The proxy CR carries the provider as an object ({id: <handle>, auth: ...}), whereas
	// the control plane's LLMProxyConfig stores it flattened as the provider handle string.
	// Extract the handle and decode the rest of the spec without "provider" so the generic
	// decoder does not fail trying to unmarshal an object into a string field.
	providerHandle := specProviderHandle(ctx.Configuration.Spec)
	var cfg model.LLMProxyConfig
	if err := decodeSpec(specWithout(ctx.Configuration.Spec, "provider"), &cfg); err != nil {
		return nil, err
	}
	cfg.Provider = providerHandle
	// Lift the gateway's security policy back into the first-class Security field.
	// (LLM proxies have no rate-limiting field, so any rate-limit policies — which the
	// proxy flow does not emit — are simply not carried over.)
	security, _, remaining := liftLLMPolicies(cfg.Policies)
	cfg.Security, cfg.Policies = security, remaining

	if ctx.Existing == nil {
		// spec.provider is the provider's handle (artifacts carry no UUIDs in the
		// gateway). Resolve it to the provider's control-plane UUID (provider_uuid is a
		// FK); a missing provider surfaces as a clean error rather than a raw FK failure.
		providerUUID, err := i.resolveProviderUUID(cfg.Provider, ctx.OrgID)
		if err != nil {
			return nil, err
		}
		proxy := &model.LLMProxy{
			UUID:             ctx.ID,
			OrganizationUUID: ctx.OrgID,
			ID:               importHandle(ctx),
			Name:             importDisplayName(ctx),
			ProjectUUID:      ctx.ProjectID,
			Version:          version,
			ProviderUUID:     providerUUID,
			Status:           "CREATED",
			Origin:           constants.OriginDP,
			Configuration:    cfg,
		}
		if err := i.proxyRepo.Create(proxy); err != nil {
			return nil, fmt.Errorf("failed to create LLM proxy from gateway import: %w", err)
		}
		return &ImportResult{ID: proxy.UUID, DeployedVersion: version, Deployable: true}, nil
	}

	existing, err := i.proxyRepo.GetByID(ctx.Existing.Handle, ctx.OrgID)
	if err != nil {
		return nil, fmt.Errorf("failed to load existing LLM proxy: %w", err)
	}
	if existing == nil {
		return &ImportResult{ID: ctx.ID, DeployedVersion: version, Deployable: true}, nil
	}

	if shouldWriteMetadata(ctx.Existing, ctx.SyncMetadata) {
		existing.Name = importDisplayName(ctx)
		existing.Version = version
		existing.ProjectUUID = ctx.ProjectID
		// Resolve the (possibly changed) provider handle to its CP UUID before persisting.
		providerUUID, err := i.resolveProviderUUID(cfg.Provider, ctx.OrgID)
		if err != nil {
			return nil, err
		}
		existing.ProviderUUID = providerUUID
		existing.Configuration = cfg
	} else {
		// CP-owned (or non-syncing gateway): only update gateway-specific upstream auth.
		existing.Configuration.UpstreamAuth = cfg.UpstreamAuth
	}
	if err := i.proxyRepo.Update(existing); err != nil {
		return nil, fmt.Errorf("failed to update LLM proxy from gateway import: %w", err)
	}
	return &ImportResult{ID: ctx.ID, DeployedVersion: version, Deployable: true}, nil
}

// resolveProviderUUID resolves the LLM provider handle referenced by the proxy spec
// (spec.provider is the provider handle, not a UUID — gateway artifacts carry no UUIDs)
// to the provider's control-plane UUID. Returns a clean ErrInvalidInput if the provider
// does not exist, instead of letting a missing reference surface as a raw FK error.
func (i *llmProxyImporter) resolveProviderUUID(providerHandle, orgID string) (string, error) {
	if providerHandle == "" {
		return "", fmt.Errorf("%w: LLM proxy import requires a provider reference", constants.ErrInvalidInput)
	}
	art, err := i.artifactRepo.GetByHandle(providerHandle, orgID)
	if err != nil {
		return "", fmt.Errorf("failed to validate referenced LLM provider %q: %w", providerHandle, err)
	}
	if art == nil || art.Kind != constants.LLMProvider {
		return "", fmt.Errorf("%w: referenced LLM provider %q does not exist", constants.ErrInvalidInput, providerHandle)
	}
	return art.UUID, nil
}
