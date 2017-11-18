#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const euphoriaConnection = require('euphoria-connection');
const color = require('euphoria-color');
const chalk = require('chalk');

/* configurtation */
const config = require('./config.json');

// allows the user to override any setting in the config file by affixing --{setting} {option} when calling the script 
const args = process.argv
		.join()
		.match(/-\w+,\w+/g) || [];
args.forEach( arg => {
		let key = arg
			.split(',')[0]
			.replace('-','');
		config[key] = arg.split(',')[1];
	})

const connection = new euphoriaConnection(config.room, config.human, "wss://euphoria.io", { origin: "https://euphoria.io" });

/* logging */
const logStream = fs.createWriteStream(path.join(__dirname, `application.log`), { flags: 'a' });
function log(...text) {
		text.forEach(text => {
			process.stdout.write(`\n${text}\n`)
			logStream.write(`${Date.now()} - ${JSON.stringify(text)}\n`)
		});
	}

/* memory */
const memory = []; // post memory
const stack = []; // planned event stack (timeouts) to allow us to override default acctions from CLI
let afkCounter = config.afk.delay * 1000;

const rl = readline.createInterface({
	prompt: `${config.nick}${config.prompt}`,
	input: process.stdin,
	output: process.stdout,
	terminal: true
});

connection.on('send-event', handlePost);
connection.on('send-reply', handlePost);

function handlePost(post) {
	// log anything posted
	const data = post.data;
	let parent = data.parent ? chalk.black(chalk.bgHsl(color(data.parent), 100, 50)(data.parent)) : "";
	let agent = chalk.black(chalk.bgHsl(color(data.sender.id), 100, 50)(data.sender.id));
	
	log(`${parent}:${chalk.black(chalk.bgHsl(color(data.id), 100, 50)(data.id))}:${chalk.hsl(color(data.sender.name),  100, 50)(data.sender.name)}: ${agent}> ${data.content}`);
	memory.push(data);
	rl.prompt();

}


rl.on('line', line => {
	let override;
	line = line.split(' ');
	let command = line.shift();
	line = line.join(' ');
	if (command.startsWith('q'))
		process.exit();

	if (command.startsWith('p')){
		command.shift
		connection.post(line);
		clearTimeout(stack.shift());
		override = true;
	}

	if (command.startsWith('r')){
		connection.post(line, memory[memory.length-1].id);
		clearTimeout(stack.shift());
	}

	if (command.startsWith('m')) {
		let temp = config.nick;
		nick(config.nick + " - BOT");
		connection.post(markov.end(Math.ceil(Math.random() * 100 % 40)).process(), memory[memory.length-1].id);
		// add a delay so euph doesn't prevent the rapid nickchange
		setInterval( () => nick(temp), 100);
	}

	if (command.startsWith('n')){
		config.nick = line;
		nick(config.nick);
	}

	if (command.startsWith('a'))
		nick(config.nick + " - AFK");

	if(!override)
	rl.prompt();
	afkCounter = config.afk.delay * 1000;

});

/**
 * sets the nick to {nick}
 * @param {String} nick 
 */
function nick(nick = "><>") {
	config.nick = nick;
	connection.nick(nick);
	rl.setPrompt(`${nick}${config.prompt}`);
}

connection.once('ready', () => {
	connection.nick(config.nick)
	log('bot initiated');
	rl.prompt();

	setInterval( () => {
		if(!--afkCounter)
			connection.nick(config.nick + " - AFK");

	});
});

connection.on('close', (...ev) => log('closed:', ev));