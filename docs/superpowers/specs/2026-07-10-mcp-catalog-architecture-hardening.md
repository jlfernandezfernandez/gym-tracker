# MCP, catalog, and architecture hardening

## Goal

Make the current redesign smaller and easier to maintain while ensuring that a newly connected MCP agent can discover and use the complete exercise catalog correctly. Keep the API, MCP server, Mini App, and documentation as one versioned product contract.

## Scope

This change will:

- remove unnecessary frontend state and speculative abstractions identified by the ponytail review;
- make the body-map conversion and Spanish presentation cover every taxonomy value shipped in the exercise catalog;
- expose the catalog facets an agent needs to select exercises without guessing;
- tighten validation and documentation where the affected MCP/API flow currently relies on prose or permissive primitives;
- verify the frontend, Python modules, catalog mapping, and MCP tool schemas.

It will not introduce service/repository layers with one implementation, replace the framework stack, or normalize stable bundled catalog data into database tables without an operational need.

## Architecture

The product retains its existing boundaries:

1. The MCP server is the agent-facing adapter. Its server instructions explain workflow and cross-tool constraints; each tool description documents its own arguments and result.
2. FastAPI owns authorization, validation, domain transitions, and serialization.
3. PostgreSQL owns athlete profiles, sessions, planned exercises, performed sets, measurements, and any future mutable domain state.
4. The bundled exercise JSON is seed input for the exercise catalog. Database-backed `Exercise` rows remain the runtime source for catalog queries.
5. The Mini App consumes the API and owns presentation-only translations and body-map rendering.

MCP tools will continue returning structured Python values with explicit return annotations so FastMCP can publish output schemas. The MCP adapter will not duplicate domain logic from FastAPI.

## Persistence and migrations

Every persisted domain change must be represented in SQLModel and delivered through an Alembic migration. This includes new athlete facts, mutable exercise metadata, ownership rules that need constraints, or new relations.

No migration is required for this change:

- Spanish labels are presentation data.
- `body-highlighter` slugs are an adapter to a frontend library.
- catalog facets are derived from existing `Exercise` columns.
- MCP descriptions and validation are interface metadata.

If taxonomy aliases, translations, or muscle mappings later become editable, tenant-specific, externally synchronized, or independently versioned, they should move to PostgreSQL with stable identifiers, foreign keys, uniqueness constraints, and an Alembic data migration. Until then, storing them in tables would create two sources of truth.

## Exercise taxonomy and body map

The bundled JSON will be scanned for the distinct values of `body_part`, `muscle_group`, and `secondary_muscles`. Presentation labels and body-map aliases must explicitly cover that complete set.

Two concerns stay separate:

- Spanish formatting converts a catalog term into user-facing copy.
- Body-map conversion maps one or more catalog terms to the smaller vocabulary supported by `body-highlighter`.

Broad body parts and precise muscles may map to the same visual region. Terms with no anatomically reasonable shape in the library must be explicitly ignored rather than silently omitted. A small automated check will fail when a future catalog update introduces an unclassified term.

The body map remains informational. The newly added muscle-selection state and button interaction will be removed.

## MCP and API contract

Catalog discovery will expose the dimensions already stored on exercises: primary muscle groups, body parts, and equipment. Exercise search will accept those useful filters and keep bounded pagination. The exact endpoint/tool shape should reuse the existing catalog router and MCP adapter rather than add a new service layer.

The MCP guide will tell a new coach to discover valid facets, search the catalog, inspect a candidate when necessary, and then create a plan using returned exercise IDs. Tool docstrings will name relevant fields, defaults, and closed vocabularies without repeating the full workflow.

Changing a public tool requires synchronized updates to:

- its FastAPI query/body schema;
- its MCP signature, annotations, and docstring;
- all internal consumers;
- README tool inventory and usage guidance;
- published documentation that states the tool count or behavior.

Existing tools will be extended when that remains clear. A new tool is justified only if overloading an existing result would make its name or schema misleading.

## Frontend simplification

- `BusyButton` will rely on mutation pending state and the native `disabled` attribute; the extra timestamp guard is redundant with backend idempotency.
- `BodyMap` will render the supplied muscles without selection state.
- Spanish status, muscle, and weight formatting will be exported directly, without a pretend locale-switching architecture.
- Exercise lookup will use `find` rather than `findIndex` followed by indexing.
- CSS used only by removed interaction will be deleted.

Accessibility behavior, error reporting, and the backend duplicate-submit guard are not simplification targets.

## Backend quality rules

The affected endpoints will be reviewed for:

- validation at the HTTP boundary;
- ownership checks before reads and writes;
- one authoritative state transition per action;
- deterministic structured responses for MCP consumers;
- no duplicated query/domain logic in the MCP adapter;
- database constraints or Alembic migrations when an invariant must survive concurrent writers.

Findings outside this change's catalog and workout flow will be reported rather than expanded into an unrelated refactor.

## Verification

The minimum verification is:

- a catalog-taxonomy check covering all bundled values;
- frontend build/typecheck;
- Python compilation and available backend tests;
- MCP tool discovery/schema inspection;
- focused API checks for catalog facets and filtering;
- a final diff review for unnecessary complexity and documentation drift.

## Documentation

Update the README, coach instructions, MCP tool table/count, and published documentation affected by the contract. Documentation must describe the shipped interface, not a planned future state.
