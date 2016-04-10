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
var SensorTag = require('sensortag');
var mqtt = require('mqtt');
var url = require('url');
var macUtil = require('getmac');
var properties = require('properties');
var connected = false;

//from config values
var sensorName = "TI Sensor Tag";

var mqttKeepalive = 30;
var reconnectTimeout = 1000;


var accel = false;
var keys = false;
var air = true;

var airInterval = 5000;
var intervalId;

var client;

properties.parse('./config.properties', {path: true}, function(err, cfg) {
  if (err) {
    console.error('A file named config.properties containing the device registration from the IBM IoT Cloud is missing.');
    console.error('The file must contain the following properties: org, type, id, auth-token.');
    throw e;
  }
  macUtil.getMac(function(err, macAddress) {
    if (err) throw err;
    var deviceId = macAddress.replace(/:/gi, '');
    console.log('Device MAC Address: ' + deviceId);

    if(cfg.id != deviceId) {
    	console.warn('The device MAC address does not match the ID in the configuration file.');
    }

	sensorName = cfg['sensorName'] ? cfg['sensorName'] : sensorName;
	mqttKeepalive = cfg['mqttKeepalive'] > 0 ? cfg['mqttKeepalive'] : mqttKeepalive;
	reconnectTimeout = cfg['reconnectTimeout'] > 0 ? cfg['reconnectTimeout'] : reconnectTimeout;
	airInterval = cfg['airInterval'] > 0 ? cfg['airInterval'] : airInterval;
	
	console.log("sensorName: " + sensorName);
	console.log("mqttKeepalive: " + mqttKeepalive);
	console.log("reconnectTimeout: " + reconnectTimeout);
	console.log("airInterval: " + airInterval);

    var clientId = ['d', cfg.org, cfg.type, cfg.id].join(':');

	function connectClient() {
	    console.log('Connecting to mqtts://' + cfg.org + '.messaging.internetofthings.ibmcloud.com:8883');

		client = mqtt.connect("mqtts://" + cfg.org + '.messaging.internetofthings.ibmcloud.com:8883', 
		  {
			"clientId" : clientId,
			"keepalive" : mqttKeepalive,
			"username" : "use-token-auth",
			"password" : cfg['auth-token'],
			"reconnectPeriod" : reconnectTimeout
		  });
		client.on('connect', function() {
		  console.log('MQTT client connected to IBM IoT Cloud.');
		});
		client.on('reconnect', function() {
		  console.log('MQTT client reconnected.');
		});
		client.on('offline', function() {
		  console.log('MQTT client offline.');
		});
		client.on('error', function(err) {
		  console.log('client error' + err);
		  //process.exit(1);
		  //client = null;
		  //setTimeout(function() {
		  //	connectClient();
		  //}, reconnectTimeout);
		  
		});
		client.on('close', function() {
		  console.log('client closed');
		  //process.exit(1);
		  //client = null;
		  //setTimeout(function() {
		  //	connectClient();
		  //}, reconnectTimeout);
		  
		});
	};
	connectClient();
	monitorSensorTag();
  });
});

function monitorSensorTag() {
  console.log('Make sure the Sensor Tag is on!');

  //SensorTag.discover(function(device){
  var onDiscover = function(device) {
	
	//got the device
	SensorTag.stopDiscoverAll(onDiscover);
	
	console.log('Discovered device with UUID: ' + device['uuid']);

	console.log('Connecting to Device UUID: ' + device['uuid']);

	var doConnect = function (err) {
	  if(err) {
	  	console.log('Device connect error: ' + err + ', restarting...');
		clearInterval(intervalId);
		
		setTimeout(function() {
			console.log('Connecting to Device UUID: ' + device['uuid']);
		  	device.connectAndSetUp(doConnect);
		}, reconnectTimeout);
		
		return;
	  }
	  
	  connected = true;
	  console.log('Connected To Sensor Tag');
	  device.discoverServicesAndCharacteristics(function(callback) {
	    //getDeviceInfo();
		if(air) initAirSensors();
		if(accel) initAccelAndGyro();
		if(keys) initKeys();
	  });
	}

	device.connectAndSetUp(doConnect);

	device.on('disconnect', function(onDisconnect) {
	  connected = false;
	  //client.end();
	  console.log('Device disconnected, restarting...');
	  clearInterval(intervalId);
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
		  	clearInterval(intervalId);
		  	return;
		  }
		  device.readLuxometer(function(error, lux) {
			  device.readBarometricPressure(function(error, pressure) {
				device.readHumidity(function(error, temperature, humidity) {
				  device.readIrTemperature(function(error, objectTemperature, ambientTemperature) {
					var data = {
					   "d": {
						 "myName": sensorName,
						 "pressure" : pressure,
						 "humidity" : humidity,
						 "objTemp" : objectTemperature,
						 "ambientTemp" : ambientTemperature,
						 "temp" : temperature,
						 "lux" : lux
						}
					  };
					if(client) client.publish('iot-2/evt/air/fmt/json', JSON.stringify(data), function() {
					});
				  });
				});
			  });
		  });
		}, airInterval);
	}
  };
  
  SensorTag.discoverAll(onDiscover);
};