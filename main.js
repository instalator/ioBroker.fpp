"use strict";

var utils =    require(__dirname + '/lib/utils');
var adapter = utils.adapter('fpp');
var fpp = require(__dirname + '/lib/fpp');
var states = {
    "playlists": {},
    "status"    :{
        "current_playlist": {},
        "next_playlist":{}
    },
    "connect"   : false
};
var old_states = {
    "playlists": {},
    "status"    :{
        "current_playlist": {},
        "next_playlist":{}
    },
    "connect"   : false
};
var timer;
var poll, tabu = false;
var polling_time = 2000;

adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});
adapter.on('stateChange', function (id, state) {
    if (state && !state.ack) {
        adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));
        var ids = id.split(".");
        var val = state.val;
        var cmd = ids[ids.length - 1].toString();
        //adapter.log.error('[cmd] = ' + cmd);
        if(ids[2] == 'commands'){
            if(cmd !== 'startPlaylist'){
                fpp.command(cmd, null, function (q){
                    adapter.log.debug('SetCommand command' + JSON.stringify(q));
                });
            } else if(cmd == 'startPlaylist'){
                var repeat;
                adapter.getState('commands.repeat', function (err, state){
                    if ((err || !state)){
                        repeat = false;
                    } else {
                        repeat = state.val;
                    }
                    fpp.startPlaylist(val, repeat, null, function (q){
                        adapter.log.debug('SetCommand command' + JSON.stringify(q));
                    });
                });
            }
        }

        if(cmd === 'volume'){
            val = doHundred(val);
            fpp.setVolume(val, function (q){
                adapter.log.debug('SetCommand volume' + JSON.stringify(q));
            });
        }
        if(cmd === 'mode'){
            fpp.setFPPDmode(val, function (q){
                adapter.log.debug('SetCommand volume' + JSON.stringify(q));
            });
        }
    }
});

function doHundred(val){
    val = parseInt(val);
    if(val < 0){
        val = 0;
    } else if(val > 100){
        val = 100;
    }
    return val;
}

adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});
adapter.on('ready', function () {
    main();
});

function main() {
    adapter.subscribeStates('*');
    var options = {
        user: adapter.config.user ? adapter.config.user : 'admin',
        password: adapter.config.password ? adapter.config.password : '87654321',
        host: adapter.config.host ? adapter.config.host : '192.168.1.25',
        port: adapter.config.port ? adapter.config.port : 80
    };
    
    fpp.connect(options);
    fpp.on('connect', function (connect) {
        clearTimeout(timer);
        adapter.setState('info.connection', true, true);
        adapter.log.info('connect...' + connect);
        states.connect = true;
        clearInterval(poll);
        getPlayList();
        poll = setInterval(function() {
            if(!tabu){
                getStatus();
            }
        }, polling_time);
    });

    fpp.on('data', function (result) {
        //adapter.log.info('data...' + result);
    });

    fpp.on('close', function (cb) {
        adapter.log.info('close...' + cb);
        adapter.setState('info.connection', false, true);
        adapter.log.error('Error connect: Reconnect after 15 sec...');
        states.connect = false;
        timer = setTimeout(function() {
            clearTimeout(timer);
            main();
        }, 15000);
    });

    fpp.on("error", function (caller, error) {
        adapter.log.error('error...' + caller);
    });

    fpp.on("debug", function (message) {
        if(adapter.log.level == "debug"){
            adapter.log.debug('DEBUG >>>' + message);
        }
    });
}

function getStatus(){
    fpp.getFPPstatus(function (res){
        for(var key in res){
            if (res.hasOwnProperty(key)){
                states.status[key] = res[key];
                SetStates();
            }
        }
    });
}

function getPlayList(){
    fpp.getPlayLists(function (res){
        states.status.playlists = res.join(',');
        /* TODO Удаление обьекта
        adapter.getStates(adapter.namespace + '.playlists.*', function (err, state){
            var name = [];
            if((err || !state)){
                adapter.log.error('getPlayLists');
            } else {
                Object.keys(state).forEach(function(key) {
                    var arr = key.split('.');
                    if(!~name.indexOf(arr[3])){
                        name.push(arr[3]);
                    }
                });
                name.forEach(function (item, i){
                    if(!~res.indexOf(name[i])){
                        var object = 'playlists.' + name[i];
                        adapter.delObject(object, function (r){
                            adapter.log.error('rDEBUG *****>>>' + JSON.stringify(r));
                        });
                    }
                });
            }
        });
        */
        res.forEach(function (item, i){
            fpp.getPlayListEntries(item, true, function (res){
                var arr = res.PlaylistEntries.playListEntry;
                if(arr.length !== undefined){
                    states.playlists[item] = arr;
                } else {
                    states.playlists[item] = [arr];
                }
            });
        });
    });
}

function SetStates(){
    var ids, val;
    Object.keys(states).forEach(function(key) {
        if(key == 'status'){
            Object.keys(states[key]).forEach(function(k) {
                if(typeof states[key][k] == 'object'){
                    Object.keys(states[key][k]).forEach(function(k2) {
                        if (states[key][k][k2] !== old_states[key][k][k2]){
                            old_states[key][k][k2] = states[key][k][k2];
                            ids = key + '.' + k + '.' + k2;
                            val = states[key][k][k2];
                            setObject(ids, val);
                        }
                    });
                } else {
                    if (states[key][k] !== old_states[key][k]){
                        old_states[key][k] = states[key][k];
                        ids = key + '.' + k;
                        val = states[key][k];
                        setObject(ids, val);
                    }
                }
            });
        }
        if(key == 'playlists'){
            var obj = states[key];
            Object.keys(obj).forEach(function(k1) {
                if(obj[k1] !== undefined){
                    var arr = obj[k1];
                    arr.forEach(function(item, i) {
                        Object.keys(item).forEach(function(k2) {
                            if(typeof old_states[key] !== 'object'){
                                old_states[key] = {};
                            }
                            if(typeof old_states[key][k1] !== 'object'){
                                old_states[key][k1] = [];
                            }
                            //adapter.log.error('DEBUG *****>>>' + JSON.stringify(old_states[key][k1][i]));
                            if(old_states[key][k1][i] == undefined){
                                //old_states[key][k1] = [];
                                old_states[key][k1][i] = {};
                                old_states[key][k1][i][k2] = states[key][k1][i][k2];
                                setObject(ids, val);
                            } else {
                                //adapter.log.error('DEBUG *****>>>' + JSON.stringify(old_states[key][k1][i]));
                                if (states[key][k1][i][k2] !== old_states[key][k1][i][k2]){
                                     old_states[key][k1][i][k2] = states[key][k1][i][k2];
                                     ids = key + '.' + k1 + '.' + i + '.' + k2;
                                     val = states[key][k1][i][k2];
                                     setObject(ids, val);
                                }
                            }
                        });
                    });
                }
            });
        }
    });
}

function setObject(name, val){
    var type = 'string';
    var role = 'state';
    adapter.log.debug('setObject ' + JSON.stringify(name));
    adapter.getState(name, function (err, state){
        if ((err || !state)){
            /*if (~name.indexOf('disabled') || ~name.indexOf('blocked')){
                type = 'boolean';
            } else {
                role = 'indicator';
            }*/
            adapter.setObject(name, {
                type:   'state',
                common: {
                    name: name,
                    desc: name,
                    type: type,
                    role: role
                },
                native: {}
            });
            adapter.setState(name, {val: val, ack: true});
        } else {
            adapter.setState(name, {val: val, ack: true});
        }
    });
}



