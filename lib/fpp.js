"use strict";
const zlib = require('zlib');
var querystring = require('querystring');
var http = require('http');
var events = require('events');
var util = require('util');
var XmlParser = require('fast-xml-parser');
var self, token, host, sid;
module.exports = self = new events.EventEmitter();
self.is_connected = false;
var options = {
    host: '',
    port: 80,
    path: '',
    method: '',
    headers:{
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'User-Agent':'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.99 Safari/537.36'
    }
};

self.connect = function (opts, cb){
    token = 'Basic ' + new Buffer(opts.user + ':' + opts.password).toString('base64');
    host = opts.host;
    options.path = '/';
    options.headers['content-type'] = 'text/html';
    req(options, function(result){
        options.path = '/fppxml.php?command=getFPPDmode';
        req(options, function(result){
            self.is_connected = true;
            if(typeof cb === 'function'){
                cb(true);
            } else {
                self.emit('connect', util.format('FPP connected...'));
            }
        });
    });

};

/*
 http://192.168.1.25/gpio.php (html)
 http://192.168.1.25/fppjson.php?command=setSetting&plugin=&key=GPIOInput004Enabled&value=1
 {"GPIOInput004Enabled":"1"}
 http://192.168.1.25/fppjson.php?command=setSetting&key=restartFlag&value=1
 {"restartFlag":"1"}

 http://192.168.1.25/fppjson.php?command=setSetting&key=GPIOInput004EventFalling&value=01_01
 http://192.168.1.25/fppjson.php?command=setSetting&key=GPIOInput004EventRising&value=01_01
 http://192.168.1.25/fppjson.php?command=setSetting&key=GPIOInput004EventFalling&value=
 BCM 4	7 Rising: Falling: P1 - Pin 7
 BCM 17	0	 Rising: Falling: P1 - Pin 11
 BCM 18	1	 Rising: Falling: P1 - Pin 12
 BCM 27	2	 Rising: Falling: P1 - Pin 13
 BCM 22	3	 Rising: Falling: P1 - Pin 15
 BCM 23	4	 Rising: Falling: P1 - Pin 16
 BCM 24	5	 Rising: Falling: P1 - Pin 18
 BCM 25 **	6	 Rising: Falling: P1 - Pin 22
 BCM 5	0	 Rising: Falling: P1 - Pin 29
 BCM 6	0	 Rising: Falling: P1 - Pin 31
 BCM 12	0	 Rising: Falling: P1 - Pin 32
 BCM 13	0	 Rising: Falling: P1 - Pin 33
 BCM 16	0	 Rising: Falling: P1 - Pin 36
 BCM 19	0	 Rising: Falling: P1 - Pin 35
 BCM 20	0	 Rising: Falling: P1 - Pin 38
 BCM 21	0	 Rising: Falling: P1 - Pin 40
 BCM 26	0	 Rising: Falling: P1 - Pin 37
 BCM 28	17	 Rising: Falling: P5 - Pin 3
 BCM 29	18	 Rising: Falling: P5 - Pin 4
 BCM 30	19	 Rising: Falling: P5 - Pin 5
 BCM 31	20	 Rising: Falling: P5 - Pin 6
 */

self.getFiles = function getFiles(list, cb){
    /*
        Sequences
        Music
        Videos
        Effects
        Scripts
        Logs
        Uploads
    */
    options.path = '/fppxml.php?command=getFiles&dir='+ list;
    req(options, function(result){
        self.emit('debug', util.format('getFiles: ' + result));
        if (typeof cb === 'function' ){
            var  res = parseXML(result);
            self.emit('data', util.format('command: ' + res));
            if(cb){
                cb(res);
            }
        }
    });
};
self.startPlaylist = function startPlaylist(playlist/*name*/, repeat/*bool*/, entry/*num*/, cb){
    if(entry < 0 || entry == null){
        entry = 0;
    }
    if (repeat == true){
        repeat = 'checked';
    } else {
        repeat = 'unchecked';
    }
    options.path = '/fppxml.php?command=startPlaylist&playList=' + playlist + '&repeat=' + repeat + '&playEntry=' + entry;
    req(options, function(result){
        if(result){ //<Status>true</Status>
            self.emit('debug', util.format('startPlaylist: ' + result));
            var  res = parseXML(result);
            self.emit('data', util.format('command: ' + res));
            if(cb){
                cb(res);
            }
        }
    });
};
self.getPlayListSettings = function getPlayListSettings(playlist, cb){
    options.path = '/fppxml.php?command=getPlayListSettings&pl=' + playlist;
    req(options, function(result){
        self.emit('debug', util.format('getPlayListSettings: ' + result));
        if (typeof cb === 'function' ){
            var  res = parseXML(result);
            self.emit('data', util.format('command: ' + res));
            if(cb){
                cb(res);
            }
        }
    });
};
self.getPlayListEntries = function getPlayListEntries(playlist, reload, cb){
    reload = !reload ? 'false' :'true';
    options.path = '/fppxml.php?command=getPlayListEntries&pl=' + playlist + '&reload=' + reload;
    req(options, function(result){
        self.emit('debug', util.format('getPlayListEntries: ' + result));
        if (typeof cb === 'function' ){
            self.emit('debug', util.format('parseXML: ' + JSON.stringify()));
            var  res = parseXML(result);
            if(cb){
                cb(res);
            }
        }
    });
};

