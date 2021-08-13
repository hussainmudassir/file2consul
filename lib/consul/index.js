#!/usr/bin/env node

var fs = require('fs');
var _ = require('underscore');
var properties = require ("properties");
var clog = require('c-log');

var consul = require('consul')({'host': global.endpoint, 'port': global.port, 'secure': global.secure,'dc':global.dc,'token':global.token});
var exitProcess = false;
var options = {
    path: false,
    variables: true
};

var result = [];

var render_obj = function(parts, prefix, obj) {
  _.mapObject(obj, function(val, key) {
    if (_.isArray(val)) return;

    if (_.isObject(val)) return render_obj(parts, prefix + '/' + encodeURIComponent(key), val)

    parts.push({'key': global.config_path + '/' + encodeURIComponent(key), 'value': val});
  });
};

var diff_kvs = function(write_kvs, delete_kvs, candidate_kvs, existing_kvs) {
  // If the candidate kv is not already in the list of existing kvs set to the
  // same value, then we know we need to write the kv.
  candidate_kvs.forEach(function(kv) {
    var idx = _.findIndex(existing_kvs, {'key': kv.key});
    kv.value = kv.value === null ? '' : kv.value;
    if (idx === -1) {
      // key does not exist in the current tree, so we must add it.
      let obj_to_log = {};
      Object.assign(obj_to_log, {"Name":kv.key, "Comment": "New Key/Value", "FileVal": kv.value});
      result.push(obj_to_log);
      write_kvs.push(kv);
    } else if (kv.value.toString() !== existing_kvs[idx].value) {
      // key exists in the current tree, but has a different value, so we must update it.
      let obj_to_log = {};
      Object.assign(obj_to_log, {"Name": kv.key, "Comment": "Conflict", "ConsulVal": existing_kvs[idx].value, "FileVal": kv.value});
      exitProcess=true;
      result.push(obj_to_log);
      // write_kvs.push(kv);
      existing_kvs.splice(idx, 1);
    } else {
      // key exists in the current tree with same value, so we don't need to do anything
      // with it.
      existing_kvs.splice(idx, 1);
    }
  });
  // At this point, anything remaining in the existing_kvs array needs to be 
  // deleted from consul.
  existing_kvs.forEach(function(kv) {
    let obj_to_log = {};
    let key_name = kv.key.split('/');
    if (global.keys_to_ignore.indexOf(key_name[key_name.length -1]) < 0) {
      Object.assign(obj_to_log, {"Name": kv.key, "Comment": "Delete", "ConsulVal": kv.value});
      exitProcess=true;
      result.push(obj_to_log);
      delete_kvs.push(kv);
    }
  });
};

//commented to avoid deleting any keys
var delete_from_consul = function(key_name, cb) {
  // console.log('Deleting key %s', key_name);
  // consul.kv.del({'key': key_name, token: token}, function(err) {
  //   if (err) {
  //     return cb('Failed to delete key ' + key_name + ' due to ' + err);
  //   }
    cb();
  // });
};

var populate_kvs_object = function(content, file_path, kvs, cb) {
  var candidate_kvs = [];
  var delete_kvs = []; 
  var write_kvs = [];

  render_obj(candidate_kvs, file_path, content);
  if (kvs.length > 0) {
    diff_kvs(write_kvs, delete_kvs, candidate_kvs, kvs);
  } else {
    write_kvs = candidate_kvs;
  }

  console.log('Expandable file with %s keys (%s writes, %s deletes)',
  candidate_kvs.length,
  write_kvs.length,
  delete_kvs.length);
  var do_writes = _.after(delete_kvs.length, function(err) {
    if (err) return cb(err);

    if (write_kvs.length > 0) {
      cb = _.after(write_kvs.length, cb);
      write_kvs.forEach(function(write) {
        write_content_to_consul(write.key, write.value, cb);
      });
    } else {
      cb();
    }
  });
  if (delete_kvs.length > 0) {
    delete_kvs.forEach(function(del) {
      delete_from_consul(del.key, do_writes);
    });
  } else {
    do_writes();
  }
};

var file_modified = function(cb) {
  var handle_json_kv_file = function(kvs, cb) {
    fs.readFile(global.config_file, {encoding: 'utf8'}, function (err, body) {
      if (err) return cb('Failed to read key ' + global.config_file + ' due to ' + err);
      body = body ? body.trim() : '';
      write_content_to_consul(global.config_file, body, cb);
    });
  };

  var handle_properties_kv_file = function(kvs, cb) {
    function extract_and_populate_properties(file_body, common_body, cb) {
      load_properties(file_body, common_body, function (error, obj) {
      populate_kvs_object(obj, global.config_file, kvs, cb);
      });
    }

    fs.readFile(global.config_file, {encoding: 'utf8'}, function (err, file_body) {
      if (err) return cb('Failed to read key ' + global.config_file + ' due to ' + err);
        extract_and_populate_properties(file_body, '', cb);
    });
  };

  var handle_expanded_keys_with_different_file_types = function(kvs) {
    if (config_file.endsWith('.json')) {
      handle_json_kv_file(kvs, cb);
    } else if (config_file.endsWith('.properties')) {
      handle_properties_kv_file(kvs, cb);
    }
  };
  get_kvs(function(err, kvs) {
    if(err) return cb("Failed to get kvs of existing");
    handle_expanded_keys_with_different_file_types(kvs);
  });
};

var get_kvs = function(cb) {
  // Prepend branch name to the KV so that the subtree is properly namespaced in Consuls
  console.log('Getting tree for key %s', (global.config_path + '/' + global.config_file));

  consul.kv.get({'key': global.config_path + '/', token: global.token, recurse: true}, function(err, kvs, res) {
    if (err){
      console.log({"error" :err})
      return cb('Failed to get tree for key ' + global.config_file + ' due to ' + err, undefined);
    }
    var tree = []
    if (kvs) {
      kvs.forEach(function(kv) {
        if (kv.Value === null) kv.Value = '';
        tree.push({'key': kv.Key, 'value': kv.Value});
      });
    }
    cb(undefined, tree);
  });
};

var load_properties = function (specific_file, common_file, cb){
  properties.parse (common_file, options, function (error, env){
    if (error) return cb (error);
    //Pass the common properties as external variables
    options.vars = env;
    properties.parse (specific_file, options, cb);
  });
};

var write_content_to_consul = function(key_name, content, cb) {
  console.log("writing : " + key_name + " to consul")
  consul.kv.set({'key': key_name, value: content !== null ? String(content) : null, token: token}, function(err) {
    if (err) {
      return cb('Failed to write key ' + key_name + ' due to ' + err);
    }
    cb();
  });
};

exports.updateConfig = function(cb) {
  file_modified(function(err) {
    if(err) {
      return cb(err);
    }
    clog.table(result);
    if(exitProcess) {
        console.log("Exiting consul update since there was a conflict");
        process.exit(-1);
    }
    cb();
  });
};