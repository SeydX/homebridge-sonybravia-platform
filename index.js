var rp = require("request-promise"),
    async = require("async");

var Accessory, Service, Characteristic;

module.exports = function(homebridge) { 
    console.log("homebridge API version: " + homebridge.version);

    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-sonybravia-platform", "SonyBravia", SonyBraviaPlatform);
}

function SonyBraviaPlatform(log, config, api){
	
    log("Sony Bravia Platform Init");

    var platform = this; 

	this.config = config;
    this.log = log;
    this.name = config["name"];
    this.psk = config["psk"];
    this.ipadress = config["ipadress"];
    this.polling = config["polling"] === true;
    this.interval = (config['interval']*1000) || 2000;
    this.homeapp = config["homeapp"] || "";   
    this.uri = "";
    this.tvSwitch = config["tvSwitch"] === true;
    this.cecname = "";
    this.cecuri = "";
    this.cecport = "";
    this.ceclogaddr = "";
    
    this.cecs = config["cecs"] || [""];
}

SonyBraviaPlatform.prototype = {
	
    accessories: function(callback){ 
	    
	    var self = this;
	    var accessoriesArray = []
	    
	  	var hdmiSources = {
		  	
		  	token: null,
		  	
		  	getHDMI: function() {
			  	return rp({
				  	
				    "method": "POST",
				    "uri": "http://" + self.ipadress + "/sony/avContent",
				    "body": {
					  "method": "getCurrentExternalInputsStatus",
					  "params": ["1.0"],
					  "id": 1,
					  "version": "1.0"
				    },
				    "headers": {
					    "X-Auth-PSK": self.psk
				    },
				    "json":true
				  	
				});  	
			}	  	
		}
		
		function reqHDMI(params) {
		  hdmiSources.token = params.token;
		  return hdmiSources.getHDMI();
		}

	    //######################################## START ####################################################
	    
	    async.waterfall([
    
	        // set TV Switch
	        function (next){
	            if (self.tvSwitch){
	                var tvConfig = {
	                    uri: self.uri,
	                    name: self.name,
	               	    psk: self.psk,
	                    ipadress: self.ipadress,
	                    polling: self.polling,
	                    interval: self.interval,
	                    homeapp: self.homeapp
	                }
	                var tvAccessory = new TVSwitchAccessory(self.log, tvConfig)
	                accessoriesArray.push(tvAccessory);
	            }
	            next();
	        },
		    
	  		function(next){
		  		
		  		function fetchSources(next){
					
					reqHDMI({"token": process.argv[2]})
						.then(response => {
							
							var result = response.result[0];
							
							var hdmiArray = []
							var objArray = []
							
							for(var i = 0; i < result.length; i++){
								if(result[i].title.match("HDMI")){
									objArray.push(result[i]);
								}
							}
							
				          	objArray.forEach(function(element, index, array) {
						  		
	                                var toConfig = {
	                                    uri: element.uri,
	                                    name: element.title,
	                                    psk: self.psk,
	                                    ipadress: self.ipadress,
	                                    polling: self.polling,
	                                    tvSwitch: self.tvSwitch,
	                                    interval: self.interval,
	                                    homeapp: self.homeapp
	                                }
									
									if(self.config.cecs){
								        self.config.cecs.forEach(function(cecswitch, index, array){
							                   
							                if(element.uri.match(cecswitch.port)){
								                toConfig["cecname"] = cecswitch.label;
								                toConfig["cecuri"] = "extInput:cec?type=player&port=" + cecswitch.port + "&logicalAddr=" + cecswitch.logaddr;
								                toConfig["cecport"] = cecswitch.port;
								                toConfig["ceclogaddr"] = cecswitch.logaddr;
							                } else {
								                return
							                }
							                
							            })
							        }
	                               
						  		hdmiArray.push(toConfig);
						  		
							})
						next(null, hdmiArray)
						})
					    .catch(err => {
							self.log("Could not retrieve Source Inputs, error:" + err);
							self.log("Fetching Source Input failed - Trying again...");
							setTimeout(function(){
								fetchPower(next)
	                     	}, 10000)
	                     	
	                     	next()
					    });	  	
				
				}		  	
				fetchSources(next)
			},
			
	        // Create Accessories  
	        function(hdmiArray, next){
		          
		        async.forEachOf(hdmiArray, function (zone, key, step) {
			          
			        function pushMyAccessories(step){
				        
				        if(zone.cecname){
				        	self.log("Found Source: " + zone.cecname);
				        } else {
					        self.log("Found Source: " + zone.name);
				        }
					        
						var hdmiAccessory = new SonySourceAccessory(self.log, zone)
						accessoriesArray.push(hdmiAccessory);
						step()
				
					} pushMyAccessories(step)
				},	function(err){
					if (err) next(err)
					else next()
				})
	
			}], 
			
			function(err, result){
				if(err) callback(err)
				else callback(accessoriesArray);
          	}
          	
       )
       
    }//END accesories
}

