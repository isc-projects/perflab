#!/usr/bin/env node

'use strict';

const child = require('child_process');
const fs = require('fs');
const path = require('path');

function usage() {
    console.error('Usage:');
    console.error('  perf-helper.js record [--] <args>');
    console.error('  perf-helper.js gen-txt');
    process.exit(1);
}

function record(args) {
    // Find optional '--' separator and remove it
    const dashIndex = args.indexOf('--');
    if (dashIndex !== -1) {
        args.splice(dashIndex, 1);
    }

    const perfArgs = [
        'record',
        '--call-graph=dwarf,65528',
        '-F', '9',
        '-e', 'cycles:p',
        '--',
        ...args
    ];

    console.error(`Running: perf ${perfArgs.join(' ')}`);

    const result = child.spawnSync('perf', perfArgs, {
        stdio: 'inherit'
    });

    process.exit(result.status || 0);
}

function genTxt() {
    // Check if perf.data exists
    if (!fs.existsSync('perf.data')) {
        console.error('Error: perf.data not found');
        process.exit(1);
    }

    const outputFile = path.resolve('profile-data.txt.gz');

    // Run perf script and pipe to gzip
    const perfScript = child.spawn('perf', ['script', '-F', '+pid'], {
        stdio: ['inherit', 'pipe', 'inherit']
    });

    const gzip = child.spawn('gzip', [], {
        stdio: ['pipe', 'pipe', 'inherit']
    });

    const output = fs.createWriteStream(outputFile);

    perfScript.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(output);

    gzip.on('close', (code) => {
        if (code === 0) {
            console.log(outputFile);
            // Remove perf.data on success
            try {
                fs.unlinkSync('perf.data');
            } catch (e) {
                console.error('Warning: failed to remove perf.data:', e.message);
            }
        } else {
            console.error('Error: gzip failed with exit code', code);
            process.exit(1);
        }
    });

    perfScript.on('close', (code) => {
        if (code !== 0) {
            console.error('Error: perf script failed with exit code', code);
            process.exit(1);
        }
        gzip.stdin.end();
    });
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
    usage();
}

const command = args[0];

switch (command) {
    case 'record':
        record(args.slice(1));
        break;
    case 'gen-txt':
        genTxt();
        break;
    default:
        usage();
}