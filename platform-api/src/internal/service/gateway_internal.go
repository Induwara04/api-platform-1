/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.org) All Rights Reserved.
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
	"platform-api/src/internal/dto"
	"platform-api/src/internal/model"
	"platform-api/src/internal/repository"
	"platform-api/src/internal/utils"
	"time"
)

// GatewayInternalAPIService handles internal gateway API operations
type GatewayInternalAPIService struct {
	apiRepo     repository.APIRepository
	gatewayRepo repository.GatewayRepository
	orgRepo     repository.OrganizationRepository
	projectRepo repository.ProjectRepository
	apiUtil     *utils.APIUtil
}

// NewGatewayInternalAPIService creates a new gateway internal API service
func NewGatewayInternalAPIService(apiRepo repository.APIRepository, gatewayRepo repository.GatewayRepository,
	orgRepo repository.OrganizationRepository, projectRepo repository.ProjectRepository) *GatewayInternalAPIService {
	return &GatewayInternalAPIService{
		apiRepo:     apiRepo,
		gatewayRepo: gatewayRepo,
		orgRepo:     orgRepo,
		projectRepo: projectRepo,
		apiUtil:     &utils.APIUtil{},
	}
}

// GetAPIsByOrganization retrieves all APIs for a specific organization (used by gateways)
func (s *GatewayInternalAPIService) GetAPIsByOrganization(orgID string) (map[string]string, error) {
	// Get all APIs for the organization
	apis, err := s.apiRepo.GetAPIsByOrganizationID(orgID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve APIs: %w", err)
	}

	apiYamlMap := make(map[string]string)
	for _, api := range apis {
		apiDTO := s.apiUtil.ModelToDTO(api)
		apiYaml, err := s.apiUtil.GenerateAPIDeploymentYAML(apiDTO)
		if err != nil {
			return nil, fmt.Errorf("failed to generate API YAML: %w", err)
		}
		apiYamlMap[api.ID] = apiYaml
	}
	return apiYamlMap, nil
}

// GetAPIByUUID retrieves an API by its ID
func (s *GatewayInternalAPIService) GetAPIByUUID(apiId, orgId string) (map[string]string, error) {
	apiModel, err := s.apiRepo.GetAPIByUUID(apiId)
	if err != nil {
		return nil, fmt.Errorf("failed to get api: %w", err)
	}
	if apiModel == nil {
		return nil, constants.ErrAPINotFound
	}
	if apiModel.OrganizationID != orgId {
		return nil, constants.ErrAPINotFound
	}

	apiDTO := s.apiUtil.ModelToDTO(apiModel)
	apiYaml, err := s.apiUtil.GenerateAPIDeploymentYAML(apiDTO)
	if err != nil {
		return nil, fmt.Errorf("failed to generate API YAML: %w", err)
	}
	apiYamlMap := map[string]string{
		apiDTO.ID: apiYaml,
	}
	return apiYamlMap, nil
}

// CreateGatewayAPIDeployment handles the registration of an API deployment from a gateway
func (s *GatewayInternalAPIService) CreateGatewayAPIDeployment(apiID, orgID, gatewayID string,
	notification dto.APIDeploymentNotification, revisionID *string) (*dto.GatewayAPIDeploymentResponse, error) {
	// Note: revisionID parameter is reserved for future use
	_ = revisionID

	// Validate input
	if apiID == "" || orgID == "" || gatewayID == "" {
		return nil, constants.ErrInvalidInput
	}

	// Check if the gateway exists and belongs to the organization
	gatewayModel, err := s.gatewayRepo.GetByUUID(gatewayID)
	if err != nil {
		return nil, fmt.Errorf("failed to get gateway: %w", err)
	}
	if gatewayModel == nil {
		return nil, constants.ErrGatewayNotFound
	}
	if gatewayModel.OrganizationID != orgID {
		return nil, constants.ErrGatewayNotFound
	}

	// Find the project by name within the organization
	projectName := notification.ProjectIdentifier
	project, err := s.projectRepo.GetProjectByNameAndOrgID(projectName, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to get project by name: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("project not found: %s", projectName)
	}
	projectID := project.ID

	// Check if API already exists
	existingAPI, err := s.apiRepo.GetAPIByUUID(apiID)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing API: %w", err)
	}

	apiCreated := false
	if existingAPI == nil {
		// Convert upstream services from notification to backend services
		backendServices := make([]model.BackendService, 0, len(notification.Configuration.Data.Upstream))
		for i, upstream := range notification.Configuration.Data.Upstream {
			backendService := model.BackendService{
				Name:      fmt.Sprintf("backend-service-%d", i+1),
				IsDefault: i == 0, // First backend service is default
				Endpoints: []model.BackendEndpoint{
					{
						URL:    upstream.URL,
						Weight: 100,
					},
				},
			}
			backendServices = append(backendServices, backendService)
		}

		// Convert operations from notification to API operations
		operations := make([]model.Operation, 0, len(notification.Configuration.Data.Operations))
		for _, op := range notification.Configuration.Data.Operations {
			operation := model.Operation{
				Name:        fmt.Sprintf("%s %s", op.Method, op.Path),
				Description: fmt.Sprintf("Operation for %s %s", op.Method, op.Path),
				Request: &model.OperationRequest{
					Method: op.Method,
					Path:   op.Path,
					BackendServices: []model.BackendRouting{
						{
							Name:   "backend-service-1", // Route to default backend service
							Weight: 100,
						},
					},
				},
			}
			operations = append(operations, operation)
		}

		// Create new API from notification
		newAPI := &model.API{
			ID:               apiID,
			Name:             notification.Configuration.Data.Name,
			DisplayName:      notification.Configuration.Data.Name,
			Context:          notification.Configuration.Data.Context,
			Version:          notification.Configuration.Data.Version,
			ProjectID:        projectID,
			OrganizationID:   orgID,
			LifeCycleStatus:  "CREATED",
			Type:             "HTTP",
			Transport:        []string{"http", "https"},
			IsDefaultVersion: false,
			IsRevision:       false,
			RevisionID:       0,
			BackendServices:  backendServices,
			Operations:       operations,
			CreatedAt:        time.Now(),
			UpdatedAt:        time.Now(),
		}

		err = s.apiRepo.CreateAPI(newAPI)
		if err != nil {
			return nil, fmt.Errorf("failed to create API: %w", err)
		}
		apiCreated = true
	} else {
		// Validate that existing API belongs to the same organization
		if existingAPI.OrganizationID != orgID {
			return nil, constants.ErrAPINotFound
		}
	}

	// Check if deployment already exists
	existingDeployments, err := s.apiRepo.GetDeploymentsByAPIUUID(apiID)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing deployments: %w", err)
	}

	// Check if this gateway already has this API deployed
	for _, deployment := range existingDeployments {
		if deployment.GatewayID == gatewayID {
			return nil, fmt.Errorf("API already deployed to this gateway")
		}
	}

	// Create deployment record
	deployment := &model.APIDeployment{
		ApiID:          apiID,
		GatewayID:      gatewayID,
		OrganizationID: orgID,
		CreatedAt:      time.Now(),
	}

	err = s.apiRepo.CreateDeployment(deployment)
	if err != nil {
		return nil, fmt.Errorf("failed to create deployment record: %w", err)
	}

	return &dto.GatewayAPIDeploymentResponse{
		APIId:        apiID,
		DeploymentId: int64(deployment.ID),
		Message:      "API deployment registered successfully",
		Created:      apiCreated,
	}, nil
}
