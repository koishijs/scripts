#!/usr/bin/env node

import registerCloneCommand from './clone'
import registerSetupCommand from './setup'
import CAC from 'cac'

const { version } = require('../package.json')

const cli = CAC('koishi-scripts').help().version(version)

registerCloneCommand(cli)
registerSetupCommand(cli)

cli.parse()

if (!cli.matchedCommand) {
  cli.outputHelp()
}