/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/
/*******************************************************************      Sony Bravia      **************************************************************/
/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/

function SonySourceAccessory(log, config){
	
    var accessory = this;

    this.log = log;
    this.name = config.name;
    this.psk = config.psk;
    this.ipadress = config.ipadress;
    this.polling = config.polling;
    this.tvSwitch = self.tvSwitch;
    this.interval = config.interval;
    this.uri = config.uri;
    this.homeapp = config.homeapp;
    this.cecname = config.cecname;
    this.cecuri = config.cecuri;
    this.cecport = config.cecport;
    this.logaddr = config.logaddr;

    this.informationService = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Manufacturer, 'Sony')
        .setCharacteristic(Characteristic.Model, 'Sony Bravia Source Control')
        .setCharacteristic(Characteristic.SerialNumber, 'Bravia Serial Number');
    
    if(this.cecname){
	    this.uri = this.cecuri;
	    this.name = this.cecname;
    }
    
	this.SourceSwitch = new Service.Switch(this.name);

    this.SourceSwitch.getCharacteristic(Characteristic.On)
        .on('get', this.getSourceSwitch.bind(this))
        .on('set', this.setSourceSwitch.bind(this));

	//SIMPLE POLLING
	
	if(this.polling){
	    setInterval(function(){
	    	accessory.SourceSwitch.getCharacteristic(Characteristic.On).getValue();
		}, accessory.interval)
	}

	//REQUEST PROMISE LIST
 
  	this.PowerStatus = {
	  	
	  	token: null,
	  	
	  	getPower: function() {
		  	return rp({
			  	
			    "method": "POST",
			    "uri": "http://" + accessory.ipadress + "/sony/system",
			    "body": {
				  "method": "getPowerStatus",
				  "params": ["1.0"],
				  "id": 1,
				  "version": "1.0"
			    },
			    "headers": {
				    "X-Auth-PSK": accessory.psk
			    },
			    "json":true
			  	
			});  	
		}	  	
	}
	
	this.reqPower = function(params) {
	  accessory.PowerStatus.token = params.token;
	  return accessory.PowerStatus.getPower();
	}
	
  	this.PowerON = {
	  	
	  	token: null,
	  	
	  	setPowerOn: function() {
		  	return rp({
			  	
			    "method": "POST",
			    "uri": "http://" + accessory.ipadress + "/sony/system",
			    "body": {
				  "method": "setPowerStatus",
				  "params": [{"status": true}],
				  "id": 1,
				  "version": "1.0"
			    },
			    "headers": {
				    "X-Auth-PSK": accessory.psk
			    },
			    "json":true
			  	
			});  	
		}	  	
	}
	
	this.reqPowerON = function(params) {
	  accessory.PowerON.token = params.token;
	  return accessory.PowerON.setPowerOn();
	}
	
  	this.SourceStatus = {
	  	
	  	token: null,
	  	
	  	getSourceStatus: function() {
		  	return rp({
			  	
			    "method": "POST",
			    "uri": "http://" + accessory.ipadress + "/sony/avContent",
			    "body": {
				  "method": "getPlayingContentInfo",
				  "params": ["1.0"],
				  "id": 1,
				  "version": "1.0"
			    },
			    "headers": {
				    "X-Auth-PSK": accessory.psk
			    },
			    "json":true
			  	
			});  	
		}	  	
	}
	
	this.reqSource = function(params) {	
	  accessory.SourceStatus.token = params.token;
	  return accessory.SourceStatus.getSourceStatus();
	}
	
  	this.TargetSource = {
	  	
	  	token: null,
	  	
	  	setTargetSource: function() {
		  	return rp({
			  	
			    "method": "POST",
			    "uri": "http://" + accessory.ipadress + "/sony/avContent",
			    "body": {
				  "method": "setPlayContent",
				  "params": [{"uri": accessory.uri}],
				  "id": 1,
				  "version": "1.0"
			    },
			    "headers": {
				    "X-Auth-PSK": accessory.psk
			    },
			    "json":true
			  	
			});  	
		}	  	
	}
	
	this.reqTargetSource = function(params) {	
	  accessory.TargetSource.token = params.token;
	  return accessory.TargetSource.setTargetSource();
	}
	
  	this.HomeAPP = {
	  	
	  	token: null,
	  	
	  	setHomeAPP: function() {
		  	return rp({
			  	
			    "method": "POST",
			    "uri": "http://" + accessory.ipadress + "/sony/appControl",
			    "body": {
				  "method": "setActiveApp",
				  "params": [{"uri": accessory.homeapp}],
				  "id": 1,
				  "version": "1.0"
			    },
			    "headers": {
				    "X-Auth-PSK": accessory.psk
			    },
			    "json":true
			  	
			});  	
		}	  	
	}
	
	this.reqHomeAPP = function(params) {
	  accessory.HomeAPP.token = params.token;
	  return accessory.HomeAPP.setHomeAPP();
	}
 
}

