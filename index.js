#!/usr/bin/env node

/*
To run this, either you can choose env wise properties or we can specify file but the path of the index.js has to from source root in the command
1.node file2consul/index.js -f application-prod.properties (when the source root is resources)
2.NODE_ENV=staging node file2consul/index.js
*/

var file2consul = require('./lib/index');
var config = require('./config.js');
const fs = require('fs');
const yaml = require('js-yaml');
const { env } = require('process');
//optional
global.keys_to_ignore = config.keys_to_ignore;

var get_config_file = function(env) {
    console.log("Assigning config file according to the env");
    if (env && env.profiles && env.profiles === "dev") global.config_file = "application-dev.properties";
    else if (env && env.profiles && env.profiles == "prod")global.config_file = "application-prod.properties";
    else global.config_file = "application.properties";
};

var validateArgv = function(argv, env) {
    if(argv.length <= 2) get_config_file(env);
    for (var i=2; i<argv.length; ++i) {
        if(process.argv[i] === '-f' || process.argv[i] === '--config-file') {
            if(i+1 >= process.argv.length) {
                console.log("No file provided with --config-file option");
                process.exit(-1);
            }
            global.config_file = process.argv[i+1];
        }
    }
};

function setConsulConfig(env) {
    let env_prop;
    if(!env || !env.cloud || !env.cloud.consul) {
	    console.log("Setting default Props");
        env_prop = config.default_env_prop;
    };
    env_prop = env_prop != null ?  env_prop : env.cloud.consul;
    global.endpoint = env_prop.host;
    global.port = env_prop.port;
    global.secure = env_prop.scheme && env_prop.scheme==='https';
    global.token = "";
    global.config_path = env_prop.config.prefix + '/' + env.application.name;
    return;
};

function getConsulFromConfig() {
    let fileContents = fs.readFileSync('./bootstrap.yml', 'utf8');
    let data = yaml.safeLoadAll(fileContents);
    let defaultDta = null;
    for (let i = 0; i < data.length; i++) {
        if (data[i].spring && data[i].spring.profiles) {
            if (data[i].spring.profiles === process.env.NODE_ENV) {
                console.log({"selected": data[i]})
                return data[i].spring;
            }
        }
    }
    return defaultDta;
}

var processConfig = function () {
    file2consul.processConfig(function (err) {
        if (err) {
            console.log(err);
            process.exit(-1);
        } else
            console.log("File2Consul was process successfully.");
    });
};

(function () {
    if (require.main === module) {
        var env = getConsulFromConfig();
        validateArgv(process.argv, env);
        setConsulConfig(env);
        processConfig();
    }  
}());
