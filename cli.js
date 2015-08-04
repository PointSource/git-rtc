var program = require('commander'),
    getEnv = require('./env');

program
    .version('0.1.0')
    .option('-c, --config <path>', 'Path to JSON config file (e.g. \'config.json\')', 'config.json')
    .option('-U, --user <username>', 'Username for RTC (e.g. \'ben.schell@pointsource.com\')')
    .option('-P, --password <password>', 'Password for RTC (e.g. \'myPassword\')')
    .option('-s, --stream <stream>', 'Which RTC Stream on which to base the workspace.')
    .option('-a, --author <author name>', 'Default author name (e.g. \'Ben Schell\')')
    .option('-d, --default_domain <domain>', 'Default domain for creating email addresses', 'pointsource.com')
    .option('-w, --workspace <workspaceName>', 'Name of existing workspace to use instead of creating a new one.');

program
    .command('setup')
    .description('Create the RTC workspace, load components found in the config, and roll them back to the initial state.')
    .action(function(options){
        var env = getEnv(options.parent),
            setup = require('./setup');
        setup.init(env, options.parent.workspace);
    });

program
    .command('process')
    .description('Process all available changesets: Accept a changeset into the RTC workspace, syncronize files into the repository folders, create git commits, repeat.')
    .action(function(options){
        var env = getEnv(options.parent),
            processComponents = require('./process');
        processComponents.init(env);
    });

module.exports = program.parse(process.argv);
