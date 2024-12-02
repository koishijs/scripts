import { execSync } from 'child_process'
import { basename, join, relative } from 'path'
import { extract } from 'tar'
import getRegistry from 'get-registry'
import parse from 'yargs-parser'
import prompts from 'prompts'
import axios from 'axios'
import which from 'which-pm-runs'
import kleur from 'kleur'
import * as fs from 'fs'

let project: string
let rootDir: string

const { version } = require('../package.json')

const cwd = process.cwd()
const argv = parse(process.argv.slice(2), {
  alias: {
    ref: ['r'],
    forced: ['f'],
    git: ['g'],
    mirror: ['m'],
    prod: ['p'],
    template: ['t'],
    yes: ['y'],
  },
})

function agentInstall(agent: string) {
  const commands: { [agent: string]: string } = {
    yarn: '',
    npm: 'install',
    pnpm: 'install',
    deno: 'install',
  }
  return `${agent} ${commands[agent] ?? commands['npm']}`
}

function agentRun(agent: string, script: string) {
  const commands: { [agent: string]: string } = {
    'yarn': '',
    'npm': ' run',
    'pnpm': ' run',
    'deno': ' task',
  }
  return `${agent}${commands[agent] ?? commands['npm']} ${script}`
}

function supports(command: string) {
  try {
    execSync(command, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function getName() {
  if (argv._[0]) return '' + argv._[0]
  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: 'Project name:',
    initial: 'koishi-app',
  })
  return name.trim() as string
}

// baseline is Node 12 so can't use rmSync
function emptyDir(root: string) {
  for (const file of fs.readdirSync(root)) {
    const abs = join(root, file)
    if (fs.lstatSync(abs).isDirectory()) {
      emptyDir(abs)
      fs.rmdirSync(abs)
    } else {
      fs.unlinkSync(abs)
    }
  }
}

async function confirm(message: string) {
  const { yes } = await prompts({
    type: 'confirm',
    name: 'yes',
    initial: 'Y',
    message,
  })
  return yes as boolean
}

async function prepare() {
  if (!fs.existsSync(rootDir)) {
    return fs.mkdirSync(rootDir, { recursive: true })
  }

  const files = fs.readdirSync(rootDir)
  if (!files.length) return

  if (!argv.forced && !argv.yes) {
    console.log(kleur.yellow(`  Target directory "${project}" is not empty.`))
    const yes = await confirm('Remove existing files and continue?')
    if (!yes) process.exit(0)
  }

  emptyDir(rootDir)
}

async function scaffold() {
  console.log(kleur.dim('  Scaffolding project in ') + project + kleur.dim(' ...'))

  const registry = (await getRegistry()).replace(/\/$/, '')
  const template = argv.template || '@koishijs/boilerplate'

  try {
    const { data: remote } = await axios.get(`${registry}/${template}`)
    const version = remote['dist-tags'][argv.ref || 'latest']
    const url = remote.versions[version].dist.tarball
    const { data } = await axios.get<NodeJS.ReadableStream>(url, { responseType: 'stream' })

    await new Promise<void>((resolve, reject) => {
      const stream = data.pipe(extract({ cwd: rootDir, newer: true, strip: 1 }))
      stream.on('finish', resolve)
      stream.on('error', reject)
    })
  } catch (err) {
    if (!axios.isAxiosError(err) || !err.response) throw err
    const { status, statusText } = err.response
    console.log(`${kleur.red('error')} request failed with status code ${status} ${statusText}`)
    process.exit(1)
  }

  writePackageJson()
  writeEnvironment()

  console.log(kleur.green('  Done.\n'))
}

function writePackageJson() {
  const filename = join(rootDir, 'package.json')
  const meta = require(filename)
  meta.name = project
  meta.private = true
  meta.version = '0.0.0'
  if (argv.prod) {
    // https://github.com/koishijs/koishi/issues/994
    // Do not use `NODE_ENV` or `--production` flag.
    // Instead, simply remove `devDependencies` and `workspaces`.
    delete meta.workspaces
    delete meta.devDependencies
  }
  fs.writeFileSync(filename, JSON.stringify(meta, null, 2) + '\n')
}

function writeEnvironment() {
  const filename = join(rootDir, '.env')
  if (!fs.existsSync(filename)) return
  const content = fs.readFileSync(filename, 'utf8')
  fs.writeFileSync(filename, content)
}

async function initGit() {
  if (!argv.git || !supports('git --version')) return
  execSync('git init', { stdio: 'ignore', cwd: rootDir })
  console.log(kleur.green('  Done.\n'))
}

async function install() {
  // with `-y` option, we don't install dependencies
  if (argv.yes) return

  const agent = which()?.name || 'npm'
  const yes = await confirm('Install and start it now?')
  if (yes) {
    execSync([agent, 'install'].join(' '), { stdio: 'inherit', cwd: rootDir })
    execSync([agent, agent === 'deno' ? 'task' : 'run', 'start'].join(' '), { stdio: 'inherit', cwd: rootDir })
  } else {
    console.log(kleur.dim('  You can start it later by:\n'))
    if (rootDir !== cwd) {
      const related = relative(cwd, rootDir)
      console.log(kleur.blue(`  cd ${kleur.bold(related)}`))
    }
    console.log(kleur.blue(`  ${agentInstall(agent)}`))
    console.log(kleur.blue(`  ${agentRun(agent, 'start')}`))
    console.log()
  }
}

async function start() {
  console.log()
  console.log(`  ${kleur.bold('Create Koishi')}  ${kleur.blue(`v${version}`)}`)
  console.log()

  const name = await getName()
  rootDir = join(cwd, name)
  project = basename(rootDir)

  await prepare()
  await scaffold()
  await initGit()
  await install()
}

start().catch((e) => {
  console.error(e)
})
