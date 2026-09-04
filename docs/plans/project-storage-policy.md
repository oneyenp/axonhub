# Project-Level Request/Response Storage Policy Plan

## Goal

Add project-level controls for retaining request/response payloads without disabling AxonHub observability.

The implementation must allow a project to stop persisting request bodies, response bodies, and streaming chunks while continuing to retain operational metadata such as request IDs, traces, model/channel routing, status, latency, usage, and cost information.

This work is based on the stable upstream branch `release/v0.9.x`, starting from commit:

`46a85279c5d831a932d808e26b793a05b9167161`

The implementation branch is `checkout` in `oneyenp/axonhub`.

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
    StoreRequestBody  *bool
    StoreResponseBody *bool
    StoreChunks       *bool
}
```

Use optional/nullable values so existing projects inherit the global policy and retain current behavior.

Required work:

- update Ent project schema
- generate/update migration
- update generated Ent code
- expose the policy through GraphQL
- update project create/update/read paths as needed
- keep backward compatibility for existing installations

## Effective Storage Policy Resolver

Introduce one centralized resolver/service for project-aware storage decisions.

Conceptual flow:

```text
System StoragePolicy
        +
Project StoragePolicy
        |
        v
EffectiveStoragePolicy
        |
        +--> Request persistence
        +--> RequestExecution persistence
        +--> Response persistence
        +--> Streaming chunk persistence
```

Request persistence code should no longer independently read only `SystemService.StoragePolicy(ctx)` when deciding whether payload content is stored.

The resolver should accept the current project ID or derive it from the relevant request/execution object and return the effective policy.

This avoids inconsistent behavior where one persistence path honors the project policy while another does not.

## Request Body Persistence

Update `RequestService.CreateRequest()` so project policy controls request-body persistence.

When request-body retention is disabled:

- the upstream provider request must still function normally
- request metadata must still be created
- original request content must not be persisted to the database
- original request content must not be written to S3, filesystem, WebDAV, or other external storage
- sensitive request headers must not be retained as part of the payload-retention path

Do not implement this as a post-write cleanup operation. The body should never be written when retention is disabled.

## RequestExecution Persistence

Apply the same effective policy to `RequestExecution` records.

A project-level disable must cover retry/failover execution payloads as well as the user-facing request record.

When request or response retention is disabled, prevent persistence of:

- `RequestExecution.request_body`
- `RequestExecution.response_body`
- `RequestExecution.response_chunks`

This is necessary because provider execution records can otherwise reconstruct the original prompt/response even if the top-level Request record is hidden.

## Response Persistence

Update all response persistence paths to use the effective project policy, including:

- normal completed requests
- async task completion/update flows
- RequestExecution completion
- retry/failover execution flows
- any other code path that calls response-body persistence helpers

Audit all relevant `SetResponseBody(...)` and `SaveData(...)` calls.

When response retention is disabled:

- response data must still be forwarded to the client normally
- status/latency/usage/cost information must still be recorded
- response content must not be written to database or external storage

## Streaming

Streaming behavior requires separate treatment.

Distinguish between:

1. transient runtime buffering required to proxy/transform the stream
2. persistent storage of chunks

Disabling storage must not break the streaming protocol or prevent live forwarding.

Conceptual flow:

```text
Provider stream
     |
     +--> forward to client              unchanged
     +--> runtime protocol conversion    allowed in memory
     +--> latency/usage accounting       unchanged
     +--> persistent chunks
                |
          EffectiveStoragePolicy
                |
             disabled --> discard
