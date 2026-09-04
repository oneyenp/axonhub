package objects

type ProjectProfiles struct {
	ActiveProfile string                `json:"activeProfile"`
	Profiles      []ProjectProfile      `json:"profiles"`
	StoragePolicy *ProjectStoragePolicy `json:"storagePolicy,omitempty"`
}

// ProjectStoragePolicy contains project-level overrides for request payload persistence.
// Nil fields inherit the corresponding system-level setting. Project overrides are
// restrictive-only and cannot re-enable storage disabled at system level.
type ProjectStoragePolicy struct {
	StoreRequestBody  *bool `json:"storeRequestBody,omitempty"`
	StoreResponseBody *bool `json:"storeResponseBody,omitempty"`
	StoreChunks       *bool `json:"storeChunks,omitempty"`
}

func (p *ProjectStoragePolicy) IsInherit() bool {
	return p == nil || (p.StoreRequestBody == nil && p.StoreResponseBody == nil && p.StoreChunks == nil)
}

func (p *ProjectStoragePolicy) AllowsRequestBody() bool {
	return p == nil || p.StoreRequestBody == nil || *p.StoreRequestBody
}

func (p *ProjectStoragePolicy) AllowsResponseBody() bool {
	return p == nil || p.StoreResponseBody == nil || *p.StoreResponseBody
}

func (p *ProjectStoragePolicy) AllowsChunks() bool {
	return p == nil || p.StoreChunks == nil || *p.StoreChunks
}

type ProjectProfile struct {
	Name                 string               `json:"name"`
	ChannelIDs           []int                `json:"channelIDs,omitempty"`
	ChannelTags          []string             `json:"channelTags,omitempty"`
	ChannelTagsMatchMode ChannelTagsMatchMode `json:"channelTagsMatchMode,omitempty"`
}

func (p *ProjectProfile) MatchChannelTags(tags []string) bool {
	if p == nil || len(p.ChannelTags) == 0 {
		return true
	}

	return MatchChannelTags(p.ChannelTags, p.ChannelTagsMatchMode, tags)
}
