var winston = require('winston'),
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    env = require('./env'),
    echoAndExec = require('./echoAndExec'),
    parseJazzHistory = require('./parseJazzHistory');

module.exports = {
    init: function(env, existingWorkspaceName){
        winston.error('PUSH');
        // For each of the repositories listed in config.repositories:
        //      Run `git push` to push the repository
        // Done!

        // For each of the repositories listed in config.repositories:
        //      Run `git push` to push the repository
        async.eachSeries(env.config.repositories, function(repository, callback){
            var repoPath = path.resolve(repository);
            fs.mkdir(repoPath, function(err){
                if(err){ return callback(err); }

                echoAndExec(null, ['git', 'push'], {
                    cwd: repoPath
                }, function(err, stdout, stderr){
                    winston.info(stdout);
                    callback(err);
                });
            });
        }, function(err){
            winston.info('did finish push?', err);
        });
    }
};
