var winston = require('winston'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    _ = require('underscore'),
    parseJazzHistory = require('./parseJazzHistory'),
    echoAndExec = require('./echoAndExec'),
    Rsync = require('rsync');

var workspaceName,
    rtcWorkspacePath;

module.exports = {
    init: function(env, checkLastCommit){
        winston.error('PROCESS');
        // Fail if rtc-workspace doesn't exist
        // For each of the components listed in config.mapping:
        //      Fail if a folder for the component doesn't exist in rtc-workspace
        // For each of the repositories listed in config.repositories:
        //      Fail if a folder for the repository doesn't exist

        // For each of the components listed in config.mapping:
        //      Get incoming changesets
        //      While we have a changeset
        //          Run sync-and-commit
        //          Move the current changeset forward one from the history
        // If callback, call it!
        // Done!


        // Fail if rtc-workspace doesn't exist
        if(!fs.existsSync('rtc-workspace')){
            winston.error('`rtc-workspace` doesn\'t exist; Please run setup');
            process.exit(1);
        }
        rtcWorkspacePath = path.resolve('rtc-workspace');
        // For each of the components listed in config.mapping:
        //      Fail if a folder for the component doesn't exist in rtc-workspace
        _.each(env.config.mapping, function(mapping, component){
            if(!fs.existsSync(path.resolve(rtcWorkspacePath, component))){
                winston.error(rtcWorkspacePath, '/', component, 'doesn\'t exist; Please run setup');
                process.exit(1);
            }
        });
        // For each of the repositories listed in config.repositories:
        //      Fail if a folder for the repository doesn't exist
        _.each(env.config.repositories, function(repository){
            if(!fs.existsSync(path.resolve(repository))){
                winston.error(repository, 'doesn\'t exist; Please run setup');
                process.exit(1);
            }
        });

        // For each of the components listed in config.mapping:
        async.forEachOfSeries(env.config.mapping, function(mapping, component, callback){
            winston.info('[process] starting on:', component, checkLastCommit);
            var componentPath = path.resolve(rtcWorkspacePath, component);

            // Get upcoming changesets
            echoAndExec(null, [env.scm, ' show status -i in:cbC -j', env.userPass], {
                cwd: componentPath
            }, function(err, stdout, stderr) {
                if(err){
                    winston.error('Error running scm show status [stderr]:', stderr);
                    winston.error('Error running scm show status [stdout]:', stdout);
                    return callback(err);
                }

                // winston.info(stdout);
                var jazzResponse = JSON.parse(stdout);

                // get the RTC change set history and reverse it to get it in
                // chronological order
                var orderedHistory;

                workspaceName = jazzResponse.workspaces[0].name;

                if (jazzResponse.workspaces[0].components[0]['incoming-baselines']) {
                    orderedHistory = jazzResponse.workspaces[0].components[0]['incoming-baselines'].reverse().reduce(function(history, baseline) {
                        return history.concat(baseline.changes.reverse());
                    }, []);
                } else {
                    orderedHistory = [];
                }

                if (jazzResponse.workspaces[0].components[0]['incoming-changes']){
                    orderedHistory =
                        orderedHistory.concat(jazzResponse.workspaces[0].components[0]['incoming-changes'].reverse());
                }

                if (checkLastCommit) {
                    echoAndExec(null, [env.scm, 'show history -j -m 1', env.userPass], {
                        cwd: componentPath
                    }, function(err, stdout, stderr) {
                        if(err){
                            winston.error('Error running scm show history [stderr]:', stderr);
                            winston.error('Error running scm show history [stdout]:', stdout);
                            return callback(err);
                        }

                        var jazzResponse = JSON.parse(stdout);
                        var changes = jazzResponse.changes;

                        orderedHistory = changes.concat(orderedHistory);
                        module.exports.processHistory(env, component, componentPath, orderedHistory, callback, true);
                    });
                }else{
                    module.exports.processHistory(env, component, componentPath, orderedHistory, callback);
                }
            });
        }, function(err){
            // Done?
            if(err){
                winston.error('error while iterating over components', err);
                throw err;
            }
            winston.info('done processing components');
        });
    },
    processHistory: function(env, component, componentPath, orderedHistory, callback, skipAccept){

        if(!orderedHistory || orderedHistory.length === 0){
            winston.info('no changesets to process');
            return callback();
        }

        // While we have a changeset
        //      Run sync-and-commit
        //      Move the current changeset forward one from the history
        var count = 0,
            doSkipAccept = skipAccept;
        async.whilst(
            function(){ // Check condition
                return orderedHistory.length > 0;
            },
            function(callback){ // Loop
                var change = orderedHistory.shift();
                winston.info('=======================================');
                winston.info('Processing change set', (++count), '(', orderedHistory.length, 'left)');

                if(doSkipAccept){
                    doSkipAccept = false;
                    module.exports.syncAndCommit(env, component, change, callback);
                }else{
                    echoAndExec(null, [env.scm, 'accept', change.uuid, env.userPass, ' --overwrite-uncommitted'], {
                        cwd: componentPath
                    }, function (err, stdout, stderr) {
                        if(err && stdout.indexOf('Following workspaces still have conflicts after accept') !== -1){
                            // There was a conflict (?!) after that last accept
                            // Let's discard any local changes
                            // Unload the component:
                            //  (in rtcWorkspacePath) scm unload -i -C <componentName>
                            // Load the component:
                            //  (in rtcWorkspacePath) scm load -r <repoURL> <workspaceName> <componentName>
                            // Then syncAndCommit

                            echoAndExec(null, [env.scm, 'unload -i -D -C', '"'+component+'"', env.userPass], {
                                cwd: rtcWorkspacePath
                            }, function(err, stdout, stderr){
                                if(err){
                                    winston.error('Error running lscm unload [stderr]:', stderr);
                                    winston.error('Error running lscm unload [stdout]:', stdout);
                                    return callback(err);
                                }

                                echoAndExec(null, [env.scm, 'load -r https://hub.jazz.net/ccm01 -i -f', workspaceName, '"'+component+'"', env.userPass], {
                                    cwd: rtcWorkspacePath
                                }, function(err, stdout, stderr){
                                    if(err){
                                        winston.error('Error running lscm load [stderr]:', stderr);
                                        winston.error('Error running lscm load [stdout]:', stdout);
                                        return callback(err);
                                    }

                                    // OK, now we can syncAndCommit
                                    module.exports.syncAndCommit(env, component, change, callback);
                                });
                            });
                            return;
                        }

                        // If we had some other kind of error, no clue!
                        if(err){
                            winston.error('Error running lscm accept [stderr]:', stderr);
                            winston.error('Error running lscm accept [stdout]:', stdout);
                            return callback(err);
                        }

                        // All clear, so syncAndCommit
                        module.exports.syncAndCommit(env, component, change, callback);
                    });
                }
            },
            function(err){ // Finally
                if(err){
                    winston.error('error while processing changesets', err);
                }
                winston.info('did finish processing changesets!');
                callback(err);
            }
        );
    },
    syncAndCommit: function(env, component, change, callback){

        // Get mappings from env.config.mapping[component]
        var mapping = env.config.mapping[component];
        if(!mapping){
            return callback('Component not found in config.mapping');
        }

        // For key : value in the mappings listed:
        async.forEachOfSeries(mapping, function(destinationFolder, sourceFolder, callback){
            // Rsync from ./rtc-workspace/{component}/{sourceFolder} to ./{destinationFolder}
            var sourcePath = path.resolve('rtc-workspace', component, sourceFolder) + path.sep,
                destPath = path.resolve(destinationFolder) + path.sep;
            if(fs.existsSync(sourcePath)){
                // Build the command
                var rsync = new Rsync()
                    .flags('az')
                    .source(sourcePath)
                    .destination(destPath);

                // Execute the command
                winston.info('rsyncing from:', sourcePath, 'to:', destPath);
                rsync.execute(function(error, code, cmd) {
                    // we're done
                    if(error){
                        winston.error('RSYNC error:', code, error);
                    }
                    callback(error);
                });
            }else{
                callback();
            }
        }, function(err){
            if(err){
                winston.error('got error while rsyncing.');
                return callback(err);
            }

            var gitAddAndCommit = function(change){
                // For each of the repositories listed in config.repositories:
                async.eachSeries(env.config.repositories, function(repository, callback){
                    // Check if there are changes (e.g. `git status` doesn't contain 'nothing to commit, working directory clean')
                    var repositoryPath = path.resolve(repository);
                    echoAndExec(null, 'git status', {
                        cwd: repositoryPath
                    }, function(err, stdout, stderr){
                        if(err){
                            winston.error('Error running git status [stderr]:', stderr);
                            winston.error('Error running git status [stdout]:', stdout);
                            return callback(err);
                        }

                        // If this repo is clean, return
                        if(stdout.indexOf('nothing to commit') !== -1){
                            return callback();
                        }

                        // Do a `git add -A` and `git commit` using message from changeset
                        echoAndExec(null, 'git add -A', {
                            cwd: repositoryPath
                        }, function(err, stdout, stderr){
                            if(err){
                                winston.error('Error running git add -A [stderr]:', stderr);
                                winston.error('Error running git add -A [stdout]:', stdout);
                                return callback(err);
                            }

                            if(!_.isDate(change.modified)){
                                change.modified = new Date(change.modified);
                            }

                            var comment = createCommitMessage(change),
                                name = (change.author || env.defaultAuthor),
                                email = convertToEmail(name, env.domain),
                                author = name + ' <' + email + '>',
                                modified = change.modified.toISOString();

                            var gitEnv = {};
                            gitEnv.GIT_COMMITTER_EMAIL = email;
                            gitEnv.GIT_COMMITTER_NAME = name;
                            gitEnv.GIT_COMMITTER_DATE = modified;

                            echoAndExec(comment, [
                                'git commit',
                                '-F -',
                                '--author="' + author + '"',
                                '--date=' + modified,
                                '--allow-empty'
                            ], {
                                cwd: repositoryPath,
                                env: gitEnv
                            }, function(err, stdout, stderr){
                                if(err){
                                    winston.error('Error running git commit [stderr]:', stderr);
                                    winston.error('Error running git commit [stdout]:', stdout);
                                }
                                return callback(err);
                            });
                        });
                    });
                }, callback);
            };

            // If the last 3 characters of the comment are "..." then we don't have the full comemnt.
            if (
                change.comment.substr(-3, 3) === '...' ||
                (
                    change.workitems &&
                    change.workitems.length > 0 &&
                    change.workitems[0]['workitem-label'].substr(-3, 3) === '...'
                )
            ) {
                // List the changes for this UUID so we can get the full comment.
                echoAndExec(null, [env.scm, 'list changes -j', change.uuid, env.userPass], null, function (err, stdout, stderr) {
                    if (err) throw err;

                    // winston.info(stdout);
                    var jazzResponse = JSON.parse(stdout);
                    var fullChange = jazzResponse.changes[0];

                    gitAddAndCommit(fullChange);
                });
            } else {
                gitAddAndCommit(change);
            }
        });
    }
};

function createCommitMessage(change) {
    // convert <No comment> to an empty string.
    var comment = change.comment.replace(/<No comment>/, ''),
        message;

    if(change.workitems && change.workitems.length > 0){
        // message is in a format similar to "12345 The work item description"
        message = [
            change.workitems[0]['workitem-number'],
            change.workitems[0]['workitem-label']
        ].join(' ');

        // if there is a comment, append it to the message as a new paragraph
        if (comment) {
            message = [
                message,
                comment
            ].join('\n\n');
        }
    }else{
        message = comment;
    }

    if (message === ''){
        message = '.';
    }

    return message;
}

function convertToEmail(name, defaultDomain) {
    // convert the name from "John Doe" to "john.doe@domain"
    name = name || '';
    return [
        name.toLowerCase().split(/\s+/).join('.'),
        '@',
        defaultDomain
    ].join('');
}
