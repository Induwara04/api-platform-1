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
	"errors"
	"testing"
	"time"

	"platform-api/src/api"
	"platform-api/src/internal/constants"
	"platform-api/src/internal/dto"
	"platform-api/src/internal/model"
	"platform-api/src/internal/repository"
)

// ---------------------------------------------------------------------------
// Request builders for each gateway-pushed (DP) artifact kind. Each carries a
// data-plane UUID (dpID) that the control plane must NOT reuse, the handle
// (metadata.name) used to match an existing artifact, and a display name used
// to detect whether metadata was (re)written.
// ---------------------------------------------------------------------------

func dpTemplateReq(dpID, handle, displayName string) dto.ImportGatewayArtifactRequest {
	return dto.ImportGatewayArtifactRequest{
		ID:     dpID,
		Status: "deployed",
		Configuration: dto.ArtifactImportConfig{
			APIVersion: "api-platform.wso2.com/v1",
			Kind:       constants.LLMProviderTemplate,
			// Org-level kind: no project annotation.
			Metadata: dto.ArtifactImportMetadata{Name: handle},
			Spec:     map[string]interface{}{"displayName": displayName},
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

func dpProviderReq(dpID, handle, displayName, templateHandle string) dto.ImportGatewayArtifactRequest {
	return dto.ImportGatewayArtifactRequest{
		ID:     dpID,
		Status: "deployed",
		Configuration: dto.ArtifactImportConfig{
			APIVersion: "api-platform.wso2.com/v1",
			Kind:       constants.LLMProvider,
			// Org-level kind: no project annotation; references the template by handle.
			Metadata: dto.ArtifactImportMetadata{Name: handle},
			Spec: map[string]interface{}{
				"displayName": displayName,
				"version":     "v1.0",
				"template":    templateHandle,
			},
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

func dpProxyReq(dpID, handle, displayName, providerHandle string) dto.ImportGatewayArtifactRequest {
	return dto.ImportGatewayArtifactRequest{
		ID:     dpID,
		Status: "deployed",
		Configuration: dto.ArtifactImportConfig{
			APIVersion: "api-platform.wso2.com/v1",
			Kind:       constants.LLMProxy,
			// Project-scoped kind: project supplied via the project-id annotation.
			Metadata: dto.ArtifactImportMetadata{Name: handle, Annotations: projectAnnotations("default")},
			Spec: map[string]interface{}{
				"displayName": displayName,
				"version":     "v1.0",
				// The proxy CR references its provider by handle, encoded as an object.
				"provider": map[string]interface{}{"id": providerHandle},
			},
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

func dpMCPReq(dpID, handle, displayName string) dto.ImportGatewayArtifactRequest {
	return dto.ImportGatewayArtifactRequest{
		ID:     dpID,
		Status: "deployed",
		Configuration: dto.ArtifactImportConfig{
			APIVersion: "api-platform.wso2.com/v1",
			Kind:       constants.MCPProxy,
			Metadata:   dto.ArtifactImportMetadata{Name: handle, Annotations: projectAnnotations("default")},
			Spec: map[string]interface{}{
				"displayName": displayName,
				"version":     "v1.0",
				"context":     "/mcp",
			},
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

// undeployed returns a copy of req with an "undeployed" status (the push a gateway
// sends when the artifact is deleted from it).
func undeployed(req dto.ImportGatewayArtifactRequest) dto.ImportGatewayArtifactRequest {
	req.Status = "undeployed"
	return req
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

func mustImport(t *testing.T, d *importTestDeps, req dto.ImportGatewayArtifactRequest) *dto.ImportGatewayArtifactResponse {
	t.Helper()
	resp, err := d.svc.Import(importTestOrgID, importTestGatewayID, req)
	if err != nil {
		t.Fatalf("Import(kind=%s, handle=%s) error: %v", req.Configuration.Kind, req.Configuration.Metadata.Name, err)
	}
	return resp
}

// artifactByHandle returns the artifacts-table row (origin/kind/uuid/name) for a handle.
func artifactByHandle(t *testing.T, d *importTestDeps, handle string) *model.Artifact {
	t.Helper()
	art, err := d.artifactRepo.GetByHandle(handle, importTestOrgID)
	if err != nil {
		t.Fatalf("GetByHandle(%s): %v", handle, err)
	}
	return art
}

// depStatus returns the current deployment ID and status for an artifact on the gateway.
func depStatus(t *testing.T, d *importTestDeps, artifactUUID string) (string, model.DeploymentStatus) {
	t.Helper()
	depID, status, _, err := d.deployment.GetStatus(artifactUUID, importTestOrgID, importTestGatewayID)
	if err != nil {
		t.Fatalf("GetStatus(%s): %v", artifactUUID, err)
	}
	return depID, status
}

// ===========================================================================
// shouldWriteMetadata: the origin x sync_metadata decision matrix (unit test).
// This is the core rule that governs every kind's metadata-write behaviour.
// ===========================================================================

func TestShouldWriteMetadata_OriginSyncMatrix(t *testing.T) {
	cases := []struct {
		name         string
		existing     *model.Artifact
		syncMetadata bool
		want         bool
	}{
		{"new artifact, no sync", nil, false, true},
		{"new artifact, sync", nil, true, true},
		{"existing CP, no sync", &model.Artifact{Origin: constants.OriginCP}, false, false},
		{"existing CP, sync (CP always protected)", &model.Artifact{Origin: constants.OriginCP}, true, false},
		{"existing DP, no sync (this gateway does not own metadata)", &model.Artifact{Origin: constants.OriginDP}, false, false},
		{"existing DP, sync (metadata-owning gateway)", &model.Artifact{Origin: constants.OriginDP}, true, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldWriteMetadata(tc.existing, tc.syncMetadata); got != tc.want {
				t.Errorf("shouldWriteMetadata(%v, sync=%v) = %v, want %v", tc.existing, tc.syncMetadata, got, tc.want)
			}
		})
	}
}

// ===========================================================================
// REST API lifecycle
// ===========================================================================

func TestImport_RESTAPI_Lifecycle_SyncMetadata(t *testing.T) {
	d := setupImportTest(t, true) // this gateway owns metadata

	// 1. Create: CP mints its own UUID (not the DP UUID), origin DP, deployment recorded.
	resp := mustImport(t, d, restImportRequest("dp-rest-1", "weather", "Weather v1"))
	if resp.Origin != constants.OriginDP {
		t.Errorf("origin = %q, want DP", resp.Origin)
	}
	if resp.ID == "" || resp.ID == "dp-rest-1" {
		t.Errorf("response ID = %q, want a fresh CP UUID (not the DP UUID)", resp.ID)
	}
	cpID := resp.ID
	if art := artifactByHandle(t, d, "weather"); art == nil || art.Origin != constants.OriginDP || art.UUID != cpID || art.Kind != constants.RestApi {
		t.Fatalf("artifact = %+v, want origin DP, kind RestApi, uuid %s", art, cpID)
	}
	if depID, st := depStatus(t, d, cpID); depID == "" || st != model.DeploymentStatusDeployed {
		t.Errorf("after create: (%q,%q), want non-empty DEPLOYED", depID, st)
	}

	// 2. Re-push (new DP UUID, same handle), sync=true -> metadata updated, CP UUID reused.
	resp2 := mustImport(t, d, restImportRequest("dp-rest-2", "weather", "Weather v2"))
	if resp2.ID != cpID {
		t.Errorf("re-push ID = %q, want reuse of %q (matched by handle)", resp2.ID, cpID)
	}
	if name := artifactByHandle(t, d, "weather").Name; name != "Weather v2" {
		t.Errorf("name = %q, want updated to 'Weather v2' (sync_metadata=true)", name)
	}

	// 3. Undeploy (gateway delete): stays, marked undeployed, no new deployment.
	depBefore, _ := depStatus(t, d, cpID)
	mustImport(t, d, undeployed(restImportRequest("dp-rest-3", "weather", "Weather v2")))
	depAfter, st := depStatus(t, d, cpID)
	if st != model.DeploymentStatusUndeployed {
		t.Errorf("after undeploy status = %q, want UNDEPLOYED", st)
	}
	if depAfter != depBefore {
		t.Errorf("undeploy must not create a new deployment (before=%q after=%q)", depBefore, depAfter)
	}
	if artifactByHandle(t, d, "weather") == nil {
		t.Error("artifact removed on undeploy; it must remain")
	}

	// 4. Re-deploy: a NEW deployment is created and metadata updated.
	mustImport(t, d, restImportRequest("dp-rest-4", "weather", "Weather v3"))
	depRedeploy, st := depStatus(t, d, cpID)
	if st != model.DeploymentStatusDeployed {
		t.Errorf("after redeploy status = %q, want DEPLOYED", st)
	}
	if depRedeploy == "" || depRedeploy == depAfter {
		t.Errorf("redeploy must create a new deployment (undeploy=%q redeploy=%q)", depAfter, depRedeploy)
	}
	if name := artifactByHandle(t, d, "weather").Name; name != "Weather v3" {
		t.Errorf("name = %q, want 'Weather v3' after redeploy", name)
	}
}

func TestImport_RESTAPI_NoSyncPreservesMetadata(t *testing.T) {
	d := setupImportTest(t, false) // this gateway does NOT own metadata

	mustImport(t, d, restImportRequest("dp-rest-1", "weather", "First Name"))
	mustImport(t, d, restImportRequest("dp-rest-2", "weather", "Second Name"))

	if name := artifactByHandle(t, d, "weather").Name; name != "First Name" {
		t.Errorf("name = %q, want unchanged 'First Name' (sync_metadata=false)", name)
	}
}

// ===========================================================================
// LLM Provider Template lifecycle (organization-level, no deployment)
// ===========================================================================

func TestImport_LLMProviderTemplate_Lifecycle(t *testing.T) {
	d := setupImportTest(t, true)

	// Create: org-level, origin DP, NO deployment row, CP mints its own UUID.
	resp := mustImport(t, d, dpTemplateReq("dp-tmpl-1", "openai-tmpl", "OpenAI v1"))
	if resp.Origin != constants.OriginDP {
		t.Errorf("origin = %q, want DP", resp.Origin)
	}
	if resp.ID == "" || resp.ID == "dp-tmpl-1" {
		t.Errorf("response ID = %q, want a fresh CP UUID", resp.ID)
	}
	cpID := resp.ID

	tmpl, err := d.templateRepo.GetByID("openai-tmpl", importTestOrgID)
	if err != nil || tmpl == nil {
		t.Fatalf("GetByID: (%v, %v)", tmpl, err)
	}
	if tmpl.Origin != constants.OriginDP || tmpl.UUID != cpID || tmpl.Name != "OpenAI v1" {
		t.Errorf("template = %+v, want origin DP, uuid %s, name 'OpenAI v1'", tmpl, cpID)
	}
	if depID, _ := depStatus(t, d, cpID); depID != "" {
		t.Errorf("template must not have a deployment row, got %q", depID)
	}

	// Re-push with sync_metadata=true -> metadata updated, same CP UUID.
	resp2 := mustImport(t, d, dpTemplateReq("dp-tmpl-2", "openai-tmpl", "OpenAI v2"))
	if resp2.ID != cpID {
		t.Errorf("re-push ID = %q, want reuse of %q", resp2.ID, cpID)
	}
	tmpl2, _ := d.templateRepo.GetByID("openai-tmpl", importTestOrgID)
	if tmpl2.Name != "OpenAI v2" {
		t.Errorf("template name = %q, want updated 'OpenAI v2'", tmpl2.Name)
	}
}

func TestImport_LLMProviderTemplate_NoSyncPreservesMetadata(t *testing.T) {
	d := setupImportTest(t, false)

	mustImport(t, d, dpTemplateReq("dp-tmpl-1", "openai-tmpl", "First"))
	mustImport(t, d, dpTemplateReq("dp-tmpl-2", "openai-tmpl", "Second"))

	tmpl, _ := d.templateRepo.GetByID("openai-tmpl", importTestOrgID)
	if tmpl == nil || tmpl.Name != "First" {
		t.Errorf("template name = %v, want unchanged 'First' (sync_metadata=false)", tmpl)
	}
}

func TestImport_LLMProviderTemplate_CPOriginProtected(t *testing.T) {
	d := setupImportTest(t, true) // even with sync, a CP-origin template is protected

	// Pre-create a CP-origin template (created in the control plane).
	if err := d.templateRepo.Create(&model.LLMProviderTemplate{
		OrganizationUUID: importTestOrgID,
		ID:               "shared-tmpl",
		Name:             "Original CP Name",
		Origin:           constants.OriginCP,
	}); err != nil {
		t.Fatalf("seed CP template: %v", err)
	}

	// A gateway pushes a same-handle template; metadata must NOT be overwritten.
	mustImport(t, d, dpTemplateReq("dp-tmpl-x", "shared-tmpl", "Hacked Name"))

	tmpl, _ := d.templateRepo.GetByID("shared-tmpl", importTestOrgID)
	if tmpl == nil {
		t.Fatal("template missing after import")
	}
	if tmpl.Name != "Original CP Name" {
		t.Errorf("name = %q; CP-origin template metadata must not change", tmpl.Name)
	}
	if tmpl.Origin != constants.OriginCP {
		t.Errorf("origin = %q, want CP", tmpl.Origin)
	}
}

// ===========================================================================
// LLM Provider lifecycle (organization-level, deployment-backed,
// references its template by handle)
// ===========================================================================

func TestImport_LLMProvider_Lifecycle_SyncMetadata(t *testing.T) {
	d := setupImportTest(t, true)
	mustImport(t, d, dpTemplateReq("dp-t", "prov-tmpl", "T")) // prerequisite template

	// Create.
	resp := mustImport(t, d, dpProviderReq("dp-prov-1", "openai", "OpenAI v1", "prov-tmpl"))
	if resp.Origin != constants.OriginDP || resp.ID == "" || resp.ID == "dp-prov-1" {
		t.Fatalf("create resp = %+v, want DP origin + fresh CP UUID", resp)
	}
	cpID := resp.ID
	if art := artifactByHandle(t, d, "openai"); art.Origin != constants.OriginDP || art.Kind != constants.LLMProvider || art.UUID != cpID {
		t.Fatalf("artifact = %+v, want origin DP, kind LlmProvider, uuid %s", art, cpID)
	}
	// The provider's template reference (a handle) must resolve to the template's CP UUID.
	tmplArt, _ := d.templateRepo.GetByID("prov-tmpl", importTestOrgID)
	prov, err := repository.NewLLMProviderRepo(d.db).GetByID("openai", importTestOrgID)
	if err != nil || prov == nil {
		t.Fatalf("load provider: (%v, %v)", prov, err)
	}
	if tmplArt == nil || prov.TemplateUUID != tmplArt.UUID {
		t.Errorf("provider.TemplateUUID = %q, want resolved template CP UUID %v", prov.TemplateUUID, tmplArt)
	}
	if depID, st := depStatus(t, d, cpID); depID == "" || st != model.DeploymentStatusDeployed {
		t.Errorf("after create: (%q,%q), want DEPLOYED", depID, st)
	}

	// Sync update.
	resp2 := mustImport(t, d, dpProviderReq("dp-prov-2", "openai", "OpenAI v2", "prov-tmpl"))
	if resp2.ID != cpID {
		t.Errorf("re-push ID = %q, want %q", resp2.ID, cpID)
	}
	if name := artifactByHandle(t, d, "openai").Name; name != "OpenAI v2" {
		t.Errorf("name = %q, want 'OpenAI v2'", name)
	}

	// Undeploy then redeploy.
	depBefore, _ := depStatus(t, d, cpID)
	mustImport(t, d, undeployed(dpProviderReq("dp-prov-3", "openai", "x", "prov-tmpl")))
	if dep, st := depStatus(t, d, cpID); st != model.DeploymentStatusUndeployed || dep != depBefore {
		t.Errorf("after undeploy: (%q,%q), want UNDEPLOYED with no new deployment (%q)", dep, st, depBefore)
	}
	mustImport(t, d, dpProviderReq("dp-prov-4", "openai", "OpenAI v3", "prov-tmpl"))
	if dep, st := depStatus(t, d, cpID); st != model.DeploymentStatusDeployed || dep == depBefore {
		t.Errorf("after redeploy: (%q,%q), want a new DEPLOYED deployment", dep, st)
	}
}

func TestImport_LLMProvider_NoSyncPreservesMetadata(t *testing.T) {
	d := setupImportTest(t, false)
	mustImport(t, d, dpTemplateReq("dp-t", "prov-tmpl", "T"))

	mustImport(t, d, dpProviderReq("dp-prov-1", "openai", "First", "prov-tmpl"))
	mustImport(t, d, dpProviderReq("dp-prov-2", "openai", "Second", "prov-tmpl"))

	if name := artifactByHandle(t, d, "openai").Name; name != "First" {
		t.Errorf("name = %q, want unchanged 'First' (sync_metadata=false)", name)
	}
}

func TestImport_LLMProvider_MissingTemplate(t *testing.T) {
	d := setupImportTest(t, true)
	_, err := d.svc.Import(importTestOrgID, importTestGatewayID,
		dpProviderReq("dp-prov-1", "openai", "OpenAI", "does-not-exist"))
	if !errors.Is(err, constants.ErrInvalidInput) {
		t.Fatalf("Import() error = %v, want ErrInvalidInput for a missing template reference", err)
	}
}

// ===========================================================================
// LLM Proxy lifecycle (project-scoped, deployment-backed,
// references its provider by handle)
// ===========================================================================

func TestImport_LLMProxy_Lifecycle_SyncMetadata(t *testing.T) {
	d := setupImportTest(t, true)
	// Prerequisites: a template and a provider (referenced by handle).
	mustImport(t, d, dpTemplateReq("dp-t", "prx-tmpl", "T"))
	mustImport(t, d, dpProviderReq("dp-p", "prx-prov", "Prov", "prx-tmpl"))

	resp := mustImport(t, d, dpProxyReq("dp-proxy-1", "chat-proxy", "Chat v1", "prx-prov"))
	if resp.Origin != constants.OriginDP || resp.ID == "" || resp.ID == "dp-proxy-1" {
		t.Fatalf("create resp = %+v, want DP origin + fresh CP UUID", resp)
	}
	cpID := resp.ID
	if art := artifactByHandle(t, d, "chat-proxy"); art.Origin != constants.OriginDP || art.Kind != constants.LLMProxy || art.UUID != cpID {
		t.Fatalf("artifact = %+v, want origin DP, kind LlmProxy, uuid %s", art, cpID)
	}
	// The proxy's provider reference (handle) must resolve to the provider's CP UUID.
	provArt, _ := d.artifactRepo.GetByHandle("prx-prov", importTestOrgID)
	proxy, err := repository.NewLLMProxyRepo(d.db).GetByID("chat-proxy", importTestOrgID)
	if err != nil || proxy == nil {
		t.Fatalf("load proxy: (%v, %v)", proxy, err)
	}
	if provArt == nil || proxy.ProviderUUID != provArt.UUID {
		t.Errorf("proxy.ProviderUUID = %q, want resolved provider CP UUID %v", proxy.ProviderUUID, provArt)
	}
	if depID, st := depStatus(t, d, cpID); depID == "" || st != model.DeploymentStatusDeployed {
		t.Errorf("after create: (%q,%q), want DEPLOYED", depID, st)
	}

	// Sync update.
	resp2 := mustImport(t, d, dpProxyReq("dp-proxy-2", "chat-proxy", "Chat v2", "prx-prov"))
	if resp2.ID != cpID {
		t.Errorf("re-push ID = %q, want %q", resp2.ID, cpID)
	}
	if name := artifactByHandle(t, d, "chat-proxy").Name; name != "Chat v2" {
		t.Errorf("name = %q, want 'Chat v2'", name)
	}

	// Undeploy then redeploy.
	depBefore, _ := depStatus(t, d, cpID)
	mustImport(t, d, undeployed(dpProxyReq("dp-proxy-3", "chat-proxy", "x", "prx-prov")))
	if dep, st := depStatus(t, d, cpID); st != model.DeploymentStatusUndeployed || dep != depBefore {
		t.Errorf("after undeploy: (%q,%q), want UNDEPLOYED with no new deployment", dep, st)
	}
	mustImport(t, d, dpProxyReq("dp-proxy-4", "chat-proxy", "Chat v3", "prx-prov"))
	if dep, st := depStatus(t, d, cpID); st != model.DeploymentStatusDeployed || dep == depBefore {
		t.Errorf("after redeploy: (%q,%q), want a new DEPLOYED deployment", dep, st)
	}
}

func TestImport_LLMProxy_NoSyncPreservesMetadata(t *testing.T) {
	d := setupImportTest(t, false)
	mustImport(t, d, dpTemplateReq("dp-t", "prx-tmpl", "T"))
	mustImport(t, d, dpProviderReq("dp-p", "prx-prov", "Prov", "prx-tmpl"))

	mustImport(t, d, dpProxyReq("dp-proxy-1", "chat-proxy", "First", "prx-prov"))
	mustImport(t, d, dpProxyReq("dp-proxy-2", "chat-proxy", "Second", "prx-prov"))

	if name := artifactByHandle(t, d, "chat-proxy").Name; name != "First" {
		t.Errorf("name = %q, want unchanged 'First' (sync_metadata=false)", name)
	}
}

func TestImport_LLMProxy_MissingProvider(t *testing.T) {
	d := setupImportTest(t, true)
	_, err := d.svc.Import(importTestOrgID, importTestGatewayID,
		dpProxyReq("dp-proxy-1", "chat-proxy", "Chat", "no-such-provider"))
	if !errors.Is(err, constants.ErrInvalidInput) {
		t.Fatalf("Import() error = %v, want ErrInvalidInput for a missing provider reference", err)
	}
}

// ===========================================================================
// MCP Proxy lifecycle (project-scoped, deployment-backed)
// ===========================================================================

func TestImport_MCPProxy_Lifecycle_SyncMetadata(t *testing.T) {
	d := setupImportTest(t, true)

	resp := mustImport(t, d, dpMCPReq("dp-mcp-1", "weather-mcp", "Weather MCP v1"))
	if resp.Origin != constants.OriginDP || resp.ID == "" || resp.ID == "dp-mcp-1" {
		t.Fatalf("create resp = %+v, want DP origin + fresh CP UUID", resp)
	}
	cpID := resp.ID
	if art := artifactByHandle(t, d, "weather-mcp"); art.Origin != constants.OriginDP || art.Kind != constants.MCPProxy || art.UUID != cpID {
		t.Fatalf("artifact = %+v, want origin DP, kind Mcp, uuid %s", art, cpID)
	}
	if depID, st := depStatus(t, d, cpID); depID == "" || st != model.DeploymentStatusDeployed {
		t.Errorf("after create: (%q,%q), want DEPLOYED", depID, st)
	}

	// Sync update.
	resp2 := mustImport(t, d, dpMCPReq("dp-mcp-2", "weather-mcp", "Weather MCP v2"))
	if resp2.ID != cpID {
		t.Errorf("re-push ID = %q, want %q", resp2.ID, cpID)
	}
	if name := artifactByHandle(t, d, "weather-mcp").Name; name != "Weather MCP v2" {
		t.Errorf("name = %q, want 'Weather MCP v2'", name)
	}

	// Undeploy then redeploy.
	depBefore, _ := depStatus(t, d, cpID)
	mustImport(t, d, undeployed(dpMCPReq("dp-mcp-3", "weather-mcp", "x")))
	if dep, st := depStatus(t, d, cpID); st != model.DeploymentStatusUndeployed || dep != depBefore {
		t.Errorf("after undeploy: (%q,%q), want UNDEPLOYED with no new deployment", dep, st)
	}
	mustImport(t, d, dpMCPReq("dp-mcp-4", "weather-mcp", "Weather MCP v3"))
	if dep, st := depStatus(t, d, cpID); st != model.DeploymentStatusDeployed || dep == depBefore {
		t.Errorf("after redeploy: (%q,%q), want a new DEPLOYED deployment", dep, st)
	}
}

func TestImport_MCPProxy_NoSyncPreservesMetadata(t *testing.T) {
	d := setupImportTest(t, false)

	mustImport(t, d, dpMCPReq("dp-mcp-1", "weather-mcp", "First"))
	mustImport(t, d, dpMCPReq("dp-mcp-2", "weather-mcp", "Second"))

	if name := artifactByHandle(t, d, "weather-mcp").Name; name != "First" {
		t.Errorf("name = %q, want unchanged 'First' (sync_metadata=false)", name)
	}
}

// TestImport_MCPProxy_CPOriginProtected covers the cross-origin same-handle scenario for
// a deployment-backed kind: a CP-created MCP proxy (not yet deployed) and a gateway-created
// MCP proxy share a handle. The push must preserve the CP artifact's metadata (even with
// sync_metadata=true) and only add a new deployment entry.
func TestImport_MCPProxy_CPOriginProtected(t *testing.T) {
	d := setupImportTest(t, true)

	mcpRepo := repository.NewMCPProxyRepo(d.db)
	proj := importTestProjectID
	if err := mcpRepo.Create(&model.MCPProxy{
		Handle:           "shared-mcp",
		OrganizationUUID: importTestOrgID,
		ProjectUUID:      &proj,
		Name:             "Original CP Name",
		Version:          "v1.0",
		Status:           "CREATED",
		Origin:           constants.OriginCP,
		Configuration:    model.MCPProxyConfiguration{Name: "Original CP Name", Version: "v1.0"},
	}); err != nil {
		t.Fatalf("seed CP MCP proxy: %v", err)
	}
	cpArt := artifactByHandle(t, d, "shared-mcp")
	if cpArt == nil {
		t.Fatal("seeded CP MCP artifact not found")
	}
	cpID := cpArt.UUID

	// Gateway pushes a same-handle MCP proxy with a different DP UUID.
	resp := mustImport(t, d, dpMCPReq("dp-shared-mcp", "shared-mcp", "Hacked Name"))
	if resp.ID != cpID {
		t.Errorf("response ID = %q, want existing CP UUID %q", resp.ID, cpID)
	}

	art := artifactByHandle(t, d, "shared-mcp")
	if art == nil {
		t.Fatal("artifact missing after import")
	}
	if art.Name != "Original CP Name" {
		t.Errorf("name = %q; CP-origin metadata must not change even with sync_metadata=true", art.Name)
	}
	if art.Origin != constants.OriginCP {
		t.Errorf("origin = %q, want CP", art.Origin)
	}
	// A new deployment entry must have been added for the CP artifact.
	if depID, st := depStatus(t, d, cpID); depID == "" || st != model.DeploymentStatusDeployed {
		t.Errorf("deployment = (%q,%q), want a new DEPLOYED entry for the CP artifact", depID, st)
	}
}

// TestImport_MCPProxy_ReadOnlyInGetAndList exercises the readOnly flag end-to-end through
// the MCP proxy service: a DP-origin artifact (imported from a gateway) is read-only in
// both Get and List, while a CP-origin artifact (created via the service) is not. The GET
// readOnly mapping for all kinds is covered by TestReadOnlyReflectsOrigin; this adds the
// "listing" path end-to-end.
func TestImport_MCPProxy_ReadOnlyInGetAndList(t *testing.T) {
	d := setupImportTest(t, true)
	svc := NewMCPProxyService(
		repository.NewMCPProxyRepo(d.db),
		repository.NewProjectRepo(d.db),
		d.deployment,
		repository.NewGatewayRepo(d.db),
		nil, // gatewayEventsService unused on create/get/list
		newTestLogger(),
	)

	// DP-origin MCP proxy via the gateway import flow.
	mustImport(t, d, dpMCPReq("dp-mcp-ro", "dp-mcp", "DP MCP"))

	// CP-origin MCP proxy via the service.
	proj := importTestProjectID
	if _, err := svc.Create(importTestOrgID, "tester", &api.MCPProxy{
		Id:        "cp-mcp",
		Name:      "CP MCP",
		Version:   "v1.0",
		ProjectId: &proj,
		Upstream:  api.Upstream{Main: api.UpstreamDefinition{Url: strPointer("https://api.example.com")}},
	}); err != nil {
		t.Fatalf("create CP MCP proxy: %v", err)
	}

	// Get: DP read-only, CP mutable.
	dpGet, err := svc.Get(importTestOrgID, "dp-mcp")
	if err != nil {
		t.Fatalf("Get(dp-mcp): %v", err)
	}
	if dpGet.ReadOnly == nil || !*dpGet.ReadOnly {
		t.Errorf("Get(dp-mcp).ReadOnly = %v, want true", dpGet.ReadOnly)
	}
	cpGet, err := svc.Get(importTestOrgID, "cp-mcp")
	if err != nil {
		t.Fatalf("Get(cp-mcp): %v", err)
	}
	if cpGet.ReadOnly == nil || *cpGet.ReadOnly {
		t.Errorf("Get(cp-mcp).ReadOnly = %v, want false", cpGet.ReadOnly)
	}

	// List: each item carries the correct readOnly per origin.
	list, err := svc.List(importTestOrgID, 100, 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	seen := map[string]bool{}
	for i := range list.List {
		item := list.List[i]
		if item.Id == nil {
			continue
		}
		seen[*item.Id] = true
		switch *item.Id {
		case "dp-mcp":
			if item.ReadOnly == nil || !*item.ReadOnly {
				t.Errorf("list item dp-mcp ReadOnly = %v, want true", item.ReadOnly)
			}
		case "cp-mcp":
			if item.ReadOnly == nil || *item.ReadOnly {
				t.Errorf("list item cp-mcp ReadOnly = %v, want false", item.ReadOnly)
			}
		}
	}
	if !seen["dp-mcp"] || !seen["cp-mcp"] {
		t.Errorf("list missing expected items; saw %v", seen)
	}
}

// TestCPSideGuard_UpdateBlockedForDPOrigin verifies that the control-plane CRUD services
// reject updates to DP-originated (gateway-pushed) artifacts with ErrArtifactReadOnly,
// for every kind. The DP artifacts are seeded through the import flow. (REST is covered by
// TestArtifactImport_Enforcement_ReadOnlyAndDeletion; deploy/undeploy/restore guards are
// covered by the deployment-guard tests.)
func TestCPSideGuard_UpdateBlockedForDPOrigin(t *testing.T) {
	logger := newTestLogger()

	t.Run("LLMProviderTemplate", func(t *testing.T) {
		d := setupImportTest(t, true)
		svc := NewLLMProviderTemplateService(d.templateRepo)
		mustImport(t, d, dpTemplateReq("dp-t", "blk-tmpl", "T"))
		if _, err := svc.Update(importTestOrgID, "blk-tmpl", &api.LLMProviderTemplate{Name: "Hacked"}); !errors.Is(err, constants.ErrArtifactReadOnly) {
			t.Errorf("Template Update(DP) = %v, want ErrArtifactReadOnly", err)
		}
	})

	t.Run("LLMProvider", func(t *testing.T) {
		d := setupImportTest(t, true)
		svc := NewLLMProviderService(repository.NewLLMProviderRepo(d.db), d.templateRepo,
			repository.NewOrganizationRepo(d.db), nil, d.deployment, repository.NewGatewayRepo(d.db), nil, logger)
		mustImport(t, d, dpTemplateReq("dp-t", "p-tmpl", "T"))
		mustImport(t, d, dpProviderReq("dp-p", "blk-prov", "P", "p-tmpl"))
		if _, err := svc.Update(importTestOrgID, "blk-prov", &api.LLMProvider{Name: "Hacked"}); !errors.Is(err, constants.ErrArtifactReadOnly) {
			t.Errorf("Provider Update(DP) = %v, want ErrArtifactReadOnly", err)
		}
	})

	t.Run("LLMProxy", func(t *testing.T) {
		d := setupImportTest(t, true)
		svc := NewLLMProxyService(repository.NewLLMProxyRepo(d.db), repository.NewLLMProviderRepo(d.db),
			repository.NewProjectRepo(d.db), d.deployment, repository.NewGatewayRepo(d.db), nil, logger)
		mustImport(t, d, dpTemplateReq("dp-t", "px-tmpl", "T"))
		mustImport(t, d, dpProviderReq("dp-p", "px-prov", "P", "px-tmpl"))
		mustImport(t, d, dpProxyReq("dp-x", "blk-proxy", "X", "px-prov"))
		if _, err := svc.Update(importTestOrgID, "blk-proxy", &api.LLMProxy{
			Name: "Hacked", Version: "v2", Provider: api.LLMProxyProvider{Id: "px-prov"},
		}); !errors.Is(err, constants.ErrArtifactReadOnly) {
			t.Errorf("Proxy Update(DP) = %v, want ErrArtifactReadOnly", err)
		}
	})

	t.Run("MCPProxy", func(t *testing.T) {
		d := setupImportTest(t, true)
		svc := NewMCPProxyService(repository.NewMCPProxyRepo(d.db), repository.NewProjectRepo(d.db),
			d.deployment, repository.NewGatewayRepo(d.db), nil, logger)
		mustImport(t, d, dpMCPReq("dp-m", "blk-mcp", "M"))
		if _, err := svc.Update(importTestOrgID, "blk-mcp", &api.MCPProxy{
			Id: "blk-mcp", Name: "Hacked", Version: "v2",
			Upstream: api.Upstream{Main: api.UpstreamDefinition{Url: strPointer("https://api.example.com")}},
		}); !errors.Is(err, constants.ErrArtifactReadOnly) {
			t.Errorf("MCP Update(DP) = %v, want ErrArtifactReadOnly", err)
		}
	})
}

// TestLLMProviderTemplate_DeleteOriginGuard verifies that the control plane refuses to
// delete a DP-originated (gateway-pushed) template (it is read-only), while a CP-created
// template can be deleted. Templates have no per-gateway deployment, so the read-only
// guard applies directly.
func TestLLMProviderTemplate_DeleteOriginGuard(t *testing.T) {
	d := setupImportTest(t, true)
	svc := NewLLMProviderTemplateService(d.templateRepo)

	// DP-origin template (imported from a gateway) cannot be deleted from the CP.
	mustImport(t, d, dpTemplateReq("dp-t", "dp-tmpl", "DP Template"))
	if err := svc.Delete(importTestOrgID, "dp-tmpl"); !errors.Is(err, constants.ErrArtifactReadOnly) {
		t.Errorf("Delete(DP template) = %v, want ErrArtifactReadOnly", err)
	}
	// It must still exist after the rejected delete.
	if tmpl, _ := d.templateRepo.GetByID("dp-tmpl", importTestOrgID); tmpl == nil {
		t.Error("DP template was deleted despite being read-only")
	}

	// CP-origin template can be deleted.
	if err := d.templateRepo.Create(&model.LLMProviderTemplate{
		OrganizationUUID: importTestOrgID,
		ID:               "cp-tmpl",
		Name:             "CP Template",
		Origin:           constants.OriginCP,
	}); err != nil {
		t.Fatalf("seed CP template: %v", err)
	}
	if err := svc.Delete(importTestOrgID, "cp-tmpl"); err != nil {
		t.Errorf("Delete(CP template) = %v, want nil", err)
	}
	if tmpl, _ := d.templateRepo.GetByID("cp-tmpl", importTestOrgID); tmpl != nil {
		t.Error("CP template was not deleted")
	}

	// Deleting a non-existent template returns not-found (guard does not mask it).
	if err := svc.Delete(importTestOrgID, "no-such-tmpl"); !errors.Is(err, constants.ErrLLMProviderTemplateNotFound) {
		t.Errorf("Delete(missing) = %v, want ErrLLMProviderTemplateNotFound", err)
	}
}
