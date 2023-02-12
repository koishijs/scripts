import prompts from 'prompts'
import { PackageJson } from 'yakumo'

export const cwd = process.cwd()
export const meta: PackageJson = require(cwd + '/package.json')

export async function confirm(message: string) {
  const { value } = await prompts({
    name: 'value',
    type: 'confirm',
    message,
  })
  return value
}
