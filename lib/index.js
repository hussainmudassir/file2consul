module.exports.processConfig = function (cb) {
    var consul = require('./consul');
    consul.updateConfig(function (err) {
        if (err) {
            console.log("Something went wrong in updating the config", err);
            return cb(err);
        }
        cb();
    });
};