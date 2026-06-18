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
	"reflect"
	"testing"

	"platform-api/src/internal/constants"
	"platform-api/src/internal/model"
	"platform-api/src/internal/repository"
)

type mockGatewayRepository struct {
	repository.GatewayRepository

	getByNameResult  *model.Gateway
	getByNameError   error
	getByUUIDResult  *model.Gateway
	getByUUIDError   error
	createError      error
	createTokenError error
	updateError      error

	createdGateway *model.Gateway
	createdToken   *model.GatewayToken
	updatedGateway *model.Gateway
}

func (m *mockGatewayRepository) GetByNameAndOrgID(name, orgID string) (*model.Gateway, error) {
	return m.getByNameResult, m.getByNameError
}

func (m *mockGatewayRepository) Create(gateway *model.Gateway) error {
	m.createdGateway = gateway
	return m.createError
}

func (m *mockGatewayRepository) CreateToken(token *model.GatewayToken) error {
	m.createdToken = token
	return m.createTokenError
}

func (m *mockGatewayRepository) GetByUUID(gatewayId string) (*model.Gateway, error) {
	return m.getByUUIDResult, m.getByUUIDError
}

func (m *mockGatewayRepository) UpdateGateway(gateway *model.Gateway) error {
	m.updatedGateway = gateway
	return m.updateError
}

type mockOrganizationRepository struct {
	repository.OrganizationRepository

	org *model.Organization
	err error
}

func (m *mockOrganizationRepository) GetOrganizationByUUID(orgId string) (*model.Organization, error) {
	return m.org, m.err
}

func TestRegisterGatewayProperties(t *testing.T) {
	orgID := "123e4567-e89b-12d3-a456-426614174000"
	properties := map[string]interface{}{
		"region": "us-west",
		"tier":   "premium",
	}

	mockGatewayRepo := &mockGatewayRepository{}
	mockOrgRepo := &mockOrganizationRepository{
		org: &model.Organization{ID: orgID},
	}

	service := &GatewayService{
		gatewayRepo: mockGatewayRepo,
		orgRepo:     mockOrgRepo,
	}

	response, err := service.RegisterGateway(
		orgID,
		"prod-gateway-01",
		"Production Gateway",
		"Gateway for prod traffic",
		"api.example.com",
		true,
		constants.GatewayFunctionalityTypeRegular,
		"1.0",
		properties,
		false,
	)
	if err != nil {
		t.Fatalf("RegisterGateway() error = %v", err)
	}

	if response == nil {
		t.Fatalf("RegisterGateway() returned nil response")
	}

	if response.Properties == nil || !reflect.DeepEqual(*response.Properties, properties) {
		t.Errorf("RegisterGateway() response properties = %v, want %v", response.Properties, properties)
	}

	if mockGatewayRepo.createdGateway == nil {
		t.Fatalf("Create() was not called")
	}

	if !reflect.DeepEqual(mockGatewayRepo.createdGateway.Properties, properties) {
		t.Errorf("Create() gateway properties = %v, want %v", mockGatewayRepo.createdGateway.Properties, properties)
	}
}

