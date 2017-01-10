//------------------------------------------------------------------------------
// Copyright IBM Corp. 2014
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//------------------------------------------------------------------------------

//add timestamps in front of log messages
require('console-stamp')(console, '[yyyy-mm-dd HH:MM:ss.l]');

var SensorTag = require('sensortag');
var request = require('request');
//require('request-debug')(request);
//request.debug = true

var url = require('url');
var macUtil = require('getmac');
var properties = require('properties');
var connected = false;

//from config values
var sensorName = "TI Sensor Tag";
var apiKey;
var reconnectTimeout = 1000;


var accel = false;
var keys = false;
var air = true;

var airInterval = 5000;
var intervalId;

var client;

var deviceId;
var discovered = false;

properties.parse('./config.properties', {path: true}, function(err, cfg) {
  if (err) {
    console.error('A file named config.properties containing the device registration from the IBM IoT Cloud is missing.');
    console.error('The file must contain the following properties: org, type, id, auth-token.');
    throw e;
  }
  macUtil.getMac(function(err, macAddress) {
    if (err) throw err;
    deviceId = macAddress.replace(/:/gi, '');
    console.log('Device MAC Address: ' + deviceId);

    if(cfg.id != deviceId) {
    	console.warn('The device MAC address does not match the ID in the configuration file.');
    }

	sensorName = cfg['sensorName'] ? cfg['sensorName'] : sensorName;
	reconnectTimeout = cfg['reconnectTimeout'] > 0 ? cfg['reconnectTimeout'] : reconnectTimeout;
	airInterval = cfg['airInterval'] > 0 ? cfg['airInterval'] : airInterval;
	apiKey = cfg['apiKey'];
	
	if(!apiKey || apiKey == '') {
		console.warn('No api key specified for emoncms write!');
		process.exit(1);
		return;
	}
	
	console.log("sensorName: '" + sensorName + "'");
	console.log("apiKey: '" + apiKey + "'");
	console.log("reconneceTimeout: " + reconnectTimeout);
	console.log("airInterval: " + airInterval);

    //var clientId = ['d', cfg.org, cfg.type, cfg.id].join(':');

	monitorSensorTag();
  });
});

