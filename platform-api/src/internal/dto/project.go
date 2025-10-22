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

package dto

import (
	"time"
)

// CreateProjectRequest represents the request body for creating a new project
type CreateProjectRequest struct {
	Name        string `json:"name" yaml:"name" binding:"required"`
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
}

// Project represents a project entity in the API management platform
type Project struct {
	ID             string    `json:"id" yaml:"id"`
	Name           string    `json:"name" yaml:"name"`
	OrganizationID string    `json:"organizationId" yaml:"organizationId"`
	Description    string    `json:"description,omitempty" yaml:"description,omitempty"`
	CreatedAt      time.Time `json:"createdAt" yaml:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt" yaml:"updatedAt"`
}

// ProjectListResponse represents a paginated list of projects (constitution-compliant)
type ProjectListResponse struct {
	Count      int        `json:"count" yaml:"count"`           // Number of items in current response
	List       []*Project `json:"list" yaml:"list"`             // Array of project objects
	Pagination Pagination `json:"pagination" yaml:"pagination"` // Pagination metadata
}
