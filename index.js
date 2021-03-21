'use strict'
const https = require('https');
const _ = require('lodash');
const fs = require('fs');

global.ack = {};
global.devices = new Proxy({}, {
    set: function(target, property, value, receiver) {
		if( ST.Info ){
			const original = _.get(target, property+'.property');
			const changed = _.get(value, 'property');

			if( !_.isEqual(original, changed) ){
				const { app_url, app_id, access_token } = ST.Info;
				const { property:change } = value;

				const path = '/updateProperty/'+property+'/';
				_.map(change, (val, type) => {
					if( _.get(original, type) != _.get(changed, type) ) {
						const url = new URL(app_url + app_id + path + type + '/' + val + '?access_token=' + access_token);
						const req = https.request(url, { method: 'POST' }, (res) => {
							let data = '';
							res.on('data', chunk => data+=chunk );
							res.on('end', () => {
								if(data){
									let result = JSON.parse(data);
									if( result.error )
										console.error(data)
								}
							});
						});
						req.on("error", err => console.error("[ST] " + err.message) );
						req.end();
					}
				});
			}
		}

        target[property] = value;
        return true;
    }
});

const STInfo = __dirname+'/config/STInfo';
if( !fs.existsSync(STInfo) ){
	fs.closeSync(fs.openSync(STInfo, 'w'));
}
const ST = {
	info:{},

	get Info() {
		let text = fs.readFileSync(STInfo, 'utf8');
		this.info = text?JSON.parse(text):null;
		return this.info;
	},

	set Info(value) {
		this.info = value;
		try {
			fs.writeFileSync(STInfo, JSON.stringify(this.info));
		} catch(e) {}
	}
}

const express = require('express');
const app = express();

app.use(express.urlencoded({extended: false}));
app.use(express.json());

app.post('/smartthings/installed', (req, res) => {
	const {body, query} = req;

	ST.Info = body;

	res.send({ message: "Success" });
});
app.post('/smartthings/uninstalled', (req, res) => {
	const {body, query} = req;

	ST.Info = '';

	res.send({ message: "Success" });
});

const EW11 = __dirname+'/config/ew11.json';
if( fs.existsSync(EW11) ) {
	const { connect } = require('net');
	const { host:EW11_HOST, port:EW11_PORT, type } = require(EW11);
	const { chop, parsing, save, setup, light, thermostat, outlet, gas, breaker } = require(__dirname+'/lib/'+type+'.js');
	const Handler = {
		'light': light,
		'thermostat': thermostat, 
		'outlet': outlet, 
		'gas': gas,
		'breaker': breaker
	};

	let socket = connect({host:EW11_HOST, port:EW11_PORT});
    	socket.on('connect', () => console.log(`EW11 - connected [${EW11_HOST}:${EW11_PORT}]`));
    	socket.on('end', () => console.log('EW11 - disconnected.')); 
    	socket.on('error', err => {
			console.log('EW11 - error');
			console.error(err);
			process.exit(0);
		});
    	socket.on('timeout', () => console.log('EW11 - connection timeout.'));

		socket.setTimeout(10000);
		socket.setKeepAlive(true, 9000);

    	socket
			.pipe(chop)
			.pipe(parsing)
			.pipe(save)
			.pipe(setup)

	//app.get("/", (req, res) => res.redirect('homenet'));

	app.get ('/homenet', (req, res) => {
		res.send(_.values(devices));
	});
	app.get ('/homenet/:id', (req, res) => {
		const {id} = req.params;
		res.send(_.get(devices, id));
	});
	app.get ('/homenet/:id/:property', (req, res) => {
		const {id, property} = req.params;
		res.send(_.get(devices, `${id}.${property}`));
	});
	app.put ('/homenet/:id/:property/:value', (req, res) => {
		const {id, property, value} = req.params;
		let message = 'Success';

		const { type } = _.get(devices, id);
		switch( type ) {
			case 'light' :
			case 'thermostat' :
			case 'outlet' :
			case 'gas' :
			case 'breaker' :
				const device = Handler[type](id, socket);
				_.set(device, property, value);
				break;

			default :
				message = 'Fail';
				break;
		}

		res.send({ message });
	});
}
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).send({status:500, message: 'internal error', type:'internal'});
});

const { port=30100 } = require(__dirname+'/config/config.json');
app.listen(port, () => {
	console.log('Run API Server');
});
