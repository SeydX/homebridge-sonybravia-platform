var rp = require("request-promise");

var HK_REQS = require('../src/Requests.js');

var Accessory, Service, Characteristic;

class SOURCES {

    constructor(log, config, api) {

        Accessory = api.platformAccessory;
        Service = api.hap.Service;
        Characteristic = api.hap.Characteristic;

        var platform = this;

        this.log = log;
        this.hdminame = config.hdminame
        this.name = config.name + " " + this.hdminame;
        this.psk = config.psk;
        this.ipadress = config.ipadress;
        this.mac = config.mac;
        this.polling = config.polling;
        this.interval = config.interval;
        this.uri = config.uri;
        this.homeapp = config.homeapp;
        this.cecname = config.cecname;
        this.cecuri = config.cecuri;
        this.hdmiuri = config.uri;
        this.cecport = config.cecport;
        this.ceclogaddr = config.ceclogaddr;

        if (this.cecname) {
            this.uri = this.cecuri;
            this.name = config.name + " " + this.cecname;
            this.hdmiuri = "extInput:hdmi?port=" + config.cecport;
        }
        
        this.get = new HK_REQS(platform.psk, platform.ipadress, platform.uri, {
            "token": process.argv[2]
        }, platform.homeapp, platform.cecuri, platform.hdmiuri);
    }

    getServices() {

        var accessory = this;

        this.informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'Sony')
            .setCharacteristic(Characteristic.Model, 'Sony Bravia Source Control')
            .setCharacteristic(Characteristic.SerialNumber, 'Bravia Serial Number');

        this.SourceSwitch = new Service.Switch(this.name);

        this.SourceSwitch.getCharacteristic(Characteristic.On)
            .on('get', this.getSourceSwitch.bind(this))
            .on('set', this.setSourceSwitch.bind(this));

        //SIMPLE POLLING

        if (this.polling) {
            (function poll() {
                setTimeout(function() {
                    accessory.SourceSwitch.getCharacteristic(Characteristic.On).getValue();
                    poll()
                }, accessory.interval)
            })();
        }

