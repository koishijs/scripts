import ts from 'typescript'
import ora from 'ora'
import prompts from 'prompts'

export const cwd = process.cwd()
export const meta: PackageJson = require(cwd + '/package.json')

export interface Config {
  mode?: 'monorepo' | 'separate' | 'submodule'
}

export const config: Config = {
  mode: 'monorepo',
  ...meta['koishi-scripts'],
}

export function requireSafe(id: string) {
  try {
    return require(id)
  } catch {}
}

export async function confirm(message: string) {
  const { value } = await prompts({
    name: 'value',
    type: 'confirm',
    message,
  })
  return value
}

export function exit(message: string) {
  const spinner = ora()
  spinner.info(message)
  return process.exit(0)
}

export type DependencyType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

export interface PackageJson extends Partial<Record<DependencyType, Record<string, string>>> {
  $dirty?: boolean
  name: string
  main?: string
  module?: string
  description?: string
  private?: boolean
  version?: string
  workspaces: string[]
}

interface Reference {
  path: string
}

export interface TsConfig {
  extends?: string
  files?: string[]
  references?: Reference[]
  compilerOptions?: ts.CompilerOptions
}
