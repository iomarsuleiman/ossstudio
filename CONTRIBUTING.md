# Contributing to OSS Studio

Bug reports, museum improvements, accessibility fixes, translations and catalogue corrections are welcome. For larger changes, open an issue describing the visitor experience first.

## Local setup

Use Node.js 22 or newer and npm. Run `npm ci`, then `npm run dev`. The bundled catalogue works without Convex. For live features and backend setup, see [README.md](README.md) and [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

Copy `.env.example` to `.env.local` when configuring a backend. Keep credentials and deployment keys out of commits. Generated Convex files are committed; regenerate them when backend function signatures change.

## Before opening a pull request

Run:

```bash
npm ci
npm run lint
npm test
npm run build
```

Explain the problem and resulting behavior, list checks you ran, and include screenshots for visible changes. Check English and Arabic layouts, mobile controls and reduced motion when relevant. Keep public chat changes consistent across room and gallery channels.

Catalogue additions should include the upstream URL, license information and accurate English and Arabic copy. Do not imply that third-party models or projects share this repository's license.

By contributing, you agree to the [code of conduct](CODE_OF_CONDUCT.md) and license your contributions under the repository's [MIT license](LICENSE).
