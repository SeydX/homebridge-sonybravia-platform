var rp = require("request-promise");

var HK_REQS = require('../src/Requests.js');

var Accessory, Service, Characteristic;

class HOME_APP {

    constructor(log, config, api) {

        Accessory = api.platformAccessory;
        Service = api.hap.Service;
        Characteristic = api.hap.Characteristic;

        var platform = this;

        this.log = log;
        this.name = config.name + " Home";
        this.psk = config.psk;
        this.ipadress = config.ipadress;
        this.polling = config.polling;
        this.interval = config.interval;
        this.uri = config.uri;
        this.homeapp = config.homeapp;

        this.get = new HK_REQS(platform.psk, platform.ipadress, platform.uri, {
            "token": process.argv[2]
        });
    }

    getServices() {

        var accessory = this;

        this.informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'Sony')
            .setCharacteristic(Characteristic.Model, 'Sony Bravia Home App')
            .setCharacteristic(Characteristic.SerialNumber, 'Bravia Serial Number');

        this.HomeSwitch = new Service.Switch(this.name);

        this.HomeSwitch.getCharacteristic(Characteristic.On)
            .on('get', this.getHomeSwitch.bind(this))
            .on('set', this.setHomeSwitch.bind(this));

        this.get = new HK_REQS(accessory.psk, accessory.ipadress, accessory.uri, {
            "token": process.argv[2]
        }, accessory.homeapp);

        //SIMPLE POLLING

        if (this.polling) {
            (function poll() {
                setTimeout(function() {
                    accessory.HomeSwitch.getCharacteristic(Characteristic.On).getValue();
                    poll()
                }, accessory.interval)
            })();
        }

        return [this.informationService, this.HomeSwitch];
    }

    _getCurrentState(callback) {

        var self = this;

        self.get.contentinfo()
            .then(response => {

                var state = JSON.stringify(response);
                callback(null, state);

            })
            .catch(err => {
                self.log("Could not retrieve status from " + self.name + "; error: " + err);
                callback(null, false)
            });

    }

    getHomeSwitch(callback) {

        var self = this;

        self._getCurrentState(function(err, state) {

            if (err) callback(err)
            else {

                self.get.powerstate()
                    .then(response => {

                        var currentPower = response.result[0].status;

                        if (currentPower == "active") {
                            if (state.match("Illegal State")) {
                                callback(null, true)
                            } else {
                                callback(null, false)
                            }

                        } else if (currentPower == "standby") {
                            callback(null, false)
                        } else {
                            self.log("Could not determine TV Status!")
                            callback(null, false)
                        }


                    })
                    .catch(err => {
                        self.log("Could not retrieve TV Status, error: " + err);
                        callback(null, false)
                    });

            }
        })

    }

    setHomeSwitch(state, callback) {

        var self = this;

        if (state) {

            self.get.powerstate()
                .then(response => {

                    var currentPower = response.result[0].status;

                    if (currentPower == "active") {
                        //TV ON - ACTIVATE APP
                        self.get.sethomeapp()
                            .then(response => {

                                self.log("Turn ON: " + self.name);
                                callback(null, true)

                            })
                            .catch(err => {
                                self.log("Cant set " + self.name + " On: " + err);
                                callback(null, false)
                            });

                    } else {

                        // TV IS OFF - TURN ON
                        self.get.poweron()
                            .then(response => {

                                self.log("Turning on the TV");

                            })
                            .catch(err => {
                                self.log("Cant set TV On: " + err);
                                callback(null, false)
                            });
                            
                            
                        self.log("Connecting to " + self.name);
                        
						function sleep (time) {
						  return new Promise((resolve) => setTimeout(resolve, time));
						}
						
						sleep(2000).then(() => {
							
							self.log("Connected!");

	                        //TV ON - ACTIVATE APP
	                        self.get.sethomeapp()
	                            .then(response => {
	
	                                self.log("Turn on: " + self.name);
	                                callback(null, true)
	
	                            })
	                            .catch(err => {
	                                self.log("Cant set " + self.name + " on: " + err);
	                                callback(null, false)
	                            });
							
						});
                            

                    }
                })
                .catch(err => {
                    self.log("Cant get TV status: " + err);
                    callback(null, false)
                });

        } else {

            //TURN OFF
            self.get.termapp()
                .then(response => {

                    self.log("Turn OFF: " + self.name);

                    callback(null, false)

                })
                .catch(err => {
                    self.log("Cant turn off " + self.name + " On: " + err);
                    callback(null, false)
                });

        }
    }
}

module.exports = HOME_APP