function monitorSensorTag() {

  //SensorTag.discover(function(device){
  var onDiscover = function(device) {
	
	//got the device
	SensorTag.stopDiscoverAll(onDiscover);
	
	discovered = true;
	
	console.log('Discovered device with UUID: ' + device['uuid']);

	var doConnect = function (err) {
	  if(err) {
	  	console.log('Device connect error: ' + err + ', reconnecting...');
		if(intervalId) {
			clearInterval(intervalId);
			intervalId = null;		
		}
		
		setTimeout(function() {
			console.log('Connecting to Device UUID: ' + device['uuid']);
		  	device.connectAndSetUp(doConnect);
		}, reconnectTimeout);
		
		return;
	  }
	  
	  connected = true;
	  console.log('Connected To Sensor Tag');
	  device.discoverServicesAndCharacteristics(function(callback) {
	    getDeviceInfo();
		if(air) initAirSensors();
		if(accel) initAccelAndGyro();
		if(keys) initKeys();
	  });
	}

	console.log('Connecting to Device UUID: ' + device['uuid']);
	device.connectAndSetUp(doConnect);

	device.on('disconnect', function(onDisconnect) {
	  connected = false;
	  //client.end();
	  console.log('Device disconnected, reconnecting...');
	  if(intervalId) {
		clearInterval(intervalId);
		intervalId = null;		
	  }
	  //monitorSensorTag();
	  
	  setTimeout(function() {
	  		console.log('Connecting to Device UUID: ' + device['uuid']);
		  	device.connectAndSetUp(doConnect);
		}, reconnectTimeout);
	});

	function getDeviceInfo() {
	  device.readDeviceName(function(callback) {
	    console.log('readDeviceName: '+callback);
	  });
	  device.readSystemId(function(callback) {
	    console.log('readSystemId: '+callback);
	  });
	  device.readSerialNumber(function(callback) {
		console.log('readSerialNumber: '+callback);
	  });
	  device.readFirmwareRevision(function(callback) {
	    console.log('readFirmwareRevision: '+callback);
	  });
	  device.readHardwareRevision(function(callback) {
	    console.log('readHardwareRevision: '+callback);
	  });
	  device.readSoftwareRevision(function(callback) {
		console.log('readSoftwareRevision: '+callback);
	  });
	  device.readManufacturerName(function(callback) {
		console.log('readManufacturerName: '+callback);
	  });
	}

	function initKeys() {
	  device.notifySimpleKey(function(left, right) {
	  });
	};

	function initAccelAndGyro() {
	  device.enableAccelerometer();
	  device.notifyAccelerometer(function(){});
	  device.enableGyroscope();
	  device.notifyGyroscope(function(){});
	  device.enableMagnetometer();
	  device.notifyMagnetometer(function(){});
	};

	if(accel) device.on('gyroscopeChange', function(x, y, z) {
	  var data = {
                   "d": {
                     "myName": sensorName,
                     "gyroX" : x,
                     "gyroY" : y,
                     "gyroZ" : z
                    }
                  };
	  if(client) client.publish('iot-2/evt/gyro/fmt/json', JSON.stringify(data), function() {
      });
	});

	if(accel) device.on('accelerometerChange', function(x, y, z) {
	  var data = {
                   "d": {
                     "myName": sensorName,
                     "accelX" : x,
                     "accelY" : y,
                     "accelZ" : z
                    }
                  };
	  if(client) client.publish('iot-2/evt/accel/fmt/json', JSON.stringify(data), function() {
      });
	});

	if(keys) device.on('magnetometerChange', function(x, y, z) {
	  var data = {
                   "d": {
                     "myName": sensorName,
                     "magX" : x,
                     "magY" : y,
                     "magZ" : z
                    }
                  };
	  if(client) client.publish('iot-2/evt/mag/fmt/json', JSON.stringify(data), function() {
      });
	});

    if(keys) var previousClick = {"left" : false, "right" : false};
	if(keys) device.on('simpleKeyChange', function(left, right) {
	  var data = {
                   "d": {
                     "myName": "TI SensorTag",
                     "left" : false,
                     "right" : false
                    }
                  };
      if(!previousClick.left && !previousClick.right) {
      	previousClick.left = left;
      	previousClick.right = right;
      	return;
      }
      if(previousClick.right && previousClick.left && !left && !right) {
      	data.d.right = true;
      	data.d.left = true;
      }
      if(previousClick.left && !left) {
      	data.d.left = true;
      }
      if(previousClick.right && !right) {
      	data.d.right = true;
      }

      previousClick.left = false;
      previousClick.right = false;
	  
	  if(client) client.publish('iot-2/evt/click/fmt/json', JSON.stringify(data), function() {
      });
	});

	function initAirSensors() {
		device.enableIrTemperature(function(err) {if (err) throw err;});
		device.enableHumidity(function(err) {if (err) throw err;});
		device.enableBarometricPressure(function(err) {if (err) throw err;});
		device.enableLuxometer(function(err) {if (err) throw err;});
		intervalId = setInterval(function() {
		  if(!connected) {
		  	if(intervalId) {
				clearInterval(intervalId);
				intervalId = null;		
			}
		  	return;
		  }
		  device.readLuxometer(function(error, lux) {
			  device.readBarometricPressure(function(error, pressure) {
				device.readHumidity(function(error, temperature, humidity) {
				  device.readIrTemperature(function(error, objectTemperature, ambientTemperature) {
					var data = {
						 "name": sensorName,
						 "device_id": deviceId,
						 "pressure" : pressure,
						 "humidity" : humidity,
						 "objTemp" : objectTemperature,
						 "ambientTemp" : ambientTemperature,
						 "temp" : temperature,
						 "lux" : lux
					  };
					
					console.log(JSON.stringify(data,null,1).replace(/(\r\n|\n|\r)/gm,""));
					if(data.temp == -40) {
						console.log("temp = -40, skipping...");
						return;
					}

					//Lets configure and request
					request({
						method: 'GET',
						url: 'https://emoncms.org/input/post.json?json=' + JSON.stringify(data) + '&apikey=' + apiKey
					}, function(error, response, body) {
						if(error) {
							console.log(error);
						} else {
							console.log(response.statusCode, body);
						}
					});
				  });
				});
			  });
		  });
		}, airInterval);
	}
  };
  
  
  var discover = function() {
  	if(!discovered) {
		SensorTag.stopDiscoverAll(onDiscover);

	  	console.log('Make sure the Sensor Tag is on!');
		SensorTag.discoverAll(onDiscover);
		
		setTimeout(discover, reconnectTimeout*10);
	}
  }
  
  discover();
};
