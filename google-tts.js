/**
 * Copyright 2018 Dean Cording <dean@cording.id.au>
 *
 * Portions of code are Copyright Leon Huang (https://github.com/zlargon)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 **/

const util = require('util');

var url = require('url');
var fetch = require('isomorphic-fetch');
var host = 'https://translate.google.com';

var timeout = 10 * 1000;

const MAX = 200;  // Max string length

module.exports = function(RED) {
    "use strict";

    function GoogleTTS(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        node.textField = config.textField || "payload";
        node.textFieldType = config.textFieldType || "msg";
        node.outputField = config.outputField  || "payload";
        node.outputFieldType = config.outputFieldType || "msg";
        node.languageField = config.languageField  || "en";
        node.languageFieldType = config.languageFieldType || "str";
        node.speedField = config.speedField;
        node.speedFieldType = config.speedFieldType || "num";

        const isSpace = (s, i) => /\s/.test(s.charAt(i));

        const lastIndexOfSpace = (s, left, right) => {
            for (let i = right; i >= left; i--) {
            if (isSpace(s, i)) return i;
            }
            return -1;  // not found
        };

        function XL (a, b) {
            for (var c = 0; c < b.length - 2; c += 3) {
                var d = b.charAt(c + 2);
                d = d >= 'a' ? d.charCodeAt(0) - 87 : Number(d);
                d = b.charAt(c + 1) == '+' ? a >>> d : a << d;
                a = b.charAt(c) == '+' ? a + d & 4294967295 : a ^ d;
            }
            return a;
        }

        var token = function (text, key) {
            var a = text, b = key, d = b.split('.');
            b = Number(d[0]) || 0;
            for (var e = [], f = 0, g = 0; g < a.length; g++) {
                var m = a.charCodeAt(g);
                128 > m ? e[f++] = m : (2048 > m ? e[f++] = m >> 6 | 192 : (55296 == (m & 64512) && g + 1 < a.length && 56320 == (a.charCodeAt(g + 1) & 64512) ? (m = 65536 + ((m & 1023) << 10) + (a.charCodeAt(++g) & 1023),
                e[f++] = m >> 18 | 240,
                e[f++] = m >> 12 & 63 | 128) : e[f++] = m >> 12 | 224,
                e[f++] = m >> 6 & 63 | 128),
                e[f++] = m & 63 | 128);
            }
            a = b;
            for (f = 0; f < e.length; f++) {
                a += e[f];
                a = XL(a, '+-a^+6');
            }
            a = XL(a, '+-3^+b+-f');
            a ^= Number(d[1]) || 0;
            0 > a && (a = (a & 2147483647) + 2147483648);
            a = a % 1E6;
            return a.toString() + '.' + (a ^ b);
        };


        var key = function (timeout) {
            return fetch(host, {
                timeout: timeout || 10 * 1000
            })
            .then(function (res) {
                if (res.status !== 200) {
                node.error('Request to ' + host + ' failed, status code = ' + res.status + ' (' +                          res.statusText + ')');
                }
                return res.text();
            })
            .then(function (html) {
                var match = html.match("tkk:'(\\d+.\\d+)'");

                if (!match) node.error('Get key failed from google');

                return match[1];
                
            });
        };


        node.on("input", function(msg) {

            var text = RED.util.evaluateNodeProperty(node.textField,node.textFieldType,node,msg).toString();
            var language = RED.util.evaluateNodeProperty(node.languageField,node.languageFieldType,node,msg).toString();
            var speed = parseFloat(RED.util.evaluateNodeProperty(node.speedField,node.speedFieldType,node,msg));

            if (typeof text !== 'string' || text.length === 0) {
                node.error('Input text should be a string');
                return null;
            }

            if (typeof language !== 'undefined' && (typeof language !== 'string' || language.length === 0)) {
                language = "en";
            }

            if (typeof speed !== 'undefined' && typeof speed !== 'number') {
                speed = 1;
            }

            if (speed < 0) speed = 0;
            if (speed > 1) speed = 1;


            key(timeout).then(function (key) {

                if (typeof key !== 'string' || key.length === 0) {
                    node.error('Key should be a string');
                }

                var result = [];
                var addResult = (text, start, end) => {
                    const str = text.slice(start, end + 1);
                    result.push(host + '/translate_tts' + url.format({
                        query: {
                            ie: 'UTF-8',
                            q: str,
                            tl: language,
                            total: 1,
                            idx: 0,
                            textlen: text.length,
                            tk: token(str, key),
                            client: 't',
                            prev: 'input',
                            ttsspeed: speed
                        }
                    }));
                };

                let start = 0;
                for (;;) {

                    // check text's length
                    if (text.length - start <= MAX) {
                        addResult(text, start, text.length - 1);
                        break;  // end of text
                    }

                    // check whether the word is cut in the middle.
                    let end = start + MAX - 1;
                    if (isSpace(text, end) || isSpace(text, end + 1)) {
                        addResult(text, start, end);
                        start = end + 1;
                        continue;
                    }

                    // find last index of space
                    end = lastIndexOfSpace(text, start, end);
                    if (end === -1) {
                        node.error('The length of single word is over 200 characters.');
                    }

                    // add result
                    addResult(text, start, end);
                    start = end + 1;
                }

                if (result.length == 1) result = result[0];

                if (node.outputFieldType === 'msg') {
                    RED.util.setMessageProperty(msg,node.outputField,result);
                } else if (node.outputFieldType === 'flow') {
                    node.context().flow.set(node.outputField,result);
                } else if (node.outputFieldType === 'global') {
                    node.context().global.set(node.outputField,result);
                }

                node.send(msg);
            });

            return null;
        });
    }

    RED.nodes.registerType("google-tts", GoogleTTS);
};

