# Security policy

Security fixes target the current `main` branch. Older revisions do not have separate maintenance releases.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/iomarsuleiman/ossstudio/security/advisories/new). Include the affected revision, reproduction steps, impact and a minimal example. Do not include real credentials or visitor data.

If private reporting is unavailable, open an issue asking the maintainer for a private reporting channel without publishing exploit details. Keep vulnerability details private until a fix is available and disclosure has been coordinated.

## Deployment secrets

Keep Convex deployment keys, `EDITOR_TOKEN` and `QUEUE_OWNER_KEY` in the appropriate deployment environment. Never commit them or expose them in `NEXT_PUBLIC_` variables. Rotate any credential that has been disclosed.
