var winston = require('winston'),
    _ = require('underscore'),
    exec = require('child_process').exec;

// some requests print a lot of information
// increase the buffer to handle the size of these requests
var maxBuffer = 1000 * 1000 * 1024;

function echoAndExec(input, cmd, options, callback) {
    if(options){
        winston.info('options', options);
    }else{
        options = {};
    }

    options = _.extend(options, {
        maxBuffer: maxBuffer
    });

    if(options.env){
        var env = process.env;
        env = _.extend(env, options.env);
        options.env = env;
    }

    if(_.isArray(cmd)){
        cmd = cmd.join(' ');
    }

    winston.info(cmd);
    var child = exec(cmd, options, callback);
    if (input){
        child.stdin.write(input);
    }
    child.stdin.end();
    return child;
}

module.exports = echoAndExec;