/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/
/*******************************************************************      GET      **********************************************************************/
/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/

SonySourceAccessory.prototype.getServices = function(){
   return [this.informationService, this.SourceSwitch];
}

SonySourceAccessory.prototype._getCurrentState = function(callback){
	
	var self = this;
	
    self.reqSource({"token": process.argv[2]})
	.then(response => {
		
		var state = JSON.stringify(response);
        callback(null, state);
		
	})
    .catch(err => {
    	self.log("Could not retrieve status from " + self.name + "; error: " + err);
		callback(err)
    });	
	
}

SonySourceAccessory.prototype.getSourceSwitch = function(callback){
	
    var self = this;
	
    self._getCurrentState(function(err, state) {
	        
        if (err) callback (err)
        else {
	        
	        self.reqPower({"token": process.argv[2]})
			.then(response => {
				
				var currentPower = response.result[0].status;
			  	var formatName = self.name.split("/")[0]
			  	
			  	var newName = self.name;
			  	
			  	//var newName = "";
			  	
			  	if(self.cecname){
				  	newName = "HDMI " + self.cecport;
				  	formatName = newName.split("/")[0]
			  	}
			  	
				if(currentPower == "active"){
					if(state.match(self.name)||state.match(formatName)||state.match(newName)){
						callback(null, true)
					} else {
						callback(null, false)
					}
					
				}else if(currentPower == "standby"){
					callback(null, false)
				} else {
					self.log("Could not determine TV Status!")
					callback(null, false)
				}	
				
				
			})
		    .catch(err => {
				self.log("Could not retrieve Source Status, error:" + err);
				callback(err)
		    });	 
				      	
        }
    })
	
}

/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/
/*******************************************************************      SET      **********************************************************************/
/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/

SonySourceAccessory.prototype.setSourceSwitch = function(state, callback){
	
	var self = this;
		
		if(state){
			
	        self.reqPower({"token": process.argv[2]})
			.then(response => {
				
				var currentPower = response.result[0].status;	
				
				if (currentPower == "active"){
					
					//TV ON - ACTIVATE SOURCE
					self.reqTargetSource({"token": process.argv[2]})
					.then(response => {
						
			            self.log("Activate " + self.name);
			            callback(null, true)
					})
				    .catch(err => {
		                self.log("Cant set Source On (status code %s): %s", response.statusCode, err);
		                callback(err)
				    });
					    
				} else {
					
					// TV IS OFF - TURN ON
					self.reqPowerON({"token": process.argv[2]})
					.then(response => {
						
			            self.log("Turning on the TV");
			            
					})
				    .catch(err => {
		                self.log("Cant set TV On (status code %s): %s", response.statusCode, err);
		                callback(err)
				    });
				  	
				  	self._getCurrentState(function(err, state) {
					  	
					  	var newName = self.name;
					  	var formatName = self.name.split("/")[0]
					  	
					  	if(self.cecname){
						  	var newName = "HDMI " + self.port;
						  	var formatName = newName.split("/")[0]
					  	}
					  	
						if(state.match(self.name)||state.match(formatName)||state.match(newName)){
							self.log(self.name + " already on");
							
							callback(null, true)
							
						} else {
							self.log("Turn ON: " + self.name);
							
							// TV ON NOW - ACTIVATE SOURCE
							self.reqTargetSource({"token": process.argv[2]})
							.then(response => {
								
					            self.log("Activate " + self.name);
					            callback(null, true)
							})
						    .catch(err => {
				                self.log("Cant set Source On (status code %s): %s", response.statusCode, err);
				                callback(err)
						    });
							
						}
					  	
					})
					
				}
			})	
		    .catch(err => {
                self.log("Cant get TV status (status code %s): %s", response.statusCode, err);
                callback(err)
		    });	
		    
		} else {
			
			//TURN TO HOMEAPP
			self.reqHomeAPP({"token": process.argv[2]})
			.then(response => {
				
	            self.log("Turn OFF: " + self.name);
	            callback(null, false)
	            
			})
		    .catch(err => {
                self.log("Cant set HOMEAPP On (status code %s): %s", response.statusCode, err);
                callback(err)
		    });
		    
		}
  	
}

/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/
/**************************************************************      TV Switch      ******************************************************************/
/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/

