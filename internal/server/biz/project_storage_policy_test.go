package biz

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/looplj/axonhub/internal/objects"
)

func storagePolicyBool(v bool) *bool {
	return &v
}

func TestApplyProjectStoragePolicy(t *testing.T) {
	tests := []struct {
		name    string
		system  bool
		project *bool
		want    bool
	}{
		{name: "system enabled project inherit", system: true, project: nil, want: true},
		{name: "system enabled project enabled", system: true, project: storagePolicyBool(true), want: true},
		{name: "system enabled project disabled", system: true, project: storagePolicyBool(false), want: false},
		{name: "system disabled project inherit", system: false, project: nil, want: false},
		{name: "system disabled project enabled", system: false, project: storagePolicyBool(true), want: false},
		{name: "system disabled project disabled", system: false, project: storagePolicyBool(false), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			system := &StoragePolicy{
				StoreRequestBody:  tt.system,
				StoreResponseBody: tt.system,
				StoreChunks:       tt.system,
			}
			project := &objects.ProjectStoragePolicy{
				StoreRequestBody:  tt.project,
				StoreResponseBody: tt.project,
				StoreChunks:       tt.project,
			}

			effective := ApplyProjectStoragePolicy(system, project)

			require.Equal(t, tt.want, effective.StoreRequestBody)
			require.Equal(t, tt.want, effective.StoreResponseBody)
			require.Equal(t, tt.want, effective.StoreChunks)
		})
	}
}

func TestProjectStoragePolicyInherit(t *testing.T) {
	require.True(t, (*objects.ProjectStoragePolicy)(nil).IsInherit())
	require.True(t, (&objects.ProjectStoragePolicy{}).IsInherit())
	require.False(t, (&objects.ProjectStoragePolicy{StoreRequestBody: storagePolicyBool(false)}).IsInherit())
}