self.command = function command(cmd, type, cb){
    //cmd = cmd.toLowerCase();
    /*
         stopGracefully
         stopNow
         stopFPPD
         startFPPD
         restartFPPD
         toggleSequencePause
         singleStepSequence
         singleStepSequenceBack
         getPlayLists *
     */
    if(!type){
        if(cmd == 'toggleSequencePause' || cmd == 'singleStepSequence' || cmd == 'singleStepSequenceBack'){
            type = 'json';
        } else {
            type = 'xml';
        }
    }
    options.path = '/fpp' + type + '.php?command=' + cmd;
    req(options, function(result){
        if(result){ //<Status>true</Status>
            self.emit('debug', util.format('command: ' + result));
            if(cmd == 'restartfppd'){
                clearRestartFlag();
            }
            var  res = parseXML(result);
            self.emit('data', util.format('command: ' + res));
            if(cb){
                cb(res);
            }
        }
    });
};
self.setFPPDmode = function setFPPDmode(mode, cb){
    /* TODO isNumber
     1 - Bridge
     2 - Player (Standalone)
     6 - Player (Master)
     8 - Player (Remote)
    */

    if(mode == 1 || mode == 2 || mode == 6 || mode == 8){
        mode = parseInt(mode);
    } else if(mode == 'bridge' || mode == 'standalone' || mode == 'master' || mode == 'remote'){
        mode = mode.toLowerCase();
        if(mode == 'bridge'){ mode = 1};
        if(mode == 'standalone'){ mode = 2};
        if(mode == 'master'){ mode = 6};
        if(mode == 'remote'){ mode = 8};
    } else {
        self.emit('error', util.format('setFPPDmode incorrect valueon mode'));
        if (typeof cb === 'function' ){
            cb();
        }
        return;
    }
    options.path = '/fppxml.php?command=setFPPDmode&mode=' + mode;
    req(options, function(result){
        if(result){ //<Status>true</Status>
            self.emit('debug', util.format('setFPPDmode: ' + result));
            self.emit('data', util.format('setFPPDmode: ' + result));
            var  res = parseXML(result);
            if(cb){
                cb(res);
            }
        }
    });
};
self.setVolume = function setVolume(vol, cb){
    vol = parseInt(vol);
    if(vol < 0 ){
        vol= 0 ;
    } else if(vol > 100) {
        vol = 100;
    }
    options.path = '/fppxml.php?command=setVolume&volume=' + vol.toString();
    req(options, function(result){
        if(result){ //<Status>  Mono: Playback -10239 [0%] [-99999.99dB] [on]</Status>
            self.emit('debug', util.format('setVolume: ' + result));
            self.emit('data', util.format('setVolume: ' + result));
            if (typeof cb === 'function' ){
                var res = {};
                res.status = result.replace('<Status>', '').replace('<\/Status>', '');
                cb (res);
            }
        }
    });
};
self.shutdownPi = function shutdownPi(cb){
    options.path = '/fppxml.php?command=shutdownPi';
    req(options, function(result){
        if(result){
            self.emit('debug', util.format('shutdownPi: ' + result));
            if (typeof cb === 'function' ){
                cb (parseJSON(result));
            }
        }
    });
};
self.rebootPi = function rebootPi(cb){
    options.path = '/fppxml.php?command=rebootPi';
    req(options, function(result){
        if(result){
            self.emit('debug', util.format('rebootPi: ' + result));
            if (typeof cb === 'function' ){
                cb (parseJSON(result));
            }
        }
    });
};
self.getFPPstatus = function getFPPstatus(cb){
    options.path = '/fppjson.php?command=getFPPstatus';
    req(options, function(result){
        self.emit('debug', util.format('getFPPstatus: ' + result));
        self.emit('data', util.format('getFPPstatus: ' + result));
        if (typeof cb === 'function' ){
            cb (parseJSON(result));
        }
    });
};
self.getPlayLists = function getPlayLists(cb){
    options.path = '/fppxml.php?command=getPlayLists';
    req(options, function(result){
        self.emit('debug', util.format('getPlayLists: ' + result));
        if (typeof cb === 'function' ){
            var  res = parseXML(result);
            self.emit('debug', util.format('getPlayLists: ' + res.Playlists.Playlist));
            if(cb){
                cb(res.Playlists.Playlist);
            }
        }
    });
};
self.GetFPPDUptime = function GetFPPDUptime(cb){
    options.path = '/fppxml.php?command=getFPPDUptime';
    req(options, function(result){
        self.emit('debug', util.format('GetFPPDUptime: ' + result));
        self.emit('data', util.format('GetFPPDUptime: ' + result));
        if (typeof cb === 'function' ){
            cb (/*parseJSON(*/result/*)*/);
        }
    });
};
self.PlayEffect = function PlayEffect(effectname, startChannel, cb){
     if ((startChannel == undefined) || (startChannel == '')){
         startChannel = '0';
     }
    options.path = '/fppxml.php?command=playEffect&effect=' + effectname + '&startChannel=' + startChannel;
    req(options, function(result){
        self.emit('debug', util.format('PlayEffect: ' + result));
        self.emit('data', util.format('PlayEffect: ' + result));
        if (typeof cb === 'function' ){
            cb (/*parseJSON(*/result/*)*/); //TODO
        }
    });
};
self.StopEffect = function StopEffect(effectname, cb){
    options.path = '/fppxml.php?command=stopEffect&id=' + effectname;
    req(options, function(result){
        self.emit('debug', util.format('StopEffect: ' + result));
        self.emit('data', util.format('StopEffect: ' + result));
        if (typeof cb === 'function' ){
            cb (/*parseJSON(*/result/*)*/); //TODO
        }
    });
};
self.GetRunningEffects = function GetRunningEffects(effectname, cb){
    options.path = '/fppxml.php?command=getRunningEffects';
    req(options, function(result){
        self.emit('debug', util.format('GetRunningEffects: ' + result));
        self.emit('data', util.format('GetRunningEffects: ' + result));
        if (typeof cb === 'function' ){
            cb (parseJSON(result)); //TODO
        }
    });
};
self.TriggerEvent = function TriggerEvent(id, cb){
    options.path = '/fppxml.php?command=triggerEvent&id=' + id;
    req(options, function(result){
        self.emit('debug', util.format('TriggerEvent: ' + result));
        self.emit('data', util.format('TriggerEvent: ' + result));
        if (typeof cb === 'function' ){
            cb (parseJSON(result)); //TODO
        }
    });
};
self.SetE131interface = function SetE131interface(iface, cb){
    options.path = '/fppxml.php?command=setE131interface&iface=' + iface;
    req(options, function(result){
        self.emit('debug', util.format('SetE131interface: ' + result));
        self.emit('data', util.format('SetE131interface: ' + result));
        if (typeof cb === 'function' ){
            cb (parseJSON(result)); //TODO
        }
    });
};
self.GetVideoInfo = function GetVideoInfo(file, cb){
    options.path = '/fppxml.php?command=getVideoInfo&filename=' + file;
    req(options, function(result){
        self.emit('debug', util.format('GetVideoInfo: ' + result));
        self.emit('data', util.format('GetVideoInfo: ' + result));
        if (typeof cb === 'function' ){
            cb (parseJSON(result)); //TODO
        }
    });
};



