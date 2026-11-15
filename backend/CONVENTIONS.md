# Backend Code Conventions

This guide describes where backend code belongs and how the modules should work together. It documents the current scaffold; the placeholder modules are not implemented yet.

## Directory Map

| Location | Put this here | Keep out |
| --- | --- | --- |
| `app.py` | Create the Flask application, load configuration, register route blueprints, and provide the local development entry point. | Endpoint behavior, data-provider logic, and large validation routines. |
| `routes/` | Flask blueprints and HTTP handlers. Read request parameters, call validation and service functions, then translate results into HTTP responses. | Catalog queries, image processing, or other domain workflows. |
| `services/` | Application and domain behavior: coordinate metadata lookup, frame retrieval, and orchestration of provider calls. | Flask request/response objects and direct HTTP status handling. |
| `schemas/` | Request and response shapes, field validation, normalization, and serialization helpers. | Flask route registration and external data retrieval. |
| `tests/` | Automated tests for routes, services, and schemas. Keep tests focused on one behavior and replace external providers with controlled test doubles. | Production modules or test-only behavior imported by application code. |
| `requirements.txt` | Runtime and development Python dependencies used by the backend. | Unpinned ad hoc package notes or frontend dependencies. |
| `API_STANDARD.md` | API contracts and HTTP behavior, including validation, responses, rate limiting, and API-focused tests. | Internal module placement rules. |
| `CONVENTIONS.md` | Backend module ownership and dependency direction. | Endpoint-specific response examples that belong in the API standard. |

## Dependency Direction

Use this direction for request handling:

`route -> schema validation -> service -> provider or data source`

- Routes depend on schemas and services, not the other way around.
- Services should accept ordinary Python values and return ordinary Python data; they should not depend on Flask globals such as `request` or `jsonify`.
- Schemas should be independent of routes and services so they can be reused and tested directly.
- Keep provider-specific access inside the service layer initially. Add a dedicated provider/adapter module only when there is enough provider-specific logic to justify the boundary.
- Avoid circular imports. Shared code belongs in the lowest-level module that owns the behavior, not in `app.py` as a general utility bucket.

## File Naming

- Use lowercase `snake_case.py` for Python modules and functions.
- Name route modules after the resource or capability they expose, for example `routes/metadata.py` and `routes/frames.py`.
- Name service modules after the behavior they own, for example `services/metadata_service.py`.
- Name schema modules after the payload or concept, for example `schemas/query.py` and `schemas/frame.py`.
- Name tests `test_<subject>.py` and group them by the behavior under test.

## Adding a Feature

1. Define or update its request and response shape in `schemas/`.
2. Implement domain behavior in the appropriate `services/` module.
3. Add or update the HTTP handler in `routes/` and register its blueprint in `app.py`.
4. Add focused tests in `tests/` for the schema, service, and route behavior as applicable.
5. Update `API_STANDARD.md` when the public endpoint contract or HTTP behavior changes.

Keep modules small and feature-oriented. Do not create a new abstraction or directory for a single trivial function unless it provides a clear ownership boundary or is required by the feature.
