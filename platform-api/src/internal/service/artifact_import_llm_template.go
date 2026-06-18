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

// llmProviderTemplateImporter imports LLM Provider Template artifacts. Templates are
// organization-level configuration: they are not backed by the artifacts table and
// have no per-gateway deployment lifecycle.
type llmProviderTemplateImporter struct {
	templateRepo repository.LLMProviderTemplateRepository
}

func newLLMProviderTemplateImporter(templateRepo repository.LLMProviderTemplateRepository) *llmProviderTemplateImporter {
	return &llmProviderTemplateImporter{templateRepo: templateRepo}
}

func (i *llmProviderTemplateImporter) Kind() string          { return constants.LLMProviderTemplate }
func (i *llmProviderTemplateImporter) RequiresProject() bool { return false }

func (i *llmProviderTemplateImporter) Import(ctx *ImportContext) (*ImportResult, error) {
	version := importVersion(ctx)

	// Decode the configuration-bearing fields without clobbering identity fields.
	var specTmpl model.LLMProviderTemplate
	if err := decodeSpec(ctx.Configuration.Spec, &specTmpl); err != nil {
		return nil, err
	}

	// Templates are not in the artifacts table, so the orchestrator cannot resolve them
	// by handle; resolve existence here by handle (metadata.name). When found, the
	// template keeps its own control-plane UUID; ctx.ID (a freshly generated UUID) is
	// used only when creating a new template.
	existing, err := i.templateRepo.GetByID(importHandle(ctx), ctx.OrgID)
	if err != nil {
		return nil, fmt.Errorf("failed to look up existing LLM provider template: %w", err)
	}

	if existing == nil {
		tmpl := &model.LLMProviderTemplate{
			UUID:             ctx.ID,
			OrganizationUUID: ctx.OrgID,
			ID:               importHandle(ctx),
			Name:             importDisplayName(ctx),
			Origin:           constants.OriginDP,
			Metadata:         specTmpl.Metadata,
			PromptTokens:     specTmpl.PromptTokens,
			CompletionTokens: specTmpl.CompletionTokens,
			TotalTokens:      specTmpl.TotalTokens,
			RemainingTokens:  specTmpl.RemainingTokens,
			RequestModel:     specTmpl.RequestModel,
			ResponseModel:    specTmpl.ResponseModel,
			ResourceMappings: specTmpl.ResourceMappings,
		}
		if err := i.templateRepo.Create(tmpl); err != nil {
			return nil, fmt.Errorf("failed to create LLM provider template from gateway import: %w", err)
		}
		return &ImportResult{ID: tmpl.UUID, DeployedVersion: version, Deployable: false}, nil
	}

	// Existing: only the metadata-owning gateway may overwrite a DP template; a
	// CP-owned template is never overwritten. Templates have no gateway-specific data.
	if shouldWriteMetadata(&model.Artifact{Origin: existing.Origin}, ctx.SyncMetadata) {
		existing.Name = importDisplayName(ctx)
		existing.Metadata = specTmpl.Metadata
		existing.PromptTokens = specTmpl.PromptTokens
		existing.CompletionTokens = specTmpl.CompletionTokens
		existing.TotalTokens = specTmpl.TotalTokens
		existing.RemainingTokens = specTmpl.RemainingTokens
		existing.RequestModel = specTmpl.RequestModel
		existing.ResponseModel = specTmpl.ResponseModel
		existing.ResourceMappings = specTmpl.ResourceMappings
		if err := i.templateRepo.Update(existing); err != nil {
			return nil, fmt.Errorf("failed to update LLM provider template from gateway import: %w", err)
		}
	}
	// Return the template's own control-plane UUID, not the orchestrator-generated one.
	return &ImportResult{ID: existing.UUID, DeployedVersion: version, Deployable: false}, nil
}
