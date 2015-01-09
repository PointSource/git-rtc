#!/usr/bin/env node

var exec = require('child_process').exec;
var fs = require('fs');

var scm = 'lscm';
var user = process.env.RTC_USER;
var password = process.env.RTC_PASSWORD;
var defaultAuthor = process.env.AUTHOR;
var defaultDomain = process.env.DOMAIN;
var component = process.env.COMPONENT;

var userPass = "";
if (user) {
  userPass = ' -u ' + user + ' -P ' + password + " ";
}

// some requests print a lot of information
// increase the buffer to handle the size of these requests
var maxBuffer = 1000 * 1000 * 1024;

function convertToEmail(name) {
  // convert the name from "John Doe" to "john.doe@domain"
  return [name.toLowerCase().split(/\s+/).join('.'), '@', defaultDomain].join('');
}

function processHistoryItem(history, index) {
  if (index >= history.length) return;

  var change = history[index],
      author = change.author,
      uuid = change.uuid,
      comment = change.comment,
      modified = new Date(change.modified).toISOString(),
      workitem = change['workitem-label'];

  // list the changes for this UUID so we can get the full work item and comment
  echoAndExec(scm + ' list changes ' + uuid + userPass + ' -j', {
      maxBuffer: maxBuffer
    }, function (err, stdout, stderr) {
    if (err) throw err;

    console.log(stdout);
    var jazzResponse = JSON.parse(stdout),
        change = jazzResponse.changes[0],
        comment = createCommitMessage(change),
        name = (change.author || defaultAuthor),
        email = convertToEmail(change.author || defaultAuthor),
        // the author in the form of "John Doe <john.doe@domain>"
        author = name + ' <' + email + '>',
        uuid = change.uuid;

    // accept changes from RTC
    echoAndExec(scm + ' accept ' + uuid + userPass + ' --overwrite-uncommitted', {
        maxBuffer: maxBuffer
      }, function (err, stdout, stderr) {
      if (err) throw err;

      console.log(stdout);
      // add all changes to git
      echoAndExec('git add -A', {
        maxBuffer: maxBuffer
      }, function (err, stdout, stderr) {
        if (err) throw err;

        // commit these changes
        echoAndExec(['GIT_COMMITTER_EMAIL="' + email + '"',
          'GIT_COMMITTER_NAME="' + name + '"',
          'GIT_COMMITTER_DATE="' + modified + '"',
          'git commit',
          '-m "' + comment + '"',
          '--author="' + author + '"',
          '--date=' + modified,
          '--allow-empty'].join(' '), {
          maxBuffer: maxBuffer
        }, function (err, stdout, stderr) {
          if (err) throw err;

          // process the next item
          processHistoryItem(history, index + 1);
        });
      });
    });
  });
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
    message = change.comment;
  }

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
function discardChanges(callback) {
  echoAndExec(scm + ' show history -j -m 100 -C ' + component + userPass, {
    maxBuffer: maxBuffer
  }, function (err, stdout, stderr) {
    if (err) throw err;

    console.log(stdout);
    // get the response and reverse all the change sets in it
    var jazzResponse = JSON.parse(stdout),
        changes = jazzResponse.changes;

    // cannot discard the first change
    if (changes.length === 1) {
      return callback();
    }

    // to be safe, we can discard all but the first changeset, which might be
    // the last element in the array
    var uuids = changes.slice(0, -1).map(function (change) {
      return change.uuid;
    });

    echoAndExec(scm + ' discard ' + userPass + ' --overwrite-uncommitted ' + uuids.join(' '), {
      maxBuffer: maxBuffer
    }, function (err, stdout, stderr) {
      if (err) throw err;

      console.log(stdout);
      // recurse and attempt to discard more changes
      discardChanges(callback);
    });
  });
}

discardChanges(walkThroughHistory);

function walkThroughHistory() {
  echoAndExec('git init', function (err) {
    if (err) throw err;

    echoAndExec(scm + ' show history -j -C ' + component + userPass, {
      maxBuffer: maxBuffer
    }, function (err, stdout, stderr) {
      if (err) throw err;

      console.log(stdout);
      var jazzResponse = JSON.parse(stdout),
          change = jazzResponse.changes[0],
          comment = createCommitMessage(change),
          name = (change.author || defaultAuthor),
          email = convertToEmail(change.author || defaultAuthor),
          author = name + ' <' + email + '>',
          modified = new Date(change.modified).toISOString();

      echoAndExec('git add -A', function (err, stdout, stderr) {
        if (err) throw err;

        echoAndExec(['GIT_COMMITTER_EMAIL="' + email + '"',
            'GIT_COMMITTER_NAME="' + name + '"',
            'GIT_COMMITTER_DATE="' + modified + '"',
            'git commit',
            '-m "' + comment + '"',
            '--author="' + author + '"',
            '--date=' + modified,
            '--allow-empty'].join(' '), function (err, stdout, stderr) {
          if (err) throw err;

          echoAndExec(scm + ' show status -i in:cbC -j ' + userPass, {
              maxBuffer: maxBuffer
            }, function (err, stdout, stderr) {
              if (err) throw err;

              console.log(stdout);
              var jazzResponse = JSON.parse(stdout);

              // get the RTC change set history and reverse it to get it in
              // chronological order
              var orderedHistory = jazzResponse.workspaces[0]
                  .components[0]['incoming-changes'].reverse();

              processHistoryItem(orderedHistory, 0);
            });
          });
        });
      });
  });
}

function echoAndExec(cmd, options, callback) {
  console.log(cmd);
  return exec(cmd, options, callback);
}
