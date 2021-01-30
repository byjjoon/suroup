'use strict'
const https = require('https');
const _ = require('lodash');
const fs = require('fs');

global.state = {};
global.ack = {};
global.devices = new Proxy({}, {
    set: function(target, property, value, receiver) {
		if( ST.Info ){
			const original = _.get(target, property+'.state');
			const changed = _.get(value, 'state');

			if(original != changed){
				const { app_url, app_id, access_token } = ST.Info;
				const { property:change } = value;

				const path = '/updateProperty/'+property+'/';
				_.map(change, (val, type) => {
					const url = new URL(app_url + app_id + path + type + '/' + val + '?access_token=' + access_token);
					const req = https.request(url, { method: 'POST' }, (res) => {
						let data = '';
						res.on('data', chunk => data+=chunk );
						res.on('end', () => {});
					});
					req.on("error", err => error("[ST] " + err.message) );
					req.end();
				});
			}
		}

        target[property] = value;
        return true;
    }
});

const STInfo = 'STInfo';
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

/*
app.get('/device', (req, res) => {
	res.send({devices});
});
app.get('/ack', (req, res) => {
	res.send({ack});
});
*/

const EW11 = './config/ew11.json';
if( fs.existsSync(EW11) ){
	const { connect } = require('net');
	const { host:EW11_HOST, port:EW11_PORT, type } = require(EW11);
	const { chop, parsing, save, setup, typeOf, light } = require('./lib/'+type+'.js');


	let socket = connect({host:EW11_HOST, port:EW11_PORT});
    	socket.on('connect', () => console.log(`connected to EW11 [${EW11_HOST}:${EW11_PORT}]`));
    	socket.on('end', () => console.log('disconnected.')); 
    	socket.on('error', err => console.error(err)); 
    	socket.on('timeout', () => console.log('connection timeout.'));

    	socket
			.pipe(chop)
			.pipe(parsing)
			.pipe(save)
			.pipe(setup)

	//----------------------------------->>
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
		
		const type = typeOf(id);
		switch( type ) {
			case 'light' :
				const device = light(id);
				if(property == 'switch'){
					_.set(device, value, socket);
				}
				break;
			default :
				break;
		}

		res.send({ message: "Success" });
	});
}
app.use((err, req, res, next) => {
	// Do logging and user-friendly error message display
	console.error(err.stack);
	res.status(500).send({status:500, message: 'internal error', type:'internal'});
});

const { port=30100 } = require('./config/config.json');
app.listen(port, () => {
	console.log('Run API Server');
});

//1. http 서버가 ST의 smartapps 와 연동되게 개발.
//2. 

