var winston = require('winston'),
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    env = require('./env'),
    echoAndExec = require('./echoAndExec'),
    parseJazzHistory = require('./parseJazzHistory'),
    processComponents = require('./process');

module.exports = {
    init: function(env, existingWorkspaceName){
        winston.error('SETUP');
        // If rtc-workspace exists, bail
        // Create a RTC Workspace from the indicated stream
        // Create a rtc-workspace directory to house files from that RTC workspace
        // For each of the components listed in config.mapping:
        //      Load the component into the rtc-workspace directory
        //      Roll that workspace back to the initial commit
        //      Run a sync-and-commit
        // For each of the repositories listed in config.repositories:
        //      Create a folder for the repository
        //      Run `git init` to setup the repository
        // Done!

        // If rtc-workspace exists, bail
        if(fs.existsSync('rtc-workspace')){
            winston.error('`rtc-workspace` already exists, which means we have probably already setup in this environment');
            winston.error('exiting...');
            process.exit(1);
        }

        // Generate a unique workspace name
        var workspaceName = existingWorkspaceName,
            rtcWorkspacePath = path.resolve('rtc-workspace');
        if(!workspaceName){
            workspaceName = 'git-rtc-'+(+new Date()).toString(36);
        }
        async.series([
            // Create a rtc-workspace directory to house files from that RTC workspace
            function(callback){
                fs.mkdir(rtcWorkspacePath, function(err){
                    winston.info('Created `rtc-workspace` directory');
                    callback(err);
                });
            },
            // Ensure the user is logged into RTC
            function(callback){
                echoAndExec(null, [env.scm, 'login -r https://hub.jazz.net/ccm01 -n local', env.userPass], {
                    cwd: rtcWorkspacePath
                }, function(err, stdout, stderr){
                    winston.info(stdout);
                    callback(err);
                });
            },
            // Create a RTC Workspace from the indicated stream
            function(callback){
                if(existingWorkspaceName){
                    // An existing workspace already exists, so we're skipping this!
                    return callback();
                }
                echoAndExec(null, [env.scm, 'create workspace -r https://hub.jazz.net/ccm01 -s', '"'+env.stream+'"', workspaceName, env.userPass], {
                    cwd: rtcWorkspacePath
                }, function(err, stdout, stderr){
                    winston.info(stdout);
                    callback(err);
                });
            },
            // For each of the repositories listed in config.repositories:
            //      Create a folder for the repository
            //      Run `git init` to setup the repository
            function(callback){
                async.eachSeries(env.config.repositories, function(repository, callback){
                    var repoPath = path.resolve(repository);
                    fs.mkdir(repoPath, function(err){
                        if(err){ return callback(err); }

                        echoAndExec(null, ['git', 'init'], {
                            cwd: repoPath
                        }, function(err, stdout, stderr){
                            winston.info(stdout);
                            callback(err);
                        });
                    });
                }, callback);
            },
            // For each of the components listed in config.mapping:
            //      Roll that workspace back to the initial commit
            //      Load the component into the rtc-workspace directory
            //      Do a sync-and-commit
            function(callback){
                if(existingWorkspaceName){
                    // An existing workspace already exists, so we're skipping this!
                    return callback();
                }
                async.forEachOfSeries(env.config.mapping, function(mappings, component, callback){
                    var componentPath = path.resolve(rtcWorkspacePath, component);
                    rollbackRepo(env, workspaceName, component, function(err, lastChange){
                        if(err){ return callback(err); }

                        echoAndExec(null, [env.scm, 'load -r local -i', workspaceName, '"'+component+'"'], {
                            cwd: rtcWorkspacePath
                        }, function(err, stdout, stderr){
                            winston.info(stdout);


                            var repos = [];
                            _.each(mappings, function(value){
                                var repo = value;
                                if(repo.indexOf('/') !== -1){
                                    repo = repo.split('/').shift();
                                }
                                if(repos.indexOf(repo) === -1){
                                    repos.push(repo);
                                }
                            });
                            if(repos.length === 0){
                                repos = false;
                            }
                            processComponents.syncAndCommit(env, component, lastChange, callback, repos);
                        });
                    });
                }, function(err){
                    if(err){
                        winston.error('got error in doing workspace load?', err);
                    }
                    winston.info('finished loading workspaces!', arguments);
                });
            },
            function(callback){
                if(!existingWorkspaceName){
                    // A new workspace was handled in the above case (rollback + load)
                    return callback();
                }
                // For an existing workspace, we just need to load
                async.forEachOfSeries(env.config.mapping, function(mappings, component, callback){
                    echoAndExec(null, [env.scm, 'load -r local -i', workspaceName, '"'+component+'"'], {
                        cwd: rtcWorkspacePath
                    }, callback);
                }, function(err){
                    if(err){
                        winston.error('got error in doing workspace load?', err);
                    }
                    winston.info('finished loading workspaces!', arguments);
                });
            }
        ], function(err){
            // Done!
            winston.info('did finish setup?', err);
        });
    }
};

