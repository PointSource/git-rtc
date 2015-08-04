#!/usr/bin/env node

var exec = require('child_process').exec;
var fs = require('fs');
var os = require("os");
var _ = require('underscore');

var componentOption = process.env.COMPONENT ? "-C " + process.env.COMPONENT : "";

// Setup logging
var winston = require('winston');

// Setup CLI parsing
var cli = require('./cli');

return;

    // Do something based on the first argument:
    if (process.argv[2] == "continue") {
        // If continue, start with the current state of the workspace and start walking forwards,
        //    creating a commit for each changeset
        walkThroughHistory();
    // } else if (process.argv[2] == "continue2") {
    //     // If "continue2", do same as "continue" but don't do an accept first (?)
    //     skipFirstAccept = true;
    //     walkThroughHistory();
    } else {
        // In this jazz workspace, walk back to the very beginning, then start making commits!
        discardChanges(makeFirstCommit);
    }

var config = {
    repositories: [
        'sfi-esb',
        'sfi-service-agents',
        'sfi-service-quote',
        'policyport',
        'passport-anonymous-strategy',
        'passport-hmac-strategy',

        'sfi-worklight',

        'sfi-website'
    ],
    mapping: {
        // Component
        'esb': {
            // Folder : Repo(/folder)
            'sfi-esb': 'sfi-esb',
            'sfi-service-agents': 'sfi-service-agents',
            'sfi-service-quote': 'sfi-service-quote',
            'policyport': 'policyport',
            'passport-anonymous-strategy': 'passport-anonymous-strategy',
            'passport-hmac-strategy': 'passport-hmac-strategy'
        },
        'bpanthony | Security First Insurance Website': {
            'SecurityFirstInsWebsite': 'sfi-worklight/SecurityFirstInsWebsite'
        },
        'katiewinders | Security First Insurance Default Component': {
            'SecurityFirstBatchUtility': 'sfi-worklight/SecurityFirstBatchUtility',
            'SecurityFirstEventServer': 'sfi-worklight/SecurityFirstEventServer',
            'SecurityFirstGrid': 'sfi-worklight/SecurityFirstGrid',
            'SecurityFirstInsSource': 'sfi-worklight/SecurityFirstInsSource',
            'SecurityFirstInsurance': 'sfi-worklight/SecurityFirstInsurance',
            'SecurityFirstInsWebsite': 'sfi-worklight/SecurityFirstInsWebsite',
            'SecurityFirstLibrary': 'sfi-worklight/SecurityFirstLibrary',
            'SecurityFirstRESTServices': 'sfi-worklight/SecurityFirstRESTServices'
        }
    }
};

function discardChanges(callback) {
   echoAndExec(null, scm + ' show history -m 100 ' + componentOption + userPass, {
       maxBuffer: maxBuffer
   }, function(err, stdout, stderr) {
       if (err) throw err;

       // winston.info(stdout);
       // get the response and reverse all the change sets in it
       // var jazzResponse = JSON.parse(stdout),
       //         changes = jazzResponse.changes;

       var jazzResponse = stdout.split('\n');
       var changes = [];
       _.each(jazzResponse, function(row){
               var getUUID = /^    \(([0-9]+)\) [^$]{4}\$ "(.*)" Created By: ([^(]*)\(([^)]*)\)/m;
               var match = getUUID.exec(row);
               if(match){
                       changes.push({
                               _original: row,
                               uuid: match[1],
                               comment: match[2],
                               modified: new Date(match[4])
                       });
               }
       });
       // winston.info('changes?', changes);
       // process.exit(1);

       // cannot discard the first change
       if (changes.length === 1) {
           return callback(changes[0]);
       }

       // to be safe, we can discard all but the first changeset, which might be
       // the last element in the array
       var uuids = changes.slice(0, -1).map(function (change) {
           return change.uuid;
       });

       echoAndExec(null, scm + ' discard ' + userPass + ' --overwrite-uncommitted ' + uuids.join(' '), {
           maxBuffer: maxBuffer
       }, function(err, stdout, stderr) {
           if (err) throw err;

           winston.info(stdout);
           // recurse and attempt to discard more changes
           discardChanges(callback);
       });
   });
}

function makeFirstCommit(change) {
        winston.info('would do git init');
    // echoAndExec(null, 'git init', function(err) {
        // if (err) throw err;

        makeGitCommit(change, function(err, stdout, stderr) {
            if (err) throw err;

            walkThroughHistory();
        });
    // });
}

function makeGitCommit(change, next) {
    // If the last 3 characters of the comment are "..." then we don't have the full comemnt.
    if (change.comment.substr(-3, 3) == "..." ||
            change.workitems && change.workitems.length > 0 && change.workitems[0]['workitem-label'].substr(-3, 3) == "...") {
        // List the changes for this UUID so we can get the full comment.
        echoAndExec(null, scm + ' list changes ' + change.uuid + userPass + ' -j', {
                maxBuffer: maxBuffer
        }, function (err, stdout, stderr) {
            if (err) throw err;

            // winston.info(stdout);
            var jazzResponse = JSON.parse(stdout);
            var fullChange = jazzResponse.changes[0];

            return gitAddAndCommit(fullChange, next);
        });
    } else {
        return gitAddAndCommit(change, next);
    }
}