        return [this.informationService, this.SourceSwitch];
    }

    _getCurrentState(callback) {

        var self = this;

        self.get.contentinfo()
            .then(response => {

                var state = JSON.stringify(response);
                callback(null, state);

            })
            .catch(err => {
                self.log("Could not retrieve status from " + self.name + ": " + err);
                callback(null, false)
            });

    }

    getSourceSwitch(callback) {

        var self = this;

        self._getCurrentState(function(err, state) {

            if (err) callback(err)
            else {

                self.get.powerstate()
                    .then(response => {

                        var currentPower = response.result[0].status;
                        var formatName = self.name.split("/")[0]
                        var newName = self.name

                        if (self.cecname) {
                            self.name = self.cecname;
                            newName = "HDMI " + self.cecport;
                            formatName = newName.split("/")[0]
                        } else {
                            self.name = self.hdminame;
                        }

                        if (currentPower == "active") {

                            if (state.match(self.name) || state.match(formatName) || state.match(newName) || state.match("logicalAddr=" + self.ceclogaddr) ||  state.match(self.uri)) {
                                callback(null, true)
                            } else {
                                callback(null, false)
                            }

                        } else if (currentPower == "standby") {
                            callback(null, false)
                        } else {
                            self.log("Could not determine TV status!")
                            callback(null, false)
                        }


                    })
                    .catch(err => {
                        self.log("Could not retrieve Source Status: " + err);
                        callback(null, false)
                    });

            }
        })

    }

    setSourceSwitch(state, callback) {

        var self = this;

        if (state) {

            self.get.powerstate()
                .then(response => {

                    var currentPower = response.result[0].status;

                    if (currentPower == "active") {

                        //TV ON - ACTIVATE SOURCE
                        self.get.sethdmi()
                            .then(response => {
                                self.log("Activate " + self.hdminame);

                                if (self.cecname) {
                                    self.get.setcontent()
                                        .then(response => {

                                            self.log("CEC detected, activate " + self.name);
                                            callback(null, true)
                                        })
                                        .catch(err => {
                                            self.log("Could not set Source on (status code %s): %s", err.statusCode, err);
                                            callback(null, false)
                                        });
                                } else {
                                    callback(null, true)
                                }

                            })
                            .catch(err => {
                                self.log("Could not set Source on (status code %s): %s", err.statusCode, err);
                                callback(null, false)
                            });

                    } else {

                        // TURN ON
                        if (self.mac) {

                            var wol = require('wake_on_lan');

                            wol.wake(self.mac, function(error) {
                                if (error) {
                                    self.log("Can't turn on the TV with the given MAC adress! Delete the MAC adress from config.json and try only with the IP adress!");
                                    callback(null, false)
                                } else {
                                    self.log("Magic packets send to " + self.mac + " - If TV stay off, please delete MAC from config.json!");

                                    self.get.powerstate()
                                        .then(response => {

                                            var currentPower = response.result[0].status;

                                            if (currentPower == "active") {

                                                self._getCurrentState(function(err, state) {

                                                    if (state.match(self.name)) {
                                                        self.log(self.name + " already on");

                                                        callback(null, true)

                                                    } else {

                                                        self.log("Connecting to " + self.name);

                                                        function sleep(time) {
                                                            return new Promise((resolve) => setTimeout(resolve, time));
                                                        }

                                                        sleep(5000).then(() => {

                                                            self.log("Connected!");

                                                            // TV ON NOW - ACTIVATE SOURCE
                                                            self.get.setcontent()
                                                                .then(response => {

                                                                    self.log("Activate " + self.name);
                                                                    callback(null, true)
                                                                })
                                                                .catch(err => {
                                                                    self.log("Could not set Source on (status code %s): %s", err.statusCode, err);
                                                                    callback(null, false)
                                                                });

                                                        });

                                                    }

                                                })

                                            } else {

                                                self.log("Could not turn on the TV!");
                                                callback(null, false)

                                            }

                                        })
                                        .catch(err => {
                                            self.log("Could not determine TV status: " + err);
                                            callback(null, false)
                                        });

                                }
                            });

                        } else {

                            self.get.poweron()
                                .then(response => {
                                    self.log("Turning on the TV");

                                    self.get.powerstate()
                                        .then(response => {

                                            var currentPower = response.result[0].status;

                                            if (currentPower == "active") {

                                                self._getCurrentState(function(err, state) {

                                                    if (state.match(self.name)) {
                                                        self.log(self.name + " already on");

                                                        callback(null, true)

                                                    } else {

                                                        self.get.sethdmi()
                                                            .then(response => {

                                                                self.log("Activate " + self.hdminame);

                                                                if (self.cecname) {

                                                                    self.log("CEC detected, Connecting to " + self.name);

                                                                    function sleep(time) {
                                                                        return new Promise((resolve) => setTimeout(resolve, time));
                                                                    }

                                                                    sleep(5000).then(() => {

                                                                        self.log("Connected!");

                                                                        // TV ON NOW - ACTIVATE SOURCE
                                                                        self.get.setcontent()
                                                                            .then(response => {

                                                                                self.log("Activate " + self.name);
                                                                                callback(null, true)
                                                                            })
                                                                            .catch(err => {
                                                                                self.log("Could not set Source on (status code %s): %s", err.statusCode, err);
                                                                                callback(null, false)
                                                                            });

                                                                    });

                                                                } else {
                                                                    callback(null, )
                                                                }


                                                            })
                                                            .catch(err => {
                                                                self.log("Could not set Source on (status code %s): %s", err.statusCode, err);
                                                                callback(null, false)
                                                            });

                                                    }

                                                })

                                            } else {

                                                self.log("Could not turn on the TV!");
                                                callback(null, false)

                                            }

                                        })
                                        .catch(err => {
                                            self.log("Could not determine TV status: " + err);
                                            callback(null, false)
                                        });

                                })
                                .catch(err => {
                                    self.log("Could not set TV on (status code %s): %s", err.statusCode, err);
                                    callback(null, false)
                                });

                        }

                    }
                })
                .catch(err => {
                    self.log("Could not get TV status (status code %s): %s", err.statusCode, err);
                    callback(null, false)
                });

        } else {

            //TURN TO HOMEAPP
            self.get.sethomeapp()
                .then(response => {

                    self.log("Turn OFF: " + self.name);
                    callback(null, false)

                })
                .catch(err => {
                    self.log("Could not set Home App on (status code %s): %s", err.statusCode, err);
                    callback(null, false)
                });

        }
    }
}

module.exports = SOURCES
