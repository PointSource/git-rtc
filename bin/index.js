#!/usr/bin/env node

var exec = require('child_process').exec;
var fs = require('fs');

var scm = 'lscm';
var user = process.env.RTC_USER;
var password = process.env.RTC_PASSWORD;
var defaultAuthor = process.env.AUTHOR;
var defaultDomain = process.env.DOMAIN;

// some requests print a lot of information
// increase the buffer to handle the size of these requests
var maxBuffer = 1000 * 1000 * 1024;

function convertToEmail(name) {
  // convert the name from "John Doe" to "john.doe@domain"
  return [name.toLowerCase().split(/\s+/).join('.'), '@', defaultDomain].join();
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
  exec(scm + ' list changes ' + uuid + ' -u ' + user + ' -P ' + password + ' -j', {
      maxBuffer: maxBuffer
    }, function (err, stdout, stderr) {
    if (err) throw err;

    var jazzResponse = JSON.parse(stdout),
        change = jazzResponse.changes[0],
        comment = createCommitMessage(change),
        name = (change.author || defaultAuthor),
        email = convertToEmail(change.author || defaultAuthor),
        // the author in the form of "John Doe <john.doe@domain>"
        author = name + ' <' + email + '>',
        uuid = change.uuid;

    // accept changes from RTC
    exec(scm + ' accept ' + uuid + ' -u ' + user + ' -P ' + password + ' --overwrite-uncommitted', {
        maxBuffer: maxBuffer
      }, function (err, stdout, stderr) {
      if (err) throw err;

      // add all changes to git
      exec('git add -A', {
        maxBuffer: maxBuffer
      }, function (err, stdout, stderr) {
        if (err) throw err;

        // commit these changes
        exec(['GIT_COMMITTER_EMAIL="' + email + '"',
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
exec(scm + ' show history -j -u ' + user + ' -P ' + password, {
    maxBuffer: maxBuffer
  }, function (err, stdout, stderr) {
    if (err) throw err;

    var jazzResponse = JSON.parse(stdout),
        change = jazzResponse.changes[0],
        comment = createCommitMessage(change),
        name = (change.author || defaultAuthor),
        email = convertToEmail(change.author || defaultAuthor),
        author = name + ' <' + email + '>',
        modified = new Date(change.modified).toISOString();

    exec('git add -A', function (err, stdout, stderr) {
      if (err) throw err;

      exec(['GIT_COMMITTER_EMAIL="' + email + '"',
          'GIT_COMMITTER_NAME="' + name + '"',
          'GIT_COMMITTER_DATE="' + modified + '"',
          'git commit',
          '-m "' + comment + '"',
          '--author="' + author + '"',
          '--date=' + modified,
          '--allow-empty'].join(' '), function (err, stdout, stderr) {
        if (err) throw err;

        exec(scm + ' show status -i in:cbC -j -u ' + user + ' -P ' + password, {
            maxBuffer: maxBuffer
          }, function (err, stdout, stderr) {
            if (err) throw err;

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