function unzip(enc, d, cb){
    var result;
    if (enc == 'gzip') {
        //adapter.log.debug('unzip encoding - ' + enc);
        zlib.gunzip(d, function(err, decoded) {
            if (cb){
                cb(decoded);
            }
        });
    } else if (enc == 'deflate') {
        //adapter.log.debug('unzip encoding - ' + enc);
        zlib.inflate(d, function(err, decoded) {
            if (cb){
                cb(decoded);
            }
        })
    } else {
        //adapter.log.debug('unzip encoding - ' + enc);
        result = parseJSON(d);
        if (result){
            cb(result);
        } else {
            //reconnect();
        }
    }
}
function clearRestartFlag(){
    options.path = '/fppjson.php?command=setSetting&key=restartFlag&value=0';
    req(options, function(result){
        if(result){
            self.emit('debug', util.format('clearRestartFlag: ' + result));
            if (typeof cb === 'function' ){
                cb(parseJSON(result));
            }
        }
    });
}
function parseXML(xml){
    var opts = {
        attrPrefix : "@_",
        textNodeName : "#text",
        ignoreNonTextNodeAttr : true,
        ignoreTextNodeAttr : true,
        ignoreNameSpace : true,
        ignoreRootElement : false,
        textNodeConversion : true,
        textAttrConversion : false,
        arrayMode : false
    };
    if(XmlParser.validate(xml)=== true){//optional
        var res = XmlParser.parse(xml, opts);
        self.emit('debug', util.format('parseXML: ' + JSON.stringify(res)));
        return res;
    }
//Intermediate obj
  /*  var tObj = fastXmlParser.getTraversalObj(xmlData,options);
      var jsonObj = fastXmlParser.convertToJson(tObj);
    */
}
function parseJSON(string){
    var result;
    try {
        result = JSON.parse(string);
        if (result){
            return result;
        } else {
            self.emit('error', util.format('Error parseJSON'));
            return null;
        }
    } catch (e) {
        self.emit('error', util.format('parseJSON Parsing error response' + JSON.stringify(e)));
    }
}
function req(options, cb){
    var buffer = '';
    options.method = 'GET';
    options.host = host;
    options.headers['Authorization'] = token;
    //options.headers['Referer'] = 'http://192.168.1.25/';
    if(sid){
        options.headers['Cookie'] = 'PHPSESSID=' + sid;
    }
    self.emit('debug', util.format('req-----: ' + JSON.stringify(options)));
    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        if (res.statusCode === 200){
            var setcookie = res.headers["set-cookie"];
            self.emit('debug', util.format('set-cookie: ' + JSON.stringify(setcookie)));
            if (setcookie &&  options.path !== '/fppxml.php?command=getFPPDmode') {
                sid = setcookie[0].substring(setcookie[0].indexOf("=") + 1, setcookie[0].indexOf(";"));
            }
            res.on('data', function (chunk) {
                buffer = chunk;
            });
            res.on('end', function () {
                cb(buffer);
            });
        } else {
            self.is_connected = false;
            self.emit('error', util.format(res.statusMessage));
            self.emit('close', util.format('FPP connect closed'));
            if(!res.statusMessage.indexOf('Authorization Required')){
                self.emit('error', util.format('Error: ' + JSON.stringify(res.statusMessage)));
            }
        }
    });
    req.on('error', function (err) {
        self.is_connected = false;
        self.emit('close', util.format('FPP connect closed'));

    });
    req.end();
}

/////////////////////////////////////////////////////////////////////////////////////////////////
self.close = self.disconnect = function () {
    if (self.is_connected) {
        self.emit('close', util.format('close')); //TODO del?
    }
};

function reqPost(options, post_data, cb){
    var buffer = '';
    post_data = querystring.stringify(post_data);
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';

    var req = https.request(options, function (res) {
        if (res.statusCode === 200){
            var chunks = [];
            res.on('data', function (chunk){
                chunks.push(chunk);
            });
            res.on('end', function (){
                buffer = Buffer.concat(chunks);
                unzip(res.headers['content-encoding'], buffer, function (result){
                    cb(result);
                });
            });
        } else {
            self.emit('error', util.format('Error send POST'));
            self.is_connected = false;
            self.emit('close', util.format('connect closed'));
        }
    });
    req.on('error', function (err) {
        self.emit('error', util.format('Error: POST connect - ' + err));
        self.is_connected = false;
        self.emit('close', util.format('connect closed'));
    });
    req.write(post_data);
    req.end();
}