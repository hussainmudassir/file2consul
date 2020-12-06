module.exports.processConfig = function(config_file, cb) {
    var consul = require('./consul');
    consul.updateConfig(config_file, function(err) {
        if(err) {
            console.log("Something went wrong in updating the config", err);
            cb(err);
        } else
            cb();
    });
};