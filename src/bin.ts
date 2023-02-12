#!/usr/bin/env node

import registerSetupCommand from './setup'
import CAC from 'cac'

const { version } = require('../package.json')

const cli = CAC('koishi-scripts').help().version(version)

registerSetupCommand(cli)

cli.parse()

if (!cli.matchedCommand) {
  cli.outputHelp()
}
