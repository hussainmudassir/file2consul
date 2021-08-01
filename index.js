/*
To run this, either you can choose env wise properties or we can specify file but the path of the index.js has to from source root in the command
1.node file2consul/index.js -f application-prod.properties (when the source root is resources)
2.NODE_ENV=staging node file2consul/index.js
*/
var file2consul = require('./lib/index');
const fs = require('fs');
const yaml = require('js-yaml');
const { env } = require('process');

//default config
// global.endpoint = process.env.CONSUL_ENDPOINT || "127.0.0.1";
// global.port = process.env.CONSUL_PORT || 8500;
// global.secure = process.env.CONSUL_SECURE || false;
// global.token = process.env.TOKEN || null;
// global.config_file = null;

//optional
global.keys_to_ignore = ["reload.resource.bean.name"];


var get_config_file = function(env) {
    console.log("Assigning config file according to the env");
    if (env && env.profiles && env.profiles === "staging") global.config_file = "application-staging.properties";
    else if (env && env.profiles && env.profiles == "dev") global.config_file = "application-staging.properties";
    else if (env && env.profiles && env.profiles == "prod")global.config_file = "application-prod.properties";
    else global.config_file = "application.properties";
};

var processConfig = function () {
    file2consul.processConfig(function (err) {
        if (err) {
            console.log(err);
            process.exit(-1);
        } else
            console.log("File2Consul was process successfully.");
    });
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
console.log(JSON.stringify(env));
    let env_prop;
    if(!env || !env.cloud || !env.cloud.consul || !env.profiles) {
	console.log("taking default Props");
        env_prop = {
            "host": "127.0.0.1",
            "port": 8500,
            "scheme": "http",
            "token": "",
            "config": {
                "prefix": "test-service"
            }
        };
    };
    env_prop = env_prop != null ?  env_prop : env.cloud.consul;
    global.endpoint = process.env.CONSUL_ENDPOINT || env_prop.host;
    global.port = process.env.CONSUL_PORT || env_prop.port;
    global.secure = process.env.CONSUL_SECURE || env_prop.scheme && env_prop.scheme==='https';
    global.token = process.env.TOKEN || "";
    global.config_path = process.env.CONFIG_PATH || env_prop.config.prefix + '/' + env.application.name;
    console.log(global.config_path);
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
        } else if (data[i].spring && !data[i].spring.profiles) {
            defaultDta = data[i].spring;
        }
    }
    return defaultDta;
}

(function () {
    if (require.main === module) {
        var env = getConsulFromConfig();
        validateArgv(process.argv, env);
        setConsulConfig(env);
        processConfig();
    }  
}());
