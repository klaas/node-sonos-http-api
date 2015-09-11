'use strict';

var http = require('http');
var SonosDiscovery = require('sonos-discovery');
var SonosHttpAPI = require('./lib/sonos-http-api.js');
var nodeStatic = require('node-static');
var fs = require('fs');
var path = require('path');
var webroot = path.resolve(__dirname, 'static');

var settings = {
  port: 5005,
  cacheDir: './cache',
  webroot: webroot
};

// Create webroot + tts if not exist
if (!fs.existsSync(webroot)) {
  fs.mkdirSync(webroot);
}
if (!fs.existsSync(webroot + '/tts/')) {
  fs.mkdirSync(webroot + '/tts/');
}

// load user settings
try {
  var userSettings = require(path.resolve(__dirname, 'settings.json'));
} catch (e) {
  console.log('no settings file found, will only use default settings');
}

if (userSettings) {
  for (var i in userSettings) {
    settings[i] = userSettings[i];
  }
}

var fileServer = new nodeStatic.Server(webroot);
var discovery = new SonosDiscovery(settings);
var api = new SonosHttpAPI(discovery, settings);

var server = http.createServer(function (req, res) {
  req.addListener('end', function () {
    fileServer.serve(req, res, function (err) {
      // If error, route it.
      if (!err) {
        return;
      }

      if (req.method === 'GET') {
        api.requestHandler(req, res);
      }
    });
  }).resume();
});

server.listen(settings.port, function () {
  console.log('http server listening on port', settings.port);
});


// =======================================================================================
// =======================================================================================
// FileUploadServer!
// =======================================================================================
// =======================================================================================
// upload test with: curl -i -F soundname=sound1.m4a -F file=@/Users/klaas/Desktop/IMG_0986.JPG http://localhost:5006/soundupload
// xxxx geht nicht mehr so, weil wir jetzt den originalname nehmen
// list sounds: curl http://Amazing.local:5006/sounds

String.prototype.pbSubstringAfterLastOccurenceOf = function(searchChar) {
	var lastIndex = this.lastIndexOf(searchChar)+1;
	if( lastIndex != 0 ) {
		return this.substr(lastIndex);
	} else {
		return "";
	}
}

String.prototype.pbStringByRemovingSubstringWithSeparator = function(separatorString) {
	var extension = this.pbSubstringAfterLastOccurenceOf(separatorString);
	if( extension.length > 0 ) {
		return this.substring(0, this.length - extension.length - 1);
	} else {
		return this;
	}
}


String.prototype.pbExtension = function() {
	var lastIndex = this.lastIndexOf('.')+1;
	if( lastIndex != 0 ) {
		return this.substr(lastIndex);
	} else {
		return "";
	}
}

String.prototype.pbStringByRemovingPathExtension = function() {
	var extension = this.pbExtension();
	if( extension.length > 0 ) {
		return this.substring(0, this.length - extension.length - 1);
	} else {
		return this;
	}
}

String.prototype.pbStartsWith = function(prefix) {
    return this.indexOf(prefix) === 0;
}

String.prototype.pbEndsWith = function(suffix) {
    return this.match(suffix+"$") == suffix;
};

var _pbGetAllFilesFromFolder = function(dir) {
	var recursivly = false;
	var ignorePrefix = "current-";
	var filterByExtension = "mp4";
	var filterByExtension2 = "mp3";
    var filesystem = require("fs");
    var results = [];

    filesystem.readdirSync(dir).forEach(function(filename) {

        var fullPath = dir+'/'+filename;
        var stat = filesystem.statSync(fullPath);

        if (stat && stat.isDirectory()) {
        	if( recursivly ) {
	            results = results.concat(_getAllFilesFromFolder(fullPath))
	        }
        } else {
	        var extension = filename.pbExtension();
	        if( extension == filterByExtension || extension == filterByExtension2 ) {
		        if( !filename.pbStartsWith(ignorePrefix)) {
		        	results.push(fullPath);
		        }
	        }
        }

    });

    return results;
};

var express = require('express')
var multer  = require('multer')
var storage = multer.diskStorage({
  destination: 'static/sounds/',
  filename: function (req, file, cb) {
    cb(null, file.originalname);
//     cb(null, file.fieldname + '-' + Date.now());
  }
})

var upload = multer({ storage: storage })
var app = express()

// single file upload
app.post('/soundupload', upload.single('file'), function (req, res) {
	console.log(req);
	res.status(201).end();
})

/*
app.get('/klaas/*', function (req, res, next) {
    var params = req.url.substring(1).split('/');
	console.log(req);
	console.log("params");
	console.log(params);
	res.status(201).end();
})
*/

app.get('/sounds', function (req, res) {
    var params = req.url.substring(1).split('/');
/*
	console.log(req);
	console.log("params");
	console.log(params);
*/
	
	var subdirPath = "static/sounds";
	var subdirPathLength = subdirPath.length + 1;
	var paths = _pbGetAllFilesFromFolder(subdirPath);
	var filenamesArray = paths.map(function(path) {
// 		console.log("path" + path);
	  return path.substring(subdirPathLength);
	});
	console.log(filenamesArray);
	var json = filenamesArray.map(function(filename){
		var name = filename.pbStringByRemovingPathExtension();
		if( name.lastIndexOf('-') != -1 ) {
			var duration = parseInt(name.substring(name.lastIndexOf('-') + 1));
			return {
				filename: filename,
				name: name.pbStringByRemovingSubstringWithSeparator('-'),
				duration: duration
				};
		} else {
			return {
				filename: filename,
				name: name,
				duration: null };
		}
	});
	
	res.json(json);
})

app.delete('/sounds/*', function (req, res) {
    var params = req.url.substring(1).split('/');
    
    if( params.length >= 2 ) {
		// 	console.log(req);
		console.log("params");
		console.log(params);
		
		var subdirPath = "static/sounds";
		var fullPath = subdirPath + "/" + params[1];	
		var fs = require('fs');
		
		fs.unlink(fullPath, function (err) {
			if (err) {
				console.error('error deleting ' + fullPath);
				res.status(200).end();
			} else {
				console.log('successfully deleted ' + fullPath);
				res.status(200).end();
			}
			});
			
    } else {
		res.status(400).end();
    }
	
/*
	var subdirPathLength = subdirPath.length + 1;
	var paths = _pbGetAllFilesFromFolder(subdirPath);
	var filenamesArray = paths.map(function(path) {
// 		console.log("path" + path);
	  return path.substring(subdirPathLength);
	});
	console.log(filenamesArray);
	var json = filenamesArray.map(function(filename){
		var name = filename.pbStringByRemovingPathExtension();
		if( name.lastIndexOf('-') != -1 ) {
			var duration = parseInt(name.substring(name.lastIndexOf('-') + 1));
			return {
				filename: filename,
				name: name.pbStringByRemovingSubstringWithSeparator('-'),
				duration: duration
				};
		} else {
			return {
				filename: filename,
				name: name,
				duration: null };
		}
	});
*/
	
	res.json({xx:""});
})


app.listen(5006);

