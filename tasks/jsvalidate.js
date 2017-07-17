/*
  grunt-jsvalidate
  https://github.com/ariya/grunt-jsvalidate

  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

function createsNewScope(node) {
    return node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'Program';
}

function uninitializedVariables(ast) {
    var estraverse = require('estraverse');
    var scopeChain = [];
    var identifiers = [];
    var undefinedIdentifiers = {};

    function enter(node, parent) {
        if (createsNewScope(node)) {
            scopeChain.push([])
        }
        if (node.type === 'VariableDeclarator') {
            var currentScope = scopeChain[scopeChain.length - 1]
            currentScope.push(node.id.name)
        }
        if (parent && parent.type === 'MemberExpression') {
            if (node.name && parent.object.name === node.name) {
                identifiers.push(node.name)
            }
        } else {
            if (node.type === 'Identifier') {
                identifiers.push(node.name)
            }
        }
    }

    function leave(node) {
        if (createsNewScope(node)) {
            checkForLeaks(identifiers, scopeChain);
            scopeChain.pop();
            identifiers = [];
        }
    }

    function isVarDefined(varname, scopeChain) {
        for (var i = 0; i < scopeChain.length; i++) {
            var scope = scopeChain[i];
            if (scope.indexOf(varname) !== -1) {
                return true;
            }
        }
        return false;
    }

    function checkForLeaks(identifiers, scopeChain) {
        identifiers.forEach(function (identifier) {
            if (!isVarDefined(identifier, scopeChain)) {
                undefinedIdentifiers[identifier] = true;
            }
        });
    }

    estraverse.traverse(ast, {
        enter: enter,
        leave: leave
    });
    return Object.keys(undefinedIdentifiers);
}

module.exports = function (grunt) {
    'use strict';
    var esprima = require('esprima');
    var params;

    grunt.registerMultiTask('jsvalidate', 'Validate JavaScript source.', function () {
        params = this.options({
            globals: {},
            esprimaOptions: {},
            verbose: true
        });

        this.filesSrc.forEach(function (filepath) {
            grunt.verbose.write('jsvalidate ' + filepath);
            jsvalidate(grunt.file.read(filepath), params.esprimaOptions, params.globals, filepath);
        });

        if (this.errorCount === 0) {
            grunt.log.writeln(this.filesSrc.length + ' files are valid.');
        }

        if (this.errorCount > 0) {
            grunt.log.writeln('Encountered ' + this.errorCount + ' errors.');
        }

        return (this.errorCount === 0);
    });

    var jsvalidate = function (src, options, globals, extraMsg) {
        var syntax;

        if (params.verbose) {
            grunt.log.write('Validating' + (extraMsg ? ' ' + extraMsg : '') + '  ');
        }

        try {

            syntax = esprima.parse(src, options);
            if (!syntax.errors || syntax.errors.length === 0) {
                if (params.verbose) {
                    grunt.log.ok();
                }
            } else {
                if (!params.verbose) {
                    grunt.log.write('Validating' + (extraMsg ? ' ' + extraMsg : '') + '  ');
                }

                grunt.log.write('\n');
                syntax.errors.forEach(function (e) {
                    grunt.log.error(e.message);
                });
            }

            // uninitialized identifiers
            // TODO: more static analysis!
            if (globals.detectUninitializedVariables){
              var uninit = uninitializedVariables(syntax);
              uninit.forEach(function (un) {
                  grunt.log.error('Uninitialized: ' + un);
              });
            }
        } catch (e) {
            if (!params.verbose) {
                grunt.log.write('Validating' + (extraMsg ? ' ' + extraMsg : '') + '  ');
            }
            grunt.log.write('\n');
            grunt.log.error(e.message);
            grunt.fail.errorcount++;
        }
    };
};