var parseBaselineList = function(stdout){
        var jazzResponse = stdout.split('\n');
        var changes = [];
        var getUUID = /^  Baseline: \(([0-9]+)\) /m;
        _.each(jazzResponse, function(row){
            var match = getUUID.exec(row);
            if(match){
                changes.push(match[1]);
            }
        });
        return changes;
    },
    count = 100,
    errorTolerance = 10,
    errs = 0,
    rollbackRepo = function(env, workspaceName, component, callback){
        // echoAndExec(null, [env.scm, 'list baselines -m 1000 -r https://hub.jazz.net/ccm01 -C', '"'+component+'"', env.userPass], null, function(err, stdout, stderr) {
        //     if (err) {
        //         winston.error('error running list baselines [stderr]:', stderr);
        //         winston.error('error running list baselines [stdout]:', stdout);
        //         return callback(err);
        //     }
        //
        //     var baselines = parseBaselineList(stdout);
        //     if(baselines.length === 0){
        //         return callback('error getting baselines!');
        //     }
        //     var lastBaseline = baselines[baselines.length-1];
        //     echoAndExec(null, [env.scm, 'add component -r https://hub.jazz.net/ccm01 -s', '"'+env.stream+'"', '-b', lastBaseline, env.userPass, workspaceName, '"'+component+'"'], null, function(err, stdout, stderr){
        //         if (err) {
        //             winston.error('error running add component [stderr]:', stderr);
        //             winston.error('error running add component [stdout]:', stdout);
        //             return callback(err);
        //         }
        //
        //         echoAndExec(null, [env.scm, 'show history -m 100 -r https://hub.jazz.net/ccm01 -C', '"'+component+'"', '-w', workspaceName, env.userPass], null, function(err, stdout, stderr) {
        //             if (err) {
        //                 winston.error('error running show history [stderr]:', stderr);
        //                 winston.error('error running show history [stdout]:', stdout);
        //                 return callback(err);
        //             }
        //
        //             var changes = parseJazzHistory(stdout);
        //             if(changes.length !== 1){
        //                 winston.error('error getting change (should only be one?!)');
        //                 return callback('error getting change (should only be one?!)');
        //             }
        //             return callback(null, changes[0]);
        //         });
        //     });
        // });

        // If we last ran successfully, reset the count to 100.
        if(errs === 0){
            count = 100;
        }

        echoAndExec(null, [env.scm, 'show history -m', count, ' -r https://hub.jazz.net/ccm01 -C', '"'+component+'"', '-w', workspaceName, env.userPass], null, function(err, stdout, stderr) {
            if (err) {
                winston.error('error running show history [stderr]:', stderr);
                winston.error('error running show history [stdout]:', stdout);
                return callback(err);
            }

            var changes = parseJazzHistory(stdout);

            // cannot discard the first change
            if (changes.length === 1) {
                return callback(null, changes[0]);
            }

            // to be safe, we can discard all but the first changeset, which might be
            // the last element in the array
            var uuids = changes.slice(0, -1).map(function (change) {
                return change.uuid;
            });

            echoAndExec(null, [env.scm, 'suspend -r https://hub.jazz.net/ccm01 -w', workspaceName, env.userPass, '--overwrite-uncommitted', uuids.join(' ')], null, function(err, stdout, stderr) {
                if (err) {
                    // Sometimes there are issues suspending changesets due to possible merge situations.
                    // This attempts to handle that by backing off how many changesets we process at a time,
                    // then switching back to 100 at a time once the errors seem to pass. This seems to allow one
                    // to get past that merge conflict by getting a large enough bundle of changesets at once to jump
                    // past the issue.
                    if(errs++ > errorTolerance){
                        return callback(err);
                    }
                    // Slowly back off
                    count = Math.ceil(count / 2);
                    if(count < 2){
                        count = 2;
                    }

                    return rollbackRepo(env, workspaceName, component, callback);
                }

                // We ran successfully so reset errs to zero
                errs = 0;

                // recurse and attempt to discard more changes
                rollbackRepo(env, workspaceName, component, callback);
            });
        });
    };
