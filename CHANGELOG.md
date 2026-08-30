# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.2] - 2026-08-30

### Security

- Enforced session ownership across job reports, exports, deletion execution, cancellation, status, and progress access.
- Prevented cross-session access to cleanup job data and history exports.
- Hardened constant-time administrator password verification using fixed-length digest comparison.

### Fixed

- Corrected Discord rate-limit bucket handling using bucket identity scoped to major resource parameters (`channel_id`, `guild_id`).
- Added safe handling for global and route-specific Discord rate limits.
- Fixed malformed rate-limit header parsing and explicit retry exhaustion handling for 429 and 5xx responses.
- Fixed scanner pagination to ensure per-channel message limits cannot be exceeded across multi-page scans.
- Corrected Discord bulk-delete eligibility to enforce the strict 14-day boundary (`age < 14 days`).
- Eliminated deletion execution race conditions with atomic job state transitions and database lock verification.
- Improved SSE resilience and recovery when deletion progress connections are interrupted.

### Tests

- Expanded deterministic behavioral test coverage for rate limiting, major resource scoping, scanner pagination boundaries, session isolation, deletion concurrency, Discord permission resolution, constant-time authentication, and exact bulk-delete age boundaries.
