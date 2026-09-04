# Project-Level Request/Response Storage Policy Plan

## Goal

Add project-level controls for retaining request/response payloads without disabling AxonHub observability.

The implementation must allow a project to stop persisting request bodies, response bodies, and streaming chunks while continuing to retain operational metadata such as request IDs, traces, model/channel routing, status, latency, usage, and cost information.

This work is based on the stable upstream branch `release/v0.9.x`, starting from commit:

`46a85279c5d831a932d808e26b793a05b9167161`

The implementation branch is `feature/project-storage-policy` in `oneyenp/axonhub`.

## Design Principles

1. Reuse the existing system-level `StoragePolicy` instead of introducing a parallel persistence mechanism.
2. Add a project-level override that produces an effective storage policy.
3. Project policy may tighten the system policy, but must not bypass a system-wide disable.
4. Disabling payload retention must prevent persistence at the source, including database and external storage backends.
5. Existing projects must preserve current behavior by default through an `inherit` policy.
6. Trace, usage, cost, latency, routing, and status observability must continue to work when payload retention is disabled.
7. Historical payloads must not be silently deleted when a project switches from enabled to disabled.

## Effective Policy Semantics

The project-level policy is tri-state for each supported storage option:

- `null` / unset: inherit system setting
- `false`: force disabled for this project
- `true`: request enabled, but still constrained by the system setting

Effective behavior:

| System | Project | Effective |
| --- | --- | --- |
| true | inherit | true |
| true | false | false |
| true | true | true |
| false | inherit | false |
| false | false | false |
| false | true | false |

The initial project policy fields should cover:

- request body retention
- response body retention
- streaming chunk retention

The design should be extensible for future options such as headers, execution payloads, or project-specific retention periods.

## Data Model

Extend the `Project` entity with a project storage policy rather than adding unrelated booleans directly to the project schema.

Conceptually:

```go
ProjectStoragePolicy {
    StoreRequestBody  *bool `json:"store_request_body,omitempty"`
    StoreResponseBody *bool `json:"store_response_body,omitempty"`
    StoreChunks       *bool `json:"store_chunks,omitempty"`
}
```

The field should be optional with an empty/default value that means inherit all system-level settings. Existing projects therefore keep their current behavior after migration.

## Effective Storage Policy Service

Introduce one resolver/helper responsible for combining system-level and project-level settings. Request persistence code should not independently query and combine policy fields.

Conceptually:

```text
System StoragePolicy
        +
Project StoragePolicy
        |
        v
EffectiveStoragePolicy
```

Project policy can only tighten the global policy:

```go
effective.StoreRequestBody = system.StoreRequestBody && projectAllowsRequestBody
effective.StoreResponseBody = system.StoreResponseBody && projectAllowsResponseBody
effective.StoreChunks = system.StoreChunks && projectAllowsChunks
```

The effective policy should be resolved once per relevant request flow where practical and reused through context/service helpers. Project-policy caches must be invalidated immediately after project policy changes.

## Request Persistence

Update `RequestService.CreateRequest` to use the effective project policy.

When request body retention is disabled:

- request processing and provider forwarding continue normally
- request metadata remains persisted
- request body is not serialized solely for trace persistence
- request body is not written to the database
- request body is not written to external DataStorage
- sensitive request headers should follow the same storage gate as the request payload unless existing behavior requires them independently

The implementation must preserve required schema semantics without using a misleading stored `{}` value as the user-visible indication that the actual request was empty.

## Request Execution Persistence

Apply the same effective policy to `RequestExecution` records. This is required because provider/channel execution bodies may otherwise preserve the same sensitive content even when the top-level Request body is disabled.

When payload storage is disabled, do not persist:

- execution request body
- execution response body
- execution response chunks

Execution metadata, status, channel/model information, errors, timing, retry information, and usage must remain available.

## Response Persistence

Update all response completion paths to use the effective project policy, including:

- normal synchronous completion
- asynchronous/polled completion
- RequestExecution completion
- retry/failover execution paths

When response retention is disabled:

- do not JSON-marshal the response solely for persistence
- do not write response payload to the database
- do not create response payload objects in external storage
- continue persisting status, external ID, latency, first-token latency, reasoning duration, usage, and cost information

## Streaming Chunks

Project policy must apply to persistent streaming chunks independently of live protocol processing.

Disabling chunk retention must not break:

