var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var path = require('path');
var async = require('async');

var saveState = {};
var webroot, port;

var startPlayingWhenOneBigGroup;

// for say
var groupToRejoin;

// announce volume
var announceVolume = 50;

function playfile(player, values, callback) {

  var filename = values[0];

  // Create backup preset to restore this player
  var state = player.getState();

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
          {"roomName": player.roomName, "volume": state.volume}
      ],
      "state": "playing",
      "playMode": "NORMAL"
  }



  player.on('transport-state', transportStateClosure(player, [backupPreset]));

  playLocalFile(ttsPreset, filename, player.discovery);

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

function playLocalFile(preset, filename, discovery, callback) {
    var uri = "http://" + discovery.localEndpoint + ":" + port + "/sounds/" + filename;
    preset.uri = uri;
    discovery.applyPreset(preset, callback);
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




function topologyChanged(e) {
  if (startPlayingWhenOneBigGroup && e.length == 1) {
    // is one big group now, play
    coordinator.play();
  }
}

module.exports = function (api) {
  webroot = path.resolve(__dirname + '/../../static');
  port = api.getPort();
  api.registerAction('qplay', playfile);

  // register permanent eventlistener
  api.discovery.on('topology-change', topologyChanged);
}