function gitAddAndCommit(change, next) {
    var comment = createCommitMessage(change);
    var name = (change.author || defaultAuthor);
    var email = convertToEmail(name);
    var author = name + ' <' + email + '>';
    var modified = new Date(change.modified).toISOString();

winston.info('would git add -A');
    // echoAndExec(null, 'git add -A', {
    //     maxBuffer: maxBuffer
    // }, function (err, stdout, stderr) {
    //     if (err) throw err;

        var env = process.env;
        env["GIT_COMMITTER_EMAIL"] = email;
        env["GIT_COMMITTER_NAME"] = name;
        env["GIT_COMMITTER_DATE"] = modified;

        // commit these changes
        winston.info('would git commit -F -')
        next();
        // echoAndExec(comment, ['git commit',
        //     '-F -',
        //     '--author="' + author + '"',
        //     '--date=' + modified,
        //     '--allow-empty'].join(' '), {
        //     maxBuffer: maxBuffer,
        //     env: env
        // }, next);
    // });
}

function createCommitMessage(change) {
    // convert <No comment> to an empty string.
    var comment = change.comment.replace(/<No comment>/, ''),
            message;

    if (change.workitems && change.workitems.length > 0) {
        // message is in a format similar to "12345 The work item description"
        message = [change.workitems[0]['workitem-number'],
                             change.workitems[0]['workitem-label']].join(' ');

        // if there is a comment, append it to the message as a new paragraph
        if (comment) {
            message = [message, comment].join('\n\n');
        }
    } else {
        message = comment;
    }

    if (message == "")
        message = ".";

    return message;
}

/*
    1. Grab the history of change sets from RTC.
    2. If the message has been cut off, query to RTC to get the full message.
    3. Add the changes to git.
    4. Commit the change to git using the message from RTC.
    5. Accept the next changeset from RTC.
    6. Repeat from step 2.
 */
function walkThroughHistory(uuid) {
    echoAndExec(null, scm + ' show status -i in:cbC -j ' + userPass, {
            maxBuffer: maxBuffer
        }, function (err, stdout, stderr) {
            if (err) throw err;

            // winston.info(stdout);
            var jazzResponse = JSON.parse(stdout);

            // get the RTC change set history and reverse it to get it in
            // chronological order
            var orderedHistory;

            if (jazzResponse.workspaces[0].components[0]['incoming-baselines']) {
                orderedHistory = jazzResponse.workspaces[0].components[0]['incoming-baselines'].reverse().reduce(function(history, baseline) {
                    return history.concat(baseline.changes.reverse());
                }, []);
            } else {
                orderedHistory = [];
            }

            if (jazzResponse.workspaces[0].components[0]['incoming-changes'])
                orderedHistory = orderedHistory.concat(jazzResponse.workspaces[0].components[0]['incoming-changes'].reverse());

        //     if (skipFirstAccept) {
        //         echoAndExec(null, scm + ' show history -j -m 1 ' + componentOption + userPass, {
        //         // echoAndExec(null, scm + ' list changes _bZ3IMEjNEeSdltTkss2XRg -j ' + userPass, {
        //             maxBuffer: maxBuffer
        //         }, function(err, stdout, stderr) {
        //             if (err) throw err;
            //
        //             var jazzResponse = JSON.parse(stdout);
        //             var changes = jazzResponse.changes;
            //
        //             orderedHistory = changes.concat(orderedHistory);
        //             processHistoryItem(orderedHistory, 0);
        //         });
        //     } else {
            winston.info('going to processHistoryItem:', orderedHistory);
            process.exit(1);

                processHistoryItem(orderedHistory, 0);
        //     }
    });
}

function processHistoryItem(history, index) {
    if (index >= history.length) return;

    var change = history[index];

    // if (skipFirstAccept) {
    //     skipFirstAccept = false;
    //     makeGitCommit(change, function(err, stdout, stderr) {
    //         if (err) throw err;
    //
    //         // process the next item
    //         processHistoryItem(history, index + 1);
    //     });
    // } else {
        // accept changes from RTC
        winston.info("\n=======================================");
        winston.info("Processing change set " + (index+1) + " of " + history.length + " (" + (history.length - index - 1) + " left)");
        echoAndExec(null, scm + ' accept ' + change.uuid + userPass + ' --overwrite-uncommitted', {
            maxBuffer: maxBuffer
        }, function (err, stdout, stderr) {
            if (err) throw err;

            winston.info(stdout);

            makeGitCommit(change, function(err, stdout, stderr) {
                if (err) throw err;

                // process the next item
                processHistoryItem(history, index + 1);
            });
        });
    // }
}



function convertToEmail(name) {
    // convert the name from "John Doe" to "john.doe@domain"
    return [name.toLowerCase().split(/\s+/).join('.'), '@', defaultDomain].join('');
}

function echoAndExec(input, cmd, options, callback) {
    winston.info(cmd);
    var child = exec(cmd, options, callback);

    if (input){
        child.stdin.write(input);
    }
    child.stdin.end();

    return child;
}