- SSE forwarding
- protocol conversion
- first-token latency measurement
- token accounting
- live request execution

If runtime chunk buffering is required for protocol behavior, it may continue in memory, but persistent chunk serialization and DataStorage/DB writes must be skipped when the effective project policy disables chunks.

## Trace Behavior

Do not disable Trace or Request record creation merely because payload retention is disabled.

A metadata-only project should still expose the trace hierarchy and operational information:

```text
Trace
  Request
    model
    channel
    status
    latency
    usage/cost
    request body: not retained
    response body: not retained
```

The Trace entity itself should not require structural changes unless needed to surface payload-retention state.

## API and UI Semantics

Expose project storage policy through the existing Project GraphQL/API path and project settings UI.

Suggested UI:

```text
Request & Response Storage

Request body      [ Inherit system setting ]
Response body     [ Disabled ]
Streaming chunks  [ Disabled ]
```

Where useful, show both configured and effective values so administrators understand the interaction with the system-wide policy.

Request details must distinguish at least:

- content stored
- content intentionally not retained
- content stored externally
- content unavailable due to an error

Do not make an intentionally unretained payload look like a failed load or a genuinely empty `{}` request.

## External Data Storage

Project-level disabling must prevent creation of payload objects for all supported storage backends.

Paths currently shaped like these must not be created for disabled payload types:

```text
/{project}/requests/{request}/request_body.json
/{project}/requests/{request}/response_body.json
/{project}/requests/{request}/response_chunks.json
/{project}/requests/{request}/executions/{execution}/request_body.json
/{project}/requests/{request}/executions/{execution}/response_body.json
/{project}/requests/{request}/executions/{execution}/response_chunks.json
```

This applies to database-primary and external DataStorage configurations.

## Historical Data

Changing a project policy from enabled/inherit to disabled affects new persistence only.

It must not automatically delete previously saved payloads. Historical deletion should remain an explicit cleanup/purge operation and can be implemented separately if needed.

## Cleanup and Retention

The first implementation does not add project-specific retention days. Existing system cleanup/retention remains unchanged.

The project policy should be designed so a future project-specific retention setting can be added without changing the effective-policy architecture.

## Backend Test Matrix

At minimum test these effective-policy combinations:

| System | Project | Expected payload storage |
| --- | --- | --- |
| enabled | inherit | enabled |
| enabled | disabled | disabled |
| enabled | enabled | enabled |
| disabled | inherit | disabled |
| disabled | disabled | disabled |
| disabled | enabled | disabled |

Test across:

- non-streaming request
- streaming request
- RequestExecution
- provider retry/failover with multiple executions
- async completion
- failed/canceled request paths
- database storage
- external DataStorage
- project isolation
- project-policy update/cache invalidation

## Regression Requirements

Verify that disabling payload retention does not regress:

- trace creation and trace/request relationships
- usage logs and token accounting
- cost accounting
- latency/TTFT/reasoning metrics
- model/channel routing
- retry behavior
- streaming delivery
- API key/project authorization
- existing system-wide StoragePolicy behavior

Existing projects with no project override must behave exactly as before.

## Expected Main Change Areas

Backend:

```text
internal/ent/schema/project.go
internal/objects/*
internal/server/biz/project.go
internal/server/biz/request.go
internal/server/biz/system.go (only where reusable policy helpers belong)
internal/server/gql/*
internal/server/gc/* (regression verification; no new project retention in v1)
```

Frontend:

```text
frontend/src/features/projects/data/*
frontend/src/features/projects/components/*
frontend/src/features/requests/components/*
i18n resources
```

Generated Ent/GraphQL artifacts and schema migrations must be regenerated according to repository conventions.

## Acceptance Criteria

The implementation is complete when all of the following are true:

1. A project can independently configure request-body, response-body, and streaming-chunk persistence as inherit/enabled/disabled.
2. A project cannot re-enable storage that is globally disabled by the system policy.
3. Metadata-only requests still produce usable Request/Trace/Usage data.
4. Disabled payloads are written to neither DB nor external DataStorage.
5. RequestExecution payloads follow the same project policy.
6. Streaming continues functioning with chunk persistence disabled.
7. UI clearly communicates configured/effective policy and intentionally unretained payloads.
8. Existing projects inherit global policy and retain backward-compatible behavior.
9. Changing policy does not silently delete existing historical payloads.
10. Automated tests cover the policy matrix and persistence paths.
