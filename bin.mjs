#!/usr/bin/env node

import { mkdir, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { command, flag, arg, rest, description } from 'paparam'
import packageJson from './package.json' with { type: 'json' }

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const cliName = 'dock-claude'
const defaultGuestMounts = ['node_modules']

const cmd = command(
  cliName,
  description(
    'Run Claude Code inside Docker with a host directory mounted at /workspace.\n\n' +
      'Arguments after the directory are passed through to claude. Pass a directory (use .\n' +
      `for the current one) before any claude flags, e.g. ${cliName} . --version.`
  ),
  flag('--image <name>', 'Docker image name to use. Defaults to dock-claude-(dirname):latest.'),
  flag('--rebuild', 'Rebuild the image before running.'),
  flag(
    '--docker-file <path>',
    'Dockerfile path passed to docker build. Defaults to the bundled Dockerfile.'
  ),
  flag(
    '--docker-context <path>',
    'Build context passed to docker build. Defaults to the package root.'
  ),
  flag(
    '--docker-arg <key=value>',
    'Build arg passed to docker build. Can be specified multiple times.'
  ).multiple(),
  flag(
    '--guest-mount <path>',
    'Workspace-relative directory to mask with a guest-only Docker volume. Can be specified multiple times.'
  ).multiple(),
  flag('--version', 'Show package version.'),
  arg('[directory]', 'Directory to mount. Defaults to the current directory.'),
  rest('[...claudeArgs]', 'Arguments passed through to the claude command.'),
  async ({ flags, args }) => {
    if (flags.version) {
      console.log(packageJson.version)
      return
    }

    const mountDir = path.resolve(args.directory ?? process.cwd())
    if (!(await pathExists(mountDir))) fail(`directory does not exist: ${mountDir}`)

    await ensureDocker()

    const image = flags.image ?? `dock-claude-${imageNamePart(path.basename(mountDir))}:latest`
    const buildOptions = {
      dockerFile: path.resolve(flags.dockerFile ?? path.join(packageRoot, 'Dockerfile')),
      dockerContext: path.resolve(flags.dockerContext ?? packageRoot),
      buildArgs: flags.dockerArg ?? []
    }
    // Build args only take effect during a build, so any supplied arg implies a rebuild.
    const shouldBuild =
      flags.rebuild || buildOptions.buildArgs.length > 0 || !(await imageExists(image))

    if (shouldBuild) {
      await buildImage(image, buildOptions)
    }

    const guestMounts = defaultGuestMounts.concat(flags.guestMount ?? [])
    const result = await run(
      'docker',
      await dockerRunArgs(image, mountDir, guestMounts, cmd.rest ?? [])
    )
    process.exit(result.status ?? 1)
  }
)

function fail(message, status = 1) {
  console.error(`${cliName}: ${message}`)
  process.exit(status)
}

function imageNamePart(value) {
  const normalized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
  return normalized || 'workspace'
}

function guestMountTarget(mount) {
  if (typeof mount !== 'string' || mount.length === 0) fail('guest mount path cannot be empty')
  if (path.isAbsolute(mount)) fail(`guest mount must be relative to /workspace: ${mount}`)

  const normalized = path.posix.normalize(mount.replaceAll(path.sep, path.posix.sep))
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    fail(`guest mount must stay inside /workspace: ${mount}`)
  }

  return path.posix.join('/workspace', normalized)
}

function validateDockerArg(arg) {
  if (typeof arg !== 'string' || !arg.includes('=') || arg.startsWith('=')) {
    fail(`docker arg must use KEY=VALUE format: ${arg}`)
  }
}

async function pathExists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function run(bin, argv, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, argv, {
      stdio: options.stdio ?? 'inherit',
      cwd: options.cwd
    })

    let stdout = ''
    if (child.stdout) {
      if (options.encoding) child.stdout.setEncoding(options.encoding)
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
    }

    child.on('error', (error) => resolve({ status: null, error, stdout }))
    child.on('close', (status) => resolve({ status, stdout }))
  })
}

async function ensureDocker() {
  const result = await run('docker', ['--version'], {
    stdio: 'pipe',
    encoding: 'utf8'
  })
  if (result.error) fail('docker was not found on PATH')
  if (result.status !== 0) fail('docker is not available')
}

async function imageExists(image) {
  const result = await run('docker', ['image', 'inspect', image], {
    stdio: 'ignore'
  })
  return result.status === 0
}

async function buildImage(image, options) {
  if (!(await pathExists(options.dockerFile))) {
    fail(`Dockerfile does not exist: ${options.dockerFile}`)
  }
  if (!(await pathExists(options.dockerContext))) {
    fail(`Docker build context does not exist: ${options.dockerContext}`)
  }

  for (const arg of options.buildArgs) validateDockerArg(arg)

  const result = await run(
    'docker',
    [
      'build',
      '-t',
      image,
      '-f',
      options.dockerFile,
      ...options.buildArgs.flatMap((arg) => ['--build-arg', arg]),
      options.dockerContext
    ],
    { cwd: options.dockerContext }
  )
  if (result.status !== 0) fail(`failed to build Docker image ${image}`, result.status ?? 1)
}

async function dockerRunArgs(image, mountDir, guestMounts, claudeArgs) {
  const argv = ['run', '--rm']

  if (process.stdin.isTTY && process.stdout.isTTY) argv.push('-it')

  await mkdir(path.join(mountDir, '.dock-claude'), { recursive: true })

  argv.push(
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '-v',
    `${mountDir}:/workspace`,
    '-w',
    '/workspace',
    '-e',
    'HOME=/workspace/.dock-claude'
  )

  // Anonymous volumes hide selected host directories from the bind mount so
  // guest dependencies do not collide with host-installed files.
  for (const mount of guestMounts) {
    argv.push('-v', guestMountTarget(mount))
  }

  argv.push(image, ...claudeArgs)
  return argv
}

cmd.parse()
