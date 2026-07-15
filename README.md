# dock-claude

Run Claude Code inside Docker with a host directory mounted as `/workspace`.

## Usage

```sh
npx dock-claude
```

By default, the command mounts the current directory. You can pass a directory as
the first argument:

```sh
dock-claude ~/src/my-project
```

Arguments after the directory are passed to `claude`. Pass a directory (use `.`
for the current one) before any `claude` flags:

```sh
dock-claude . --dangerously-skip-permissions
```

The wrapper builds the local Docker image on first run. By default, the image is
tagged as `dock-claude-(dirname):latest`, where `(dirname)` is the mounted
directory basename normalized by replacing non-alphanumeric characters with
`-`. Use `--rebuild` to force a rebuild or `--image <name>` to choose a
different image tag.

## Image builds

Pass build args to `docker build` by repeating `--docker-arg`. This is useful
with custom Dockerfiles that declare their own `ARG` values:

```sh
dock-claude --docker-file ./Dockerfile.dev --docker-arg FOO=bar --rebuild .
```

Passing a build arg rebuilds the image so the change takes effect.

Use `--docker-file <path>` and `--docker-context <path>` to build from a custom
Dockerfile or context. By default, the bundled `Dockerfile` and package root are
used:

```sh
dock-claude --docker-file ./Dockerfile.dev --docker-context . --rebuild .
```

Run `dock-claude --help` for the full list of options.

The container runs as the current host UID/GID so files created in the mounted
workspace are owned by the invoking user instead of root.

By default, host `node_modules/` is hidden inside the container with a
guest-only Docker volume mounted at `/workspace/node_modules`. Add more
workspace-relative guest-only mounts by repeating `--guest-mount`:

```sh
dock-claude --guest-mount dist --guest-mount packages/app/node_modules .
```

Claude's Docker login state is stored in `.dock-claude/` inside the mounted
directory. Host Claude config is not mounted.

Anthropic-related host environment variables are not forwarded.
