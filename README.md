# dock-claude

Run Claude Code inside Docker with a host directory mounted as `/workspace`.

## Usage

```sh
npx dock-claude
dock-claude ~/src/my-project
dock-claude . --dangerously-skip-permissions
```

Arguments after the directory are passed to `claude`. Use `.` before Claude
flags when mounting the current directory.

## Options

- `--image <name>`: Docker image tag. Defaults to
  `dock-claude-(dirname):latest`.
- `--rebuild`: rebuild before running.
- `--docker-file <path>`: Dockerfile for `docker build`. Defaults to
  `Dockerfile.dock-claude` in the mounted directory, falling back to the
  packaged Dockerfile.
- `--docker-context <path>`: build context for `docker build`. Defaults to the
  mounted directory.
- `--guest-mount <path>`: repeatable workspace-relative path hidden by a
  guest-only volume. Defaults to `node_modules`.
- `--mount <host:guest>`: repeatable extra host bind mount. Relative host paths
  resolve from the current directory; guest paths must be absolute.

Examples:

```sh
dock-claude --docker-file ./Dockerfile.dev --docker-context . --rebuild .
dock-claude --guest-mount dist --guest-mount packages/app/node_modules .
dock-claude --mount ~/.ssh:/workspace/.ssh --mount ../shared:/shared .
```

## Notes

- The image is built on first run.
- The container runs as the current host UID/GID.
- Claude state is stored in `.dock-claude/` inside the mounted directory.
- Host Claude config and Anthropic-related environment variables are not
  forwarded.
