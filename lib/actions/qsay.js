var sys = require('sys');
var exec = require('child_process').exec;
 
var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var path = require('path');
var async = require('async');

var saveState = {};
var webroot, port;

// for sayall
var coordinator;
var startPlayingWhenOneBigGroup;

// for say
var groupToRejoin;

// announce volume
var announceVolume = 50;

function qsay(player, values, callback) {

  // Create backup preset to restore this player
  var state = player.getState();

  var text = unescape(values[0]),
      voice = values[1] || 'Yannick',
      volume = values[2] || state.volume;

// console.log("volume is " + volume);

  var backupPreset = {
      "players": [
          {"roomName": player.roomName, "volume": state.volume}
      ],
      "state": state.playerState,
      "uri": player.avTransportUri,
      'trackNo': state.trackNo,
      'elapsedTime': state.elapsedTime
  }

  if (player.coordinator.uuid == player.uuid) {
    // This one is coordinator, you will need to rejoin
    // remember which group you were part of.
    groupToRejoin = getGroupByCoordinator(player.discovery.zones, player.coordinator);
  }

  // Use the preset action to play the tts file
  var ttsPreset = {
      "players": [
          {"roomName": player.roomName, "volume": volume}
      ],
      "state": "playing",
      "playMode": "NORMAL"
  }



  player.on('transport-state', transportStateClosure(player, [backupPreset]));

  invokeTTS(ttsPreset, text, voice, player.discovery);

  callback();
}

function getGroupByCoordinator(zones, coordinator) {
  for (var i = 0; i < zones.length; i++) {
    var zone = zones[i];
    if (coordinator.uuid == zone.uuid) {
      return zone.id;
    }
  }
}

function getGroupCoordinatorByID(zones, id) {
  for (var i = 0; i < zones.length; i++) {
    var zone = zones[i];
    if (id == zone.id) {
      return zone.uuid;
    }
  }
}

function qsayAll(player, values, callback) {
  // Save all players
  var backupPresets = saveAll(player);

  var text = unescape(values[0]),
    voice = values[1] || 'Yannick';

  // find biggest group and all players
  var biggestZone = {};
  var allPlayers = [];
  player.discovery.zones.forEach(function (zone) {
    if (!biggestZone.members || zone.members.length > biggestZone.members.length) {
      biggestZone = zone;
    }
  });

  // add coordinator first.
  allPlayers.push( { roomName: biggestZone.coordinator.roomName, volume: announceVolume });
  coordinator = biggestZone.coordinator;

  biggestZone.members.forEach(function (i) {
    // skip coordinator, already added
    if (i.uuid == biggestZone.uuid) return;
    allPlayers.push( { roomName: i.roomName, volume: announceVolume });
  });

  player.discovery.zones.forEach(function (zone) {
    if (biggestZone.uuid == zone.uuid) {
      return;
    }
    // add the rest of the players
    zone.members.forEach(function (i) {
      allPlayers.push( { roomName: i.roomName, volume: announceVolume });
    });
  });



  var preset = {
    players: allPlayers,
    state: (player.discovery.zones.length == 1) ? 'playing': 'stopped',
    playMode: 'NORMAL'
  }

  invokeTTS(preset, text, voice, player.discovery, function () {
    if (preset.state == 'stopped') startPlayingWhenOneBigGroup = true;
  });

  coordinator.on('transport-state', transportStateClosure(coordinator, backupPresets));

  callback();
}

function invokeTTS(preset, phrase, voice, discovery, callback) {
  tryCreateTTSFile(phrase, voice, function (success, filename) {
    var uri = "http://" + discovery.localEndpoint + ":" + port + "/tts/" + filename;
    preset.uri = uri;
    discovery.applyPreset(preset, callback);
  });
}

function transportStateClosure(player, backupPresets) {
  var hasStartedPlaying = false;
  return function listener(state) {

    if (player.state.currentState == "PLAYING") {
      hasStartedPlaying = true;
      return;
    }

    if (hasStartedPlaying && player.state.currentState == "STOPPED") {
      var asyncSeries = [];
      backupPresets.forEach(function (backupPreset) {
        asyncSeries.push(function (preset) {
          return function (callback) {

            if (groupToRejoin) {
             // player was broken out, need to rejoin right coordinator
              preset.uri = 'x-rincon:' + getGroupCoordinatorByID(player.discovery.zones, groupToRejoin);
            }

            player.discovery.applyPreset(preset, function (error, result) {
              callback(error, result);
            });
          };
        }(backupPreset));
      });

      async.series(asyncSeries, function (err, result) {
        if (err)
          console.error('error in async series when applying backup', err, result)
      })
      player.removeListener('transport-state', listener);
    }
  }
}

function saveAll(player) {
  var discovery = player.discovery;
  var backupPresets = [];
  discovery.getZones().forEach(function (zone) {
      var player = discovery.getPlayerByUUID(zone.uuid);
      var state = player.getState();
      var preset = {
        'players': [
            {'roomName': player.roomName, 'volume': state.volume}
        ],
        'state': player.state.currentState,
        'uri': player.avTransportUri,
        'playMode': 'NORMAL',
        'trackNo': state.trackNo,
        'elapsedTime': state.elapsedTime
      }


      zone.members.forEach(function (p) {
        if (player.uuid != p.uuid)
          preset.players.push({roomName: p.roomName, volume: p.state.volume });
      });

      backupPresets.push(preset);

  });

  return backupPresets;
}




function tryCreateTTSFile(phrase, voice, callback) {

  // Construct a filesystem neutral filename
  var filename = crypto.createHash('sha1').update(phrase).digest('hex') + '-' + voice + '.m4a';
  var filepath = path.resolve(webroot, 'tts', filename);

  // If not already downloaded request translation
  fs.stat(filepath, function (err, stat) {
     if (err) {
        console.log('Creating new tts message file: ' + filepath);
	console.log("Creating phrase = '" + phrase + "' as .m4a");
	exec('say -v ' + voice + ' "' + phrase + '" -o ' + filepath,
  function (error, stdout, stderr) {
    console.log('say stdout: ' + stdout);
    console.log('say stderr: ' + stderr);
    if (error !== null) {
      console.log('exec error: ' + error);
    }
              callback(true, filename);
});

     } else {
        console.log('Using cached tts message file: ' + filename);
        callback(true, filename);
     }
  });
}

function topologyChanged(e) {
  if (startPlayingWhenOneBigGroup && e.length == 1) {
    // is one big group now, play
    coordinator.play();
  }
}

module.exports = function (api) {
  webroot = path.resolve(__dirname + '/../../static');
  port = api.getPort();
  api.registerAction('qsay', qsay);
  api.registerAction('qsayall', qsayAll);

  // register permanent eventlistener
  api.discovery.on('topology-change', topologyChanged);
}