package biz

import (
	"context"
	"fmt"

	"github.com/looplj/axonhub/internal/ent"
	"github.com/looplj/axonhub/internal/objects"
)

// GetProjectStoragePolicy returns the configured project-level payload storage override.
// A nil policy means every setting inherits the system policy.
func (s *ProjectService) GetProjectStoragePolicy(ctx context.Context, id int) (*objects.ProjectStoragePolicy, error) {
	project, err := s.entFromContext(ctx).Project.Get(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get project storage policy: %w", err)
	}

	if project.Profiles == nil || project.Profiles.StoragePolicy == nil {
		return nil, nil
	}

	policy := *project.Profiles.StoragePolicy
	return &policy, nil
}

// UpdateProjectStoragePolicy updates only the payload storage override while preserving
// the project's routing profiles. An all-nil policy is normalized back to inherit.
func (s *ProjectService) UpdateProjectStoragePolicy(ctx context.Context, id int, policy objects.ProjectStoragePolicy) (*ent.Project, error) {
	client := s.entFromContext(ctx)
	project, err := client.Project.Get(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get project before updating storage policy: %w", err)
	}

	profiles := project.Profiles
	if profiles == nil {
		profiles = &objects.ProjectProfiles{}
	}

	if policy.IsInherit() {
		profiles.StoragePolicy = nil
	} else {
		policyCopy := policy
		profiles.StoragePolicy = &policyCopy
	}

	updated, err := client.Project.UpdateOneID(id).
		SetProfiles(profiles).
		Save(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to update project storage policy: %w", err)
	}

	s.invalidateProjectCache(ctx, id)
	return updated, nil
}
