import { CAC } from 'cac'
import { execSync } from 'child_process'
import which from 'which-pm-runs'
import prompts from 'prompts'

async function getRepo() {
  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: 'repository name:',
  })
  return name.trim() as string
}

async function getName(initial?: string) {
  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: 'target directory:',
    initial,
  })
  return name.trim() as string
}

export default function (cli: CAC) {
  cli.command('clone [repo] [name]', 'clone a plugin')
    .action(async (repo: string, name: string, options) => {
      let initial: string | undefined
      let cap: RegExpExecArray | null
      repo ||= await getRepo()
      if ((cap = /^(?:https:\/\/github\.com\/)?([\w-]+)\/([\w-]+)(?:\.git)?$/.exec(repo))) {
        initial = cap[3]
        if (!repo.startsWith('https:')) {
          repo = 'https://github.com/' + repo
        }
        if (!repo.endsWith('.git')) {
          repo = repo + '.git'
        }
      }
      name ||= await getName(initial)
      execSync(['git', 'clone', repo, 'external/' + name.replace('koishi-plugin-', '')].join(' '), { stdio: 'inherit' })
      const agent = which()?.name || 'npm'
      execSync([agent, 'exec', 'yakumo', 'prepare'].join(' '), { stdio: 'inherit' })
      const args: string[] = agent === 'yarn' ? [] : ['install']
      execSync([agent, ...args].join(' '), { stdio: 'inherit' })
    })
}
