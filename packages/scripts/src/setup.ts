import { CAC } from 'cac'
import { copyFile, mkdir, readFile, readJson, writeFile } from 'fs-extra'
import { execSync, spawn } from 'child_process'
import { resolve } from 'path'
import { cwd, meta } from '.'
import { blue, red } from 'kleur'
import { PackageJson } from 'yakumo'
import which from 'which-pm-runs'
import prompts from 'prompts'

function supports(command: string) {
  try {
    execSync(command, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

class Initiator {
  name!: string
  desc!: string
  fullname!: string
  monorepo!: string
  target!: string
  source = resolve(__dirname, '../template')

  constructor(private options: Options) {}

  async start(name: string) {
    await this.init(name)
    const agent = which()?.name || 'npm'
    const args: string[] = agent === 'yarn' ? [] : ['install']
    execSync([agent, ...args].join(' '), { stdio: 'inherit' })
  }

  async init(name: string) {
    name ||= await this.getName()
    const oldName = name
    name = name.toLowerCase().replace(/_/g, '-')
    if (!/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name)) {
      console.log(red('error'), 'plugin name contains invalid character')
      process.exit(1)
    }
    if (oldName !== name) {
      console.log(blue('info'), `plugin name will be converted to "${name}"`)
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: 'OK?',
      })
      if (!confirm) process.exit(0)
    }
    if (name.includes('koishi-plugin-')) {
      this.fullname = name
      this.name = name.replace('koishi-plugin-', '').replace(/^@.+\//, '')
      console.log(blue('info'), 'prefix "koishi-plugin-" can be omitted')
    } else {
      this.name = name.replace(/^@.+\//, '')
      this.fullname = name.replace(/^(.+\/)?/, '$1koishi-plugin-')
    }
    this.desc = await this.getDesc()
    if (this.options.monorepo) {
      this.monorepo = resolve(cwd, 'external', this.name)
      this.target = resolve(cwd, 'external', this.name, 'packages', this.name)
    } else {
      this.target = resolve(cwd, 'external', this.name)
    }
    await this.write()
  }

  async getName() {
    const { name } = await prompts({
      type: 'text',
      name: 'name',
      message: 'plugin name:',
    })
    return name.trim() as string
  }

  async getDesc() {
    const { desc } = await prompts({
      type: 'text',
      name: 'desc',
      message: 'description:',
    })
    return desc as string
  }

  async write() {
    await mkdir(this.target, { recursive: true })
    await Promise.all([
      this.writeManifest(),
      this.writeTsConfig(),
      this.writeIndex(),
      this.writeReadme(),
      this.writeClient(),
    ])
    await this.initGit()
  }

  async writeManifest() {
    if (this.monorepo) {
      const source: Partial<PackageJson> = await readJson(this.source + '/package.root.json', 'utf8')
      source.devDependencies = meta.devDependencies
      await writeFile(this.monorepo + '/package.json', JSON.stringify({
        name: `@root/${this.name}`,
        ...source,
      }, null, 2) + '\n')
    }

    const source: Partial<PackageJson> = await readJson(this.source + '/package.json', 'utf8')
    if (this.options.console) {
      source.devDependencies!['@koishijs/client'] = meta.devDependencies!['@koishijs/client']
      source.peerDependencies!['@koishijs/plugin-console'] = meta.dependencies!['@koishijs/plugin-console']
    }
    source.peerDependencies!['koishi'] = meta.dependencies!['koishi']
    await writeFile(this.target + '/package.json', JSON.stringify({
      name: this.fullname,
      description: this.desc,
      ...source,
    }, null, 2) + '\n')
  }

  async writeTsConfig() {
    const source = await readJson(this.source + '/tsconfig.base.json', 'utf8')
    if (this.monorepo) {
      await writeFile(this.monorepo + '/tsconfig.base.json', JSON.stringify(source, null, 2))
      await writeFile(this.monorepo + '/tsconfig.json', JSON.stringify({
        extends: './tsconfig.base',
        compilerOptions: {
          baseUrl: '.',
          paths: {
            [`koishi-plugin-${this.name}-*`]: ['packages/*/src'],
            [`koishi-plugin-*`]: ['packages/*/src'],
          },
        },
      }, null, 2) + '\n')
      await writeFile(this.target + '/tsconfig.json', JSON.stringify({
        extends: '../../tsconfig.base',
        compilerOptions: {
          outDir: 'lib',
          rootDir: 'src',
        },
        include: [
          'src',
        ],
      }, null, 2) + '\n')
    } else {
      await writeFile(this.target + '/tsconfig.json', JSON.stringify({
        ...source,
        include: [
          'src',
        ],
      }, null, 2) + '\n')
    }
  }

  async writeIndex() {
    await mkdir(this.target + '/src')
    const filename = `/src/index.${this.options.console ? 'console' : 'default'}.ts`
    const source = await readFile(this.source + filename, 'utf8')
    await writeFile(this.target + '/src/index.ts', source
      .replace(/\{\{name\}\}/g, this.name.replace(/^@\w+\//, '')))
  }

  async writeReadme() {
    const source = await readFile(this.source + '/readme.md', 'utf8')
    await writeFile(this.target + '/readme.md', source
      .replace(/\{\{name\}\}/g, this.fullname)
      .replace(/\{\{desc\}\}/g, this.desc))
  }

  async writeClient() {
    if (!this.options.console) return
    await mkdir(this.target + '/client')
    await Promise.all([
      copyFile(this.source + '/client/index.ts', this.target + '/client/index.ts'),
      copyFile(this.source + '/client/page.vue', this.target + '/client/page.vue'),
      copyFile(this.source + '/client/tsconfig.json', this.target + '/client/tsconfig.json'),
    ])
  }

  async initGit() {
    if (!this.options.git || !supports('git --version')) return
    await Promise.all([
      copyFile(this.source + '/_editorconfig', this.target + '/.editorconfig'),
      copyFile(this.source + '/_gitattributes', this.target + '/.gitattributes'),
      copyFile(this.source + '/_gitignore', this.target + '/.gitignore'),
    ])
    spawn('git', ['init'], { cwd: this.target, stdio: 'ignore' });
    spawn('git', ['add', '.'], { cwd: this.target, stdio: 'ignore' });
    spawn('git', ['commit', '-m', '"initial commit"'], { cwd: this.target, stdio: 'ignore' });
  }
}

interface Options {
  monorepo?: boolean
  console?: boolean
  git?: boolean
}

export default function (cli: CAC) {
  cli.command('setup [name]', 'initialize a new plugin')
    .alias('create')
    .alias('init')
    .alias('new')
    .option('-m, --monorepo', 'setup for monorepo')
    .option('-c, --console', 'with console extension')
    .option('-G, --no-git', 'skip git initialization')
    .action(async (name: string, options) => {
      new Initiator(options).start(name)
    })
}