```

Update `SaveRequestExecutionChunks` and any top-level request chunk persistence path so project policy is enforced before persistence.

## Trace and Observability

Do not disable Trace records merely because payload retention is disabled.

Trace should remain usable for request topology and operational debugging while payload content is unavailable.

Expected retained information includes:

- trace/thread relationships
- request/execution IDs
- project/model/channel relationships
- status
- retry/failover topology
- latency metrics
- token/usage accounting
- cost information
- timestamps

Expected non-retained information includes prompt/response payloads covered by the project policy.

## External Data Storage

The policy must apply equally to primary database storage and non-primary storage backends.

Current object paths include request/response and execution payload objects under project/request directories.

When retention is disabled, no corresponding payload object/file should be created in:

- S3-compatible storage
- local filesystem storage
- WebDAV
- other configured external `DataStorage` backends

This must be verified by tests and not left to later garbage collection.

## API and UI Semantics

The UI and API must distinguish between:

- actual empty JSON content
- payload not retained due to policy
- payload stored externally
- payload unavailable/error

Do not rely on `{}` alone to represent "not retained" because that is ambiguous.

Prefer the smallest compatible change that provides an explicit state to the frontend.

Project settings UI should provide controls similar to:

```text
Request & Response Storage

Request body      [ Inherit system setting ]
Response body     [ Disabled ]
Streaming chunks  [ Disabled ]

System:    Enabled
Project:   Disabled
Effective: Disabled
```

Request detail pages should show a clear message such as:

`Request body was not retained because this project's storage policy disables it.`

instead of presenting `{}` or `null` as though it were the actual model payload.

## Historical Data

Changing a project from enabled/inherit to disabled affects only new persistence operations.

Do not automatically delete already stored payloads.

Historical purge should remain a separate, explicit action if implemented later.

## Cache and Consistency

If project data is cached, policy updates must invalidate or bypass stale cache entries so a privacy change takes effect immediately for subsequent requests.

Ensure policy resolution is isolated per project and cannot leak across concurrent requests for different projects.

## Test Matrix

At minimum, cover the following effective-policy cases:

| System | Project | Request Body | Response Body | Chunks |
| --- | --- | --- | --- | --- |
| ON | inherit | stored | stored | follows system |
| ON | OFF | not stored | not stored | not stored |
| OFF | inherit | not stored | not stored | not stored |
| OFF | ON | not stored | not stored | not stored |

Additional coverage:

- non-streaming request
- streaming request
- provider retry
- failover across multiple RequestExecutions
- async response flows
- completed request
- failed request
- canceled request
- database primary storage
- external storage
- Trace still present
- usage/cost metrics still present
- latency metrics still present
- project isolation
- project policy cache invalidation
- UI/API representation for not-retained payloads
- existing projects default to inherit with unchanged behavior

## Expected Primary Change Areas

Likely files/modules include:

```text
internal/ent/schema/project.go
internal/server/biz/project.go
internal/server/biz/request.go
internal/server/biz/system.go
internal/server/gql/*
migrations/*
frontend/src/features/projects/*
frontend/src/features/requests/*
i18n resources
request/execution/storage tests
```

`internal/server/biz/request.go` is expected to remain the main persistence integration point because request, response, RequestExecution, external storage, and streaming chunk persistence already pass through this service in the stable branch.

## Implementation Order

1. Add project policy data model and migration.
2. Add GraphQL/backend project policy access.
3. Implement centralized effective-policy resolution.
4. Wire request-body persistence to the effective policy.
5. Wire RequestExecution request/response persistence to the effective policy.
6. Wire normal/async response persistence to the effective policy.
7. Wire streaming chunk persistence to the effective policy.
8. Audit all persistence calls for bypass paths.
9. Add explicit API/frontend not-retained semantics.
10. Add project settings UI.
11. Add backend and frontend tests.
12. Run generation, lint, unit tests, and relevant integration tests.

## Acceptance Criteria

The change is complete when all of the following are true:

- a project can disable request-body retention
- a project can disable response-body retention
- a project can disable streaming-chunk retention
- a project cannot override a system-wide disable
- disabled payloads are not persisted in DB or external storage
- provider requests and client responses continue to function normally
- streaming continues to function normally
- RequestExecution retry/failover payloads obey the same policy
- Trace/usage/cost/latency metadata remains available
- UI clearly indicates when content was intentionally not retained
- existing projects retain previous behavior after upgrade
- changing project policy takes effect for subsequent requests without stale-cache leakage
- no existing historical payload is automatically deleted