function TVSwitchAccessory(log, config){
	
    var accessory = this;

    this.log = log;
    this.name = "Sony TV";
    this.psk = config.psk;
    this.ipadress = config.ipadress;
    this.polling = config.polling;
    this.interval = config.interval;
    this.uri = config.uri;
    this.homeapp = config.homeapp;
    this.tvSwitch = self.tvSwitch;

    this.informationService = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Manufacturer, 'Sony')
        .setCharacteristic(Characteristic.Model, 'Sony Bravia TV')
        .setCharacteristic(Characteristic.SerialNumber, 'Bravia Serial Number');
        
    this.TVSwitch = new Service.Switch(this.name);

    this.TVSwitch.getCharacteristic(Characteristic.On)
        .on('get', this.getTVSwitch.bind(this))
        .on('set', this.setTVSwitch.bind(this));
 
	if(this.polling){
	    setInterval(function(){
	    	accessory.TVSwitch.getCharacteristic(Characteristic.On).getValue();
		}, accessory.interval)
	}
      
    //REQUEST PROMISE LIST
    
  	this.PowerStatus = {
	  	
	  	token: null,
	  	
	  	getPower: function() {
		  	return rp({
			  	
			    "method": "POST",
			    "uri": "http://" + accessory.ipadress + "/sony/system",
			    "body": {
				  "method": "getPowerStatus",
				  "params": ["1.0"],
				  "id": 1,
				  "version": "1.0"
			    },
			    "headers": {
				    "X-Auth-PSK": accessory.psk
			    },
			    "json":true
			  	
			});  	
		}	  	
	}
	
	this.reqPower = function(params) {
	  accessory.PowerStatus.token = params.token;
	  return accessory.PowerStatus.getPower();
	}
	
  	this.PowerON = {
	  	
	  	token: null,
	  	
	  	setPowerOn: function() {
		  	return rp({
			  	
			    "method": "POST",
			    "uri": "http://" + accessory.ipadress + "/sony/system",
			    "body": {
				  "method": "setPowerStatus",
				  "params": [{"status": true}],
				  "id": 1,
				  "version": "1.0"
			    },
			    "headers": {
				    "X-Auth-PSK": accessory.psk
			    },
			    "json":true
			  	
			});  	
		}	  	
	}
	
	this.reqPowerON = function(params) {
	  accessory.PowerON.token = params.token;
	  return accessory.PowerON.setPowerOn();
	}
	
  	this.PowerOFF = {
	  	
	  	token: null,
	  	
	  	setPowerOff: function() {
		  	return rp({
			  	
			    "method": "POST",
			    "uri": "http://" + accessory.ipadress + "/sony/system",
			    "body": {
				  "method": "setPowerStatus",
				  "params": [{"status": false}],
				  "id": 1,
				  "version": "1.0"
			    },
			    "headers": {
				    "X-Auth-PSK": accessory.psk
			    },
			    "json":true
			  	
			});  	
		}	  	
	}
	
	this.reqPowerOFF = function(params) {
	  accessory.PowerOFF.token = params.token;
	  return accessory.PowerOFF.setPowerOff();
	}
}

/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/
/*******************************************************************      GET      **********************************************************************/
/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/

TVSwitchAccessory.prototype.getServices = function(){
   return [this.informationService, this.TVSwitch];
}

TVSwitchAccessory.prototype.getTVSwitch = function(callback){
	
	var self = this;
	
	self.reqPower({"token": process.argv[2]})
	.then(response => {
		
		var currentPower = response.result[0].status;
	  	
		if(currentPower == "active"){
			//self.TVSwitch.getCharacteristic(Characteristic.On).updateValue(Characteristic.On.TRUE);
			callback(null, true)
		}else if(currentPower == "standby"){
			//self.TVSwitch.getCharacteristic(Characteristic.On).updateValue(Characteristic.On.FALSE);
			callback(null, false)
		} else {
			self.log("Could not determine TV Status!")
			//self.TVSwitch.getCharacteristic(Characteristic.On).updateValue(Characteristic.On.FALSE);
			callback(null, false)
		}	
		
	})
    .catch(err => {
		self.log("Could not retrieve TV Status, error:" + err);
		callback(err)
    });	 
    
}

/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/
/*******************************************************************      SET      **********************************************************************/
/********************************************************************************************************************************************************/
/********************************************************************************************************************************************************/

TVSwitchAccessory.prototype.setTVSwitch = function(state, callback){
	
	var self = this;
	
	if(state){
		// TURN ON
		self.reqPowerON({"token": process.argv[2]})
		.then(response => {
			
	        self.log("Turning on the TV");
	        callback(null, true)
	        
		})
	    .catch(err => {
	        self.log("Cant set TV On (status code %s): %s", response.statusCode, err);
	        callback(err)
	    });
	} else {
		// TURN OFF
		self.reqPowerOFF({"token": process.argv[2]})
		.then(response => {
			
	        self.log("Turning off the TV");
	        callback(null, false)
	        
		})
	    .catch(err => {
	        self.log("Cant set TV Off (status code %s): %s", response.statusCode, err);
	        callback(err)
	    });
	}
	
}