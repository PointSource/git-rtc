#!/usr/bin/env node

var exec = require('child_process').exec;
var fs = require('fs');
var os = require("os");

var isWindows = os.type() == "Windows_NT";

if (isWindows)
  var scm = "scm";
else
  var scm = "lscm";

// some requests print a lot of information
// increase the buffer to handle the size of these requests
var maxBuffer = 1000 * 1000 * 1024;

var user = process.env.RTC_USER;
var password = process.env.RTC_PASSWORD;
var defaultAuthor = process.env.AUTHOR;
var defaultDomain = process.env.DOMAIN;
var componentOption = process.env.COMPONENT ? "-C " + process.env.COMPONENT : "";

if (!defaultAuthor || !defaultDomain) {
  console.log("You must set AUTHOR and DOMAIN environment variables");
} else {
  var userPass = "";
  if (user) {
    userPass = ' -u ' + user + ' -P ' + password + " ";
  }

  if (process.argv[2] == "continue")
    walkThroughHistory();
  else
    discardChanges(makeFirstCommit);
}

function convertToEmail(name) {
  // convert the name from "John Doe" to "john.doe@domain"
  return [name.toLowerCase().split(/\s+/).join('.'), '@', defaultDomain].join('');
}

function gitAddAndCommit(uuid, next) {
  // list the changes for this UUID so we can get the full work item comment
  echoAndExec(null, scm + ' list changes ' + uuid + userPass + ' -j', {
      maxBuffer: maxBuffer
  }, function (err, stdout, stderr) {
    if (err) throw err;

    // console.log(stdout);
    var jazzResponse = JSON.parse(stdout);
    var change = jazzResponse.changes[0];

    var comment = createCommitMessage(change);
    var name = (change.author || defaultAuthor);
    var email = convertToEmail(name);
    var author = name + ' <' + email + '>';
    var modified = new Date(change.modified).toISOString();

    echoAndExec(null, 'git add -A', {
      maxBuffer: maxBuffer
    }, function (err, stdout, stderr) {
      if (err) throw err;

      var env = process.env;
      env["GIT_COMMITTER_EMAIL"] = email;
      env["GIT_COMMITTER_NAME"] = name;
      env["GIT_COMMITTER_DATE"] = modified;

      // commit these changes
      echoAndExec(comment, ['git commit',
        '-F -',
        '--author="' + author + '"',
        '--date=' + modified,
        '--allow-empty'].join(' '), {
        maxBuffer: maxBuffer,
        env: env
      }, next);
    });
  });
}


function processHistoryItem(history, index) {
  if (index >= history.length) return;

  var uuid = history[index].uuid;

  // accept changes from RTC
  echoAndExec(null, scm + ' accept ' + uuid + userPass + ' --overwrite-uncommitted', {
    maxBuffer: maxBuffer
  }, function (err, stdout, stderr) {
    if (err) throw err;

    console.log(stdout);

    gitAddAndCommit(uuid, function(err, stdout, stderr) {
      if (err) throw err;

      // process the next item
      processHistoryItem(history, index + 1);
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
    message = comment;
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
  echoAndExec(null, scm + ' show history -j -m 100 ' + componentOption + userPass, {
    maxBuffer: maxBuffer
  }, function(err, stdout, stderr) {
    if (err) throw err;

    // console.log(stdout);
    // get the response and reverse all the change sets in it
    var jazzResponse = JSON.parse(stdout),
        changes = jazzResponse.changes;

    // cannot discard the first change
    if (changes.length === 1) {
      return callback(changes);
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

      console.log(stdout);
      // recurse and attempt to discard more changes
      discardChanges(callback);
    });
  });
}


function makeFirstCommit(changes) {
  echoAndExec(null, 'git init', function(err) {
    if (err) throw err;

    gitAddAndCommit(changes[0].uuid, function(err, stdout, stderr) {
      if (err) throw err;

      walkThroughHistory();
    });
  });
}

function walkThroughHistory() {
  echoAndExec(null, scm + ' show status -i in:cbC -j ' + userPass, {
      maxBuffer: maxBuffer
    }, function (err, stdout, stderr) {
      if (err) throw err;

      // console.log(stdout);
      var jazzResponse = JSON.parse(stdout);

      // get the RTC change set history and reverse it to get it in
      // chronological order
      var orderedHistory = jazzResponse.workspaces[0].components[0]['incoming-baselines'].reverse().reduce(function(history, baseline) {
        return history.concat(baseline.changes.reverse());
      }, []);

      orderedHistory = orderedHistory.concat(jazzResponse.workspaces[0].components[0]['incoming-changes'].reverse());

      processHistoryItem(orderedHistory, 0);
  });
}

function echoAndExec(input, cmd, options, callback) {
  console.log(cmd);
  var child = exec(cmd, options, callback);

  if (input)
    child.stdin.write(input);
  child.stdin.end();

  return child;
}
