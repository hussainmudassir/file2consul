#!/usr/bin/env node
var file2consul = require('./lib/index');

global.endpoint = process.env.CONSUL_ENDPOINT || "127.0.0.1";
global.port = process.env.CONSUL_PORT || 8500;
global.secure = process.env.CONSUL_SECURE || false;
global.token = process.env.TOKEN || null;
global.config_file = null;

var processConfig = function(file_name) {
    file2consul.processConfig(file_name, function(err) {
        if(err)
            console.log("Failed to update the consul", err);

        else
            console.log("Successfully updated the consul.");
    });
};

var validateArgv = function(argv) {
    if(argv.length <= 2) {
        console.log("File was missing in the argv");
        process.exit(3);
    }

    for (var i=2; i<argv.length; ++i) {
        if(process.argv[i] === '-f' || process.argv[i] === '--config-file') {
            if(i+1 >= process.argv.length) {
              console.log("No file provided with --config-file option");
              process.exit(7);
            }
            global.config_file = process.argv[i+1];
        }
    }
};

(function () {
    if (require.main === module) {
        validateArgv(process.argv);
        processConfig(global.config_file);
    }  
}());