func TestRegisterGatewaySyncMetadata(t *testing.T) {
	orgID := "123e4567-e89b-12d3-a456-426614174000"
	mockOrgRepo := &mockOrganizationRepository{org: &model.Organization{ID: orgID}}

	// syncMetadata = true is persisted and reflected in the response.
	repoTrue := &mockGatewayRepository{}
	svc := &GatewayService{gatewayRepo: repoTrue, orgRepo: mockOrgRepo}
	resp, err := svc.RegisterGateway(orgID, "sync-gw", "Sync GW", "", "api.example.com",
		false, constants.GatewayFunctionalityTypeRegular, "1.0", nil, true)
	if err != nil {
		t.Fatalf("RegisterGateway() error = %v", err)
	}
	if repoTrue.createdGateway == nil || !repoTrue.createdGateway.SyncMetadata {
		t.Errorf("created gateway SyncMetadata = false, want true")
	}
	if resp.SyncMetadata == nil || !*resp.SyncMetadata {
		t.Errorf("response SyncMetadata = %v, want true", resp.SyncMetadata)
	}

	// Default (false) when not requested.
	repoFalse := &mockGatewayRepository{}
	svc2 := &GatewayService{gatewayRepo: repoFalse, orgRepo: mockOrgRepo}
	resp2, err := svc2.RegisterGateway(orgID, "sync-gw-2", "Sync GW2", "", "api.example.com",
		false, constants.GatewayFunctionalityTypeRegular, "1.0", nil, false)
	if err != nil {
		t.Fatalf("RegisterGateway() error = %v", err)
	}
	if repoFalse.createdGateway == nil || repoFalse.createdGateway.SyncMetadata {
		t.Errorf("created gateway SyncMetadata = true, want false")
	}
	if resp2.SyncMetadata == nil || *resp2.SyncMetadata {
		t.Errorf("response SyncMetadata = %v, want false", resp2.SyncMetadata)
	}
}

func TestUpdateGatewayProperties(t *testing.T) {
	orgID := "123e4567-e89b-12d3-a456-426614174001"
	gatewayID := "123e4567-e89b-12d3-a456-426614174002"

	baseGateway := &model.Gateway{
		ID:             gatewayID,
		OrganizationID: orgID,
		DisplayName:    "Old Gateway",
		Description:    "Old description",
		Properties: map[string]interface{}{
			"region": "us-east",
			"tier":   "free",
		},
	}

	t.Run("keeps properties when nil", func(t *testing.T) {
		mockGatewayRepo := &mockGatewayRepository{
			getByUUIDResult: baseGateway,
		}

		service := &GatewayService{
			gatewayRepo: mockGatewayRepo,
		}

		newDescription := "New description"
		response, err := service.UpdateGateway(gatewayID, orgID, &newDescription, nil, nil, nil, nil)
		if err != nil {
			t.Fatalf("UpdateGateway() error = %v", err)
		}

		if response.Properties == nil || !reflect.DeepEqual(*response.Properties, baseGateway.Properties) {
			t.Errorf("UpdateGateway() response properties = %v, want %v", response.Properties, baseGateway.Properties)
		}

		if mockGatewayRepo.updatedGateway == nil {
			t.Fatalf("UpdateGateway() did not call UpdateGateway repository method")
		}

		if !reflect.DeepEqual(mockGatewayRepo.updatedGateway.Properties, baseGateway.Properties) {
			t.Errorf("UpdateGateway() stored properties = %v, want %v", mockGatewayRepo.updatedGateway.Properties, baseGateway.Properties)
		}
	})

	t.Run("updates properties when provided", func(t *testing.T) {
		freshGateway := *baseGateway
		freshGateway.Properties = map[string]interface{}{
			"region": "us-east",
			"tier":   "free",
		}

		mockGatewayRepo := &mockGatewayRepository{
			getByUUIDResult: &freshGateway,
		}

		service := &GatewayService{
			gatewayRepo: mockGatewayRepo,
		}

		newProperties := map[string]interface{}{
			"region": "us-west",
			"tier":   "premium",
		}

		response, err := service.UpdateGateway(gatewayID, orgID, nil, nil, nil, &newProperties, nil)
		if err != nil {
			t.Fatalf("UpdateGateway() error = %v", err)
		}

		if response.Properties == nil || !reflect.DeepEqual(*response.Properties, newProperties) {
			t.Errorf("UpdateGateway() response properties = %v, want %v", response.Properties, newProperties)
		}

		if mockGatewayRepo.updatedGateway == nil {
			t.Fatalf("UpdateGateway() did not call UpdateGateway repository method")
		}

		if !reflect.DeepEqual(mockGatewayRepo.updatedGateway.Properties, newProperties) {
			t.Errorf("UpdateGateway() stored properties = %v, want %v", mockGatewayRepo.updatedGateway.Properties, newProperties)
		}
	})
}
