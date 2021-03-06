(function(context) {

  // If this is Node, then we're running jasmine-node, which will load this file
  // first (so we need to require Lazy right here right now).
  if (typeof require === 'function') {
    context.Lazy = require('../../lazy.node.js');

    // Also need to load this for a nicer jasmine async interface
    // (see https://github.com/derickbailey/jasmine.async).
    context.AsyncSpec = require('jasmine-async')(context.jasmine);

    // ...and also need this... at least until I refactor it on out of here.
    require('./person.js');
  }

  /**
   * Tests many requirements of a sequence in one fell swoop:
   *
   * - the actual sequence behavior (input and expected output)
   * - consistent behavior among different base sequence types (e.g., wrapped
   *   array, array-like, and base)
   * - verified laziness (does not iterate until `each` is called)
   * - support for early termination
   * - support for async iteration
   */
  context.comprehensiveSequenceTest = function(names, options) {
    if (typeof name === 'string') {
      name = [name];
    }

    for (var i = 0; i < names.length; ++i) {
      for (var testCase in options.cases) {
        comprehensiveTestCase(names[i], options.cases[testCase], options);
      }
    }
  };

  function comprehensiveTestCase(name, testCase, options) {
    var label = '#' + name;

    if (testCase.label) {
      label += ' (' + testCase.label + ')';
    }

    describe(label, function() {
      var monitor, sequence;

      beforeEach(function() {
        monitor  = createMonitor(testCase.input);
        sequence = Lazy(monitor);
      });

      function getResult() {
        return testCase.apply(sequence, name);
      }

      function iterate(sequence) {
        sequence.each(Lazy.noop);
      }

      function iterateResult() {
        iterate(getResult());
      }

      function assertResult() {
        expect(getResult()).toComprise(testCase.result);
      }

      var sequenceTypes = [
        {
          label: 'an ArrayWrapper',
          transform: function() { return sequence; }
        },
        {
          label: 'an ArrayLikeSequence',
          transform: function() { return sequence.map(Lazy.identity); }
        },
        {
          label: 'an ordinary sequence',
          transform: function() { return sequence.filter(alwaysTrue); },
          arrayLike: false
        }
      ];

      for (var i = 0; i < sequenceTypes.length; ++i) {
        (function(sequenceType) {
          describe('for ' + sequenceType.label, function() {
            beforeEach(function() {
              sequence = sequenceType.transform();
            });

            it('works as expected', function() {
              assertResult();
            });

            it('is actually lazy', function() {
              getResult();
              expect(monitor.accessCount()).toBe(0);
            });

            it('supports early termination', function() {
              expect(getResult().take(2)).toComprise(testCase.result.slice(0, 2));
            });

            it('accesses the minimum number of elements from the source', function() {
              var expectedAccessCount = testCase.accessCountForTake2 || 2;

              iterate(getResult().take(2));
              expect(monitor.accessCount()).toEqual(expectedAccessCount);
            });

            if (lookupValue('arrayLike', [testCase, options])) {
              it('passes along the index with each element during iteration', function() {
                indexes = getResult().map(function(e, i) { return i; }).toArray();
                expect(indexes).toComprise(Lazy.range(indexes.length));
              });
            }

            describe('each', function() {
              it('returns true if the entire sequence is iterated', function() {
                var result = getResult().each(Lazy.noop);
                expect(result).toBe(true);
              });

              it('returns false if iteration is terminated early', function() {
                var result = getResult().each(alwaysFalse);
                expect(result).toBe(false);
              });
            });

            if (lookupValue('arrayLike', [sequenceType, options])) {
              describe('indexed access', function() {
                it('is supported', function() {
                  expect(getResult()).toBeInstanceOf(Lazy.ArrayLikeSequence);
                });

                it('does not invoke full iteration', function() {
                  getResult().get(1);
                  expect(monitor.accessCount()).toEqual(1);
                });
              });
            }

            if (lookupValue('supportsAsync', [sequenceType, options])) {
              describe('async iteration', function() {
                var async = new AsyncSpec(this);

                function getAsyncResult() {
                  return getResult().async();
                }

                // Currently this tests if blah().async() works.
                // TODO: First, think about whether async().blah() should work.
                // TODO: IF it should work, then make it work (better)!

                async.it('is supported', function(done) {
                  getAsyncResult().toArray().onComplete(function(result) {
                    expect(result).toEqual(testCase.result);
                    done();
                  });
                });

                async.it('supports early termination', function(done) {
                  var expectedAccessCount = testCase.accessCountForTake2 || 2;

                  getAsyncResult().take(2).toArray().onComplete(function(result) {
                    expect(result).toEqual(testCase.result.slice(0, 2));
                    done();
                  });
                });
              });
            }
          });
        }(sequenceTypes[i]));
      }
    });
  }

  /**
   * Takes an object (e.g. an array) and returns a copy of that object that
   * monitors its properties so that it can tell when one has been accessed.
   * This is useful for tests that want to ensure certain elements of an array
   * haven't been looked at.
   */
  function createMonitor(target) {
    var monitor  = Lazy.clone(target),
        accesses = {};

    function monitorProperty(property) {
      Object.defineProperty(monitor, property, {
        get: function() {
          accesses[property] = true;
          return target[property];
        }
      });
    }

    Lazy(target).each(function(value, property) {
      monitorProperty(property);
    });

    monitor.accessCount = function() {
      return Object.keys(accesses).length;
    };

    monitor.accessedAt = function(property) {
      return !!accesses[property];
    };

    return monitor;
  }

  /**
   * Given the name of a property, iterates over a list of objects until finding
   * one with the given property. Returns the first value found.
   */
  function lookupValue(property, objects) {
    for (var i = 0; i < objects.length; ++i) {
      if (property in objects[i]) {
        return objects[i][property];
      }
    }
  }

  context.people        = null;
  context.david         = null;
  context.mary          = null;
  context.lauren        = null;
  context.adam          = null;
  context.daniel        = null;
  context.happy         = null;
  context.arraysCreated = null;

  var originalToArray = Lazy.Sequence.prototype.toArray;
  Lazy.Sequence.prototype.toArray = function() {
    var result = originalToArray.apply(this);
    arraysCreated += 1;
    return result;
  };

  beforeEach(function() {
    context.people = [
      context.david  = new Person("David", 63, "M"),
      context.mary   = new Person("Mary", 62, "F"),
      context.lauren = new Person("Lauren", 32, "F"),
      context.adam   = new Person("Adam", 30, "M"),
      context.daniel = new Person("Daniel", 28, "M"),
      context.happy  = new Person("Happy", 25, "F")
    ];

    Person.reset(people);

    arraysCreated = 0;
  });

  beforeEach(function() {
    this.addMatchers({
      toComprise: function(elements) {
        var actual = this.actual;

        if (actual instanceof Lazy.Sequence) {
          actual = actual.value();
        }

        if (elements instanceof Lazy.Sequence) {
          elements = elements.value();
        }

        expect(actual).toEqual(elements);

        return true;
      },

      toBeInstanceOf: function(type) {
        var actual = this.actual;

        this.message = function() {
          return 'Expected ' + actual + ' to be a ' + (type.name || type);
        };

        return actual instanceof type;
      },

      toPassToEach: function(argumentIndex, expectedValues) {
        var i = 0;
        this.actual.each(function() {
          expect(arguments[argumentIndex]).toEqual(expectedValues[i++]);
        });
        return true;
      }
    });
  });

  context.ensureLaziness = function(action) {
    it("doesn't eagerly iterate the collection", function() {
      action();
      expect(Person.accesses).toBe(0);
    });
  };

  // Example usage:
  // createAsyncTest('blah', {
  //   getSequence: function() { return Lazy([1, 2, 3]); },
  //   expected: [1, 2, 3]
  // });
  context.createAsyncTest = function(description, options) {
    it(description, function() {
      performAsyncSteps(options);
    });
  };

  context.performAsyncSteps = function(options) {
    var results = [];

    // This can be a function, in case what we want to expect is not defined at the time
    // createAsyncTest is called.
    var expected = typeof options.expected === "function" ?
      options.expected() :
      options.expected;

    runs(function() {
      options.getSequence().each(function(e) { results.push(e); });

      // Should not yet be populated.
      expect(results.length).toBe(0);
    });

    waitsFor(function() {
      return results.length === expected.length;
    });

    runs(function() {
      expect(results).toEqual(expected);
    });

    if (options.additionalExpectations) {
      runs(options.additionalExpectations);
    }
  };

  context.testAllSequenceTypes = function(description, array, expectation) {
    it(description + " for a wrapped array", function() {
      var arrayWrapper = Lazy(array);
      expectation(arrayWrapper);
    });

    it(description + " for an indexed sequence", function() {
      var indexedSequence = Lazy(array).map(Lazy.identity);
      expectation(indexedSequence);
    });

    it(description + " for a non-indexed sequence", function() {
      var nonIndexedSequence = Lazy(array).filter(alwaysTrue);
      expectation(nonIndexedSequence);
    });
  };

  // ----- Helpers, to make specs more concise -----

  context.add         = function(x, y) { return x + y; };
  context.increment   = function(x) { return x + 1; };
  context.isEven      = function(x) { return x % 2 === 0; };
  context.alwaysTrue  = function(x) { return true; };
  context.alwaysFalse = function(x) { return false; };

  // ----- Specifically for spies -----

  context.toBeCalled = function(callback) {
    return function() { return callback.callCount > 0; };
  };

  context.toBePopulated = function(collection, length) {
    return function() {
      if (length) {
        return collection.length === length;
      }

      return collection.length > 0;
    };
  };

}(typeof global !== 'undefined' ? global : window));
