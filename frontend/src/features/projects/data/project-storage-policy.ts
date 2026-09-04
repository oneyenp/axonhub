import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTokenFromStorage } from '@/stores/authStore';

export type ProjectStoragePolicy = {
  storeRequestBody?: boolean | null;
  storeResponseBody?: boolean | null;
  storeChunks?: boolean | null;
};

export type EffectiveStoragePolicy = {
  store_chunks: boolean;
  live_preview: boolean;
  store_request_body: boolean;
  store_response_body: boolean;
};

export type ProjectStoragePolicyResponse = {
  configured: ProjectStoragePolicy | null;
  global: EffectiveStoragePolicy;
  effective: EffectiveStoragePolicy;
};

const endpoint = '/admin/project/storage-policy';

async function requestProjectStoragePolicy(
  projectId: string,
  method: 'GET' | 'PUT',
  body?: ProjectStoragePolicy
): Promise<ProjectStoragePolicyResponse> {
  const token = getTokenFromStorage();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Project-ID': projectId,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Project storage policy request failed (${response.status})`);
  }

  return response.json();
}

export function useProjectStoragePolicy(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['project-storage-policy', projectId],
    queryFn: () => requestProjectStoragePolicy(projectId, 'GET'),
    enabled: enabled && !!projectId,
  });
}

export function useUpdateProjectStoragePolicy(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (policy: ProjectStoragePolicy) => requestProjectStoragePolicy(projectId, 'PUT', policy),
    onSuccess: (data) => {
      queryClient.setQueryData(['project-storage-policy', projectId], data);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}
