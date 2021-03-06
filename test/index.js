/*global describe:true, beforeEach:true, afterEach:true it:true */
"use strict";

var expect = require("chai").expect;
var dgram = require("dgram");
var EventEmitter = require("events").EventEmitter;
var net = require("net");
var jersey = require("../index");

var ONRAMP_PORT = 1627;
var OFFRAMP_PORT = 1628;
var SINK_PORT = 1259;

var wait = function(expected, callback) {
    return function() {
        if (--expected === 0) {
            callback();
        }
    };
};

var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var randomString = function(length) {
    var text = "";

    for (var i = 0; i < length; i++) {
        text += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }

    return text;
};

describe("jersey", function() {
    describe("._protocolDecoder", function() {
        it("should return a function suitable for processing 'data' events", function() {
            expect(jersey._protocolDecoder()).to.be.an.instanceof(Function);
        });

        it("should emit 'message' events when a complete message has been successfully decoded", function(done) {
            var emitter = new EventEmitter();
            emitter.on("message", function(message) {
                expect(message).to.be.an.instanceof(Buffer);
                expect(message.toString()).to.equal("Newark");

                done();
            });

            var decoder = jersey._protocolDecoder().bind(emitter);
            decoder("6:Newark");
        });

        it("should emit 'message' events when a fragmented message has been successfully decoded", function(done) {
            var emitter = new EventEmitter();
            emitter.on("message", function(message) {
                expect(message).to.be.an.instanceof(Buffer);
                expect(message.toString()).to.equal("Newark");

                done();
            });

            var decoder = jersey._protocolDecoder().bind(emitter);
            decoder("6");
            decoder(":");
            decoder("New");
            decoder("ark");
        });
    });

    describe(".offRamp()", function() {
        describe("with a connected UDP sink", function() {
            var ramp;
            var sink;

            beforeEach(function(finished) {
                var done = wait(2, finished);

                ramp = jersey.offRamp(OFFRAMP_PORT, SINK_PORT);
                ramp.on("listening", done);

                sink = dgram.createSocket("udp4");
                sink.on("listening", done);
                sink.bind(SINK_PORT);
            });

            afterEach(function(finished) {
                var done = wait(2, finished);

                ramp.on("close", done);
                sink.on("close", done);

                ramp.close();
                sink.close();
            });

            it("should receive data over a TCP connection and output it via UDP", function(done) {
                var output = randomString(1024);
                var input = output.length + ":" + output;

                // send data via TCP
                var client = net.connect(OFFRAMP_PORT, function() {
                    client.end(input);
                });

                // assert that data is received on a UDP socket
                sink.on("message", function(msg, rinfo) {
                    expect(msg.toString()).to.equal(output);
                    done();
                });
            });
        });
    });

    describe(".onRamp()", function() {
        var ramp;

        beforeEach(function(done) {
            ramp = jersey.onRamp(ONRAMP_PORT, SINK_PORT, done);
        });

        afterEach(function(done) {
            ramp.on("close", done);
            ramp.close();
        });

        describe("with a connected TCP sink", function() {
            var sink;

            beforeEach(function(done) {
                sink = net.createServer();
                sink.listen(SINK_PORT, done);
            });

            afterEach(function(done) {
                sink.on("close", done);
                sink.close();
            });

            it("should receive data via UDP and output it over a TCP connection", function(done) {
                var input = randomString(1024);

                // send data via UDP
                var client = dgram.createSocket("udp4");
                var payload = new Buffer(input);
                client.send(payload, 0, payload.length, ONRAMP_PORT, "localhost", function(err, bytes) {
                    client.close();
                });

                // assert that data is received by a TCP server
                sink.on("connection", function(sock) {
                    sock.on("data", jersey._protocolDecoder());
                    sock.on("message", function(message) {
                        expect(message.toString()).to.equal(input);
                        done();
                    });
                });
            });
        });

        describe("with a disconnected TCP sink", function() {
            it("should complete normally", function(done) {
                var input = randomString(1024);

                // send data via UDP
                var client = dgram.createSocket("udp4");
                var payload = new Buffer(input);
                client.send(payload, 0, payload.length, ONRAMP_PORT, "localhost", function(err, bytes) {
                    client.close();

                    // give the prospective ECONNREFUSED Error a chance to
                    // bubble up
                    setTimeout(done, 10);
                });
            });
        });
    });
});
