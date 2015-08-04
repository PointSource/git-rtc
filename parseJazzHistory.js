var _ = require('underscore');

module.exports = function(stdout){
    var jazzResponse = stdout.split('\n');
    var changes = [];
    var getUUID = /^  \(([0-9]+)\) [^$]{4}\$ "(.*)" Created By: ([^(]*)\(([^)]*)\)/m;
    _.each(jazzResponse, function(row){
        var match = getUUID.exec(row);
        if(match){
            changes.push({
                _original: row,
                uuid: match[1],
                comment: match[2],
                author: match[3].trim(),
                modified: new Date(match[4])
            });
        }
    });
    return changes;
}
