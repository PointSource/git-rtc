#!/usr/bin/env node

var exec = require('child_process').exec;
var fs = require('fs');
var os = require("os");
var _ = require('underscore');

var componentOption = process.env.COMPONENT ? "-C " + process.env.COMPONENT : "";

// Setup logging
var winston = require('winston');

// Setup CLI parsing
var cli = require('./cli');
