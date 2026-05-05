# Releasing

This repository ships its built fonts via GitHub Releases. The pipeline is split between a local script (build + commit + tag push) and a GitHub Actions workflow (zip + GitHub Release creation).

## Prerequisites

- Node 18+
- A clean working tree on `master`
- Source fonts placed in `src/` (download from [notofonts/noto-cjk releases](https://github.com/notofonts/noto-cjk/releases) and unzip the Noto Sans JP `.otf` files there)
- `gh` CLI is **not** required — the GitHub Actions workflow uses the auto-provided `GITHUB_TOKEN`

## Steps

1. `npm install`
2. Place the upstream `.otf` files into `src/`
3. Preview the release:
   ```sh
   npm run release:dry -- --version <new-version>
   ```
   This runs `index.js`, prints the new size table, and shows the proposed `package.json` version. **No files outside `dist/` are touched.**
4. If the preview looks right, publish:
   ```sh
   npm run release -- --version <new-version>
   ```
   The script will:
   - Run `index.js`
   - Copy `dist/*.min.{ttf,woff,woff2}` to `docs/Fonts/NotoSansCJKjp/`
   - Update the size table in `README.md` (between `<!-- size-table:start -->` and `<!-- size-table:end -->`)
   - Update `package.json` `version`
   - Commit, tag (e.g. `3.2.0`), and push (including the tag)
5. The `.github/workflows/release.yml` workflow fires on the tag push, zips `docs/Fonts/NotoSansCJKjp/*.min.*` into `NotoSansCJKjp-min-<version>.zip`, and creates a GitHub Release with auto-generated release notes.

## Versioning

- Tags follow the existing convention: `1.0.0`, `2.0.0`, `3.0.0`, `3.1.0`, ... (no `v` prefix)
- The release workflow only fires on tags matching `[0-9]+.[0-9]+.[0-9]+`
- To record the upstream Noto-CJK version, mention it in the release commit message — `--generate-notes` will surface it in the published release body

## Rollback

- Delete release + tag in one shot:
  ```sh
  gh release delete <version> --cleanup-tag --yes
  ```
- Revert the source change locally:
  ```sh
  git revert HEAD
  git push
  ```
- If you have not yet pushed:
  ```sh
  git tag -d <version>
  git reset --hard HEAD~1
  ```

## Notes

- The `otf (Original)` column in `README.md` is preserved manually. It reflects upstream OTF sizes, which the release script does not read.
- `dist/` and `src/` are gitignored. The `docs/Fonts/NotoSansCJKjp/` directory is the canonical, checked-in copy of the latest minified fonts and is what the workflow zips.
