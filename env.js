var winston = require('winston'),
    stripJsonComments = require('strip-json-comments'),
    path = require('path'),
    fs = require('fs'),
    os = require('os');


var isWindows = os.type() == "Windows_NT";

var scm = 'scm';
// if (isWindows){
//     scm = "scm";
// }else{
//     scm = "lscm";
// }

module.exports = function(cli){
    if(!cli.config){
        winston.error('Please provide a config file.');
        process.exit(1);
    }

    var configPath = path.resolve(cli.config);
    if(!fs.existsSync(configPath)){
        winston.error('Config file does not exist.');
        process.exit(1);
    }


    var configData = fs.readFileSync(configPath);
    if(!configData || !configData.length){
        winston.error('Error reading config file.');
        process.exit(1);
    }

    var config = JSON.parse(stripJsonComments(configData.toString()));
    if(!config){
        winston.error('Config file format invalid.');
        process.exit(1);
    }

    if(!cli.stream && !config.stream){
        winston.error('Please provide the name of the stream.');
        process.exit(1);
    }

    if(!cli.author && !config.author){
        winston.error('Please provide the default author.');
        process.exit(1);
    }

    if(!cli.default_domain && !config.domain){
        winston.error('Please provide the default domain.');
        process.exit(1);
    }

    var userPass = '';
    if (cli.user) {
        userPass = ' -u ' + cli.user + ' -P ' + cli.password + ' ';
    }

    return {
        userPass: userPass,
        stream: cli.stream || config.stream,
        author: cli.author || config.author,
        domain: cli.default_domain || config.domain,
        host: cli.host,
        config: config,
        scm: scm
    };
};
