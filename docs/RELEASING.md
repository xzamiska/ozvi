# Releasing a new version

Versions are semver: `1.4.2` = a fix, `1.5.0` = new features, `2.0.0` = a change that requires action from the admin. A release is triggered by the tag `vX.Y.Z` and [`.github/workflows/release.yml`](../.github/workflows/release.yml) takes care of the rest.

## Steps

1. `main` is green (CI workflow) and both cloud and staging are running without problems.
2. Have `packages/widget` or `packages/sdk` changed since the last release (`git log vPREVIOUS..HEAD -- packages/widget packages/sdk`)? Set their `version` in `package.json` to the release version (`1.5.0`): the packages follow Ozvi's version, so `@ozvi/widget@1.5.0` is the widget of server 1.5.0. A package that has not changed keeps its version and is not published again, so its versions have gaps. The `npm packages` workflow publishes to npm only a version that is not there yet; without the bump, npm users stay on the old version (the widget from the script on ozvi.io updates itself). The workflow only **stages** the version (`npm stage publish`); it is published only after approval with 2FA on npmjs.com or `npm stage list` → `npm stage approve <id>`.
3. Write the notes in `apps/web/releases/X.Y.Z.md`; the format is in [releases/README](../apps/web/releases/README.md). For a breaking change set `breaking: true`.
4. Commit the notes to `main` and tag:
   ```sh
   git tag -a v1.5.0 -m "Ozvi 1.5.0" && git push origin v1.5.0
   ```
5. The workflow:
   - builds `ghcr.io/xzamiska/ozvi` and `ghcr.io/xzamiska/ozvi-updater` for `amd64` and `arm64`,
   - pushes the tags `1.5.0`, `1.5`, `1` and `latest`,
   - creates a GitHub Release with the notes.

   Without the notes file the workflow fails and nothing is pushed.
6. Deploy the cloud (ozvi.io) to the new version once the workflow has finished: first staging again, built from the tagged `main`, then live from that same image. An image built before the tag (or before the release images were on ghcr.io) carries the previous version as `OZVI_RELEASED`, so ozvi.io would keep the new release out of its list and no server would hear of it. Only then does the release appear on `ozvi.io/releases` and in `releases.json`. From there, self-hosted servers and updaters find it: those in automatic mode install it overnight, the others see it in the admin (no e-mail is sent).

A pre-release `v1.5.0-rc.1` gets only its own tag. It does not move `1`, `1.5` or `latest`, so no updater installs it on its own, and it needs no notes.

## Images

- The `ozvi` and `ozvi-updater` packages on ghcr.io are public, like the repository. They are pulled without signing in.
- Visibility is in GitHub → Packages → package → Package settings. A new package is created as private after the first release, so it has to be switched to public once.
- The workflow signs in to the registry with its own `GITHUB_TOKEN`. It needs no other secrets.

## First release

`v1.0.0` was released on 2026-11-09.
