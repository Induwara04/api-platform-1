/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package controlplane

import (
	"encoding/json"
	api "github.com/wso2/api-platform/gateway/gateway-controller/pkg/api/management"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	commonconstants "github.com/wso2/api-platform/common/constants"
	"github.com/wso2/api-platform/gateway/gateway-controller/pkg/models"
)

// TestPushGatewayArtifacts pushes only gateway-originated artifacts to the control
// plane via the generic import endpoint, skipping control-plane-originated ones.
func TestPushGatewayArtifacts(t *testing.T) {
	client := createTestClient(t)

	var (
		mu       sync.Mutex
		pushedID []string
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/artifacts/import-gateway-artifact" {
			http.Error(w, "unexpected path", http.StatusNotFound)
			return
		}
		body, _ := io.ReadAll(r.Body)
		var req struct {
			ID            string `json:"id"`
			Configuration struct {
				Kind string `json:"kind"`
			} `json:"configuration"`
		}
		_ = json.Unmarshal(body, &req)
		mu.Lock()
		pushedID = append(pushedID, req.ID)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client.apiUtilsService.SetBaseURL(server.URL)

	// Seed one gateway-originated artifact (should be pushed) and one CP-originated
	// artifact (should be skipped).
	if err := client.db.SaveConfig(&models.StoredConfig{
		UUID:         "gw-artifact-1",
		Kind:         models.KindRestApi,
		Handle:       "weather-api",
		DisplayName:  "Weather API",
		Version:      "v1.0",
		Origin:       models.OriginGatewayAPI,
		DesiredState: models.StateDeployed,
		// The configuration is the full CR; project-scoped kinds (RestApi) must
		// declare the project via the project-id metadata annotation or the push
		// is rejected before reaching the control plane.
		Configuration: map[string]any{
			"apiVersion": "gateway.api-platform.wso2.com/v1alpha1",
			"kind":       models.KindRestApi,
			"metadata": map[string]any{
				"name":        "weather-api",
				"annotations": map[string]any{commonconstants.AnnotationProjectID: "default"},
			},
			"spec": map[string]any{"context": "/weather"},
		},
		SourceConfiguration: map[string]any{
			"apiVersion": "gateway.api-platform.wso2.com/v1alpha1",
			"kind":       models.KindRestApi,
			"metadata": map[string]any{
				"name":        "weather-api",
				"annotations": map[string]any{commonconstants.AnnotationProjectID: "default"},
			},
			"spec": map[string]any{"context": "/weather"},
		},
	}); err != nil {
		t.Fatalf("seed gateway config: %v", err)
	}
	if err := client.db.SaveConfig(&models.StoredConfig{
		UUID:         "cp-artifact-1",
		Kind:         models.KindRestApi,
		Handle:       "cp-api",
		Origin:       models.OriginControlPlane,
		DesiredState: models.StateDeployed,
	}); err != nil {
		t.Fatalf("seed cp config: %v", err)
	}

	client.pushGatewayArtifacts()

	mu.Lock()
	defer mu.Unlock()
	if len(pushedID) != 1 {
		t.Fatalf("pushed %d artifacts, want 1 (only the gateway-originated one): %v", len(pushedID), pushedID)
	}
	if pushedID[0] != "gw-artifact-1" {
		t.Errorf("pushed artifact ID = %q, want gw-artifact-1", pushedID[0])
	}
}

// TestPushGatewayArtifactsToControlPlane_GatedOff verifies the push is a no-op when
// deployment_push_enabled is false.
func TestPushGatewayArtifactsToControlPlane_GatedOff(t *testing.T) {
	client := createTestClient(t)
	client.config.DeploymentPushEnabled = false

	hit := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	client.apiUtilsService.SetBaseURL(server.URL)

	restCR := map[string]any{
		"apiVersion": api.RestAPIApiVersionGatewayApiPlatformWso2Comv1alpha1,
		"kind":       models.KindRestApi,
		"metadata": map[string]any{
			"name": "petstore-api-v1.0",
			"annotations": map[string]any{
				commonconstants.AnnotationArtifactID: "019d953f-d386-7a64-4444-1869a28292e0",
				commonconstants.AnnotationProjectID:  "test-project",
			},
		},
		"spec": map[string]any{
			"displayName": "PetStore API test",
			"version":     "v1.0",
			"context":     "/petstoretest",
			"upstream": map[string]any{
				"main": map[string]any{"url": "http://petstore.swagger.io/v2"},
			},
			"policies": []map[string]any{
				{
					"name":    "api-key-auth",
					"version": "v1",
					"params":  map[string]any{"key": "X-API-Key", "in": "header"},
				},
				{
					"name":    "set-headers",
					"version": "v1",
					"params": map[string]any{
						"request": map[string]any{
							"headers": []map[string]any{{"name": "X-Client-Version", "value": "1.2.3"}},
						},
					},
				},
			},
			"operations": []map[string]any{
				{"method": "GET", "path": "/pet/{petId}"},
				{"method": "POST", "path": "/pet"},
				{"method": "PUT", "path": "/pet"},
				{"method": "DELETE", "path": "/pet/{petId}"},
				{"method": "GET", "path": "/store/inventory"},
				{"method": "POST", "path": "/store/order"},
			},
		},
	}

	now := time.Now()
	if err := client.db.SaveConfig(&models.StoredConfig{
		UUID:                "gw-artifact-2",
		Kind:                models.KindRestApi,
		Handle:              "petstore-api-v1.0",
		DisplayName:         "PetStore API test",
		Version:             "v1.0",
		Configuration:       restCR,
		SourceConfiguration: restCR,
		DesiredState:        models.StateDeployed,
		DeploymentID:        "deployment-petstore-1",
		Origin:              models.OriginGatewayAPI,
		CreatedAt:           now,
		UpdatedAt:           now,
		DeployedAt:          &now,
		CPSyncStatus:        models.CPSyncStatusPending,
	}); err != nil {
		t.Fatalf("seed config: %v", err)
	}

	client.PushGatewayArtifactsToControlPlane()

	if hit {
		t.Error("control plane was called despite deployment_push_enabled=false")
	}
}
