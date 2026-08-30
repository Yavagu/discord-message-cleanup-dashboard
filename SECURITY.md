# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

## Reporting a Vulnerability

We take the security of this project and your Discord community very seriously.

If you discover a security vulnerability or security bug, please **DO NOT** open a public GitHub issue.

### Safe Reporting Guidelines

1. **Submit via GitHub Private Vulnerability Reporting** (if enabled on this repository) or contact the project maintainer privately.
2. Provide a detailed description of the issue, steps to reproduce, and potential impact.
3. **NEVER** include live Discord bot tokens, server credentials, administrator passwords, or production database dumps in your report. Always use sanitized/redacted sample values.

### Response Timeline
- **Acknowledgement**: Within 48 hours.
- **Triage & Status Update**: Within 5 business days.
- **Remediation & Patch**: Promptly delivered through an official patch release.

---

## Critical Security Principles of this Project

1. **Zero Token Persistence**: Discord bot tokens are stored purely in volatile backend session memory and are never written to SQLite, configuration files, environment files, or disk logs.
2. **Redacted Logging**: All server loggers are wrapped in automatic redacting interceptors that scrub authorization tokens, cookies, and secret keys from standard out.
3. **Immutable Snowflake Verification**: Destructive message deletions strictly enforce 17–20 digit Discord Snowflake User ID equality (`author.id === targetUserId`) and never rely on mutable display names or usernames.
4. **CSRF & HttpOnly Cookie Protection**: Administrative endpoints require cryptographically unique CSRF tokens and enforce `HttpOnly`, `SameSite=Strict` session cookies.
