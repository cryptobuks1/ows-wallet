'use strict';

angular.module('owsWalletApp.pluginApi').factory('ApiMessage', function ($rootScope, $log, lodash,  $injector, $timeout, utilService, ApiRouter) {

  var REQUEST_TIMEOUT = 3000; // milliseconds

  var sequence = 0;
  var promises = [];

  /**
   * Events
   */

  // When a message is received this listener routes the payload to process the message.
  window.addEventListener('message', receiveMessage.bind(this));

  /**
   * Constructor
   */

  function ApiMessage(data) {
    var self = this;
    this.event = {};

    if (data instanceof MessageEvent) {

      // Construct a message from the event data.
      this.event = data;

      // Check the itegrity of the message event.
      var valid = isValidEvent();

      // Assign the event message data to this message object.
      var data = JSON.parse(this.event.data);
      lodash.assign(this, data);

      if (isRequest(this) || isEvent(this)) {
        // Check the structure of the request (events are requests).
        valid = valid && isValidRequest();

        // Get and check our routing.
        this.route = ApiRouter.routeRequest(this.request) || {};
        valid = valid && isValidRoute();
      }

      // Send invalid messages back to the sender.
      if (!valid) {
        lodash.set(this, 'route.target', this.event.source);
      }

    } else {
      var request = data;

      // Set request options per caller or use defaults.
      request.opts = request.opts || {};
      request.opts.timeout = request.opts.timeout || REQUEST_TIMEOUT;

      // Construct a new message from the data and make assignments.
      // 
      // About session id:
      //
      // The header of every message includes the session id of the plugin that sources the message.
      // The session id is also on the iframe src URL.
      // Given the session id from a message header, the source iframe window can be located for postMessage().
      //
      // The session id for the host app is simply 'host' as the host app is the root window; there is no session.
      var now = new Date();
      this.header = {
        type: (isEventUrl(request.url) ? 'event' : 'message'),
        sequence: sequence++,
        id: utilService.uuidv4(),
        timestamp: now,
        sessionId: 'host',
      };
      this.request = request || {};
      this.response = {};

      // Detemine if this request is an event request and set the message target.
      // Event requests are messages that originate from the host but do not provide a response. The event is sent to a
      // plugin, the plugin should not respond (if it does the reponse will never be read).
      if (isEventUrl(request.url)) {
        var sessionId = request.url.substring(1); // Remove leading '/'
        this.route = {
          target: document.querySelector('iframe[src*="' + sessionId + '"]').contentWindow
        }
      }
    }

    /**
     * Private methods
     */

    function isEventUrl(url) {
      var m = url.match(/^\/[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i);
      return (m ? m.length > 0 : false);
    };

    function isValidEvent() {
      var valid = true;

      if(lodash.isUndefined(self.event.data)) {

        // Invalid event.
        self.response = {
          statusCode: 500,
          statusText: 'MESSAGE_NOT_VALID',
          data: {
            message: 'Invalid message event, no \'data\' found.'
          }
        };
        valid = false;

      } else if (!lodash.isString(self.event.data)) {

        // Event data not a string.
        self.response = {
          statusCode: 500,
          statusText: 'MESSAGE_NOT_VALID',
          data: {
            message: 'Invalid message event data, expected string argument but received object.'
          }
        };
        valid = false;
      }
      return valid;
    };

    function isValidRequest() {
      var valid = true;

      if (lodash.isUndefined(self.request)) {

        // No request.
        self.response  = {
          statusCode: 400,
          statusText: 'NO_REQUEST',
          data: {
            message: 'No request provided.'
          }
        };
        valid = false;

      } else if (lodash.isUndefined(self.request.method)) {

        // No request method.
        self.response  = {
          statusCode: 400,
          statusText: 'NO_METHOD',
          data: {
            message: 'No request method specified.'
          }
        };
        valid = false;
      }

      // Ensure that the specific request method is formed properly.
      switch (self.request.method) {
        case 'GET':
          break;
        case 'POST': isValidPOST() ? null : valid = false;
          break;
        case 'PUT': isValidPUT() ? null : valid = false;
          break;
      }
      return valid;
    };

    function isValidPOST() {
      var valid = true;

      // Check for required POST data.
      if (lodash.isUndefined(self.request.data)) {
        // Invalid request; does not match specification.
        self.response  = {
          statusCode: 400,
          statusText: 'REQUEST_NOT_VALID',
          data: {
            message: 'Invalid request, POST data not present in request.'
          }
        };
        valid = false;
      }
      return valid;
    };

    function isValidPUT() {
      var valid = true;

      // Check for required PUT data.
      if (lodash.isUndefined(self.request.data)) {
        // Invalid request; does not match specification.
        self.response  = {
          statusCode: 400,
          statusText: 'REQUEST_NOT_VALID',
          data: {
            message: 'Invalid request, PUT data not present in request.'
          }
        };
        valid = false;
      }
      return valid;
    };

    function isValidRoute() {
      var valid = true;

      if (lodash.isEmpty(self.route)) {

        // No route.
        self.response  = {
          statusCode: 404,
          statusText: 'ROUTE_NOT_FOUND',
          data: {
            message: 'No route specified.'
          }
        };
        valid = false;
      }
      return valid;
    };

    return this;
  };

  /**
   * Public methods
   */

  ApiMessage.prototype.send = function() {
    var self = this;
    return new Promise(function(resolve, reject) {

      // Handle message response for another target (not me).
      var onForward = function(message) {
        // Forward the response message to the requestor (message source).
        //
        var source = document.querySelector('iframe[src*="' + message.header.sessionId + '"]');

        if (!source || !source.contentWindow) {
          $log.error('[host] Cannot respond to message requestor, source has disappeared:\nMessage: ' + JSON.stringify(message));
          return;
        }

        $log.debug('[host] FORWARD RESPONSE ' + message.header.sequence + ': ' + messageToJson(message));

        // FORWARD RESPONSE MESSAGE
        //
        source.contentWindow.postMessage(angular.toJson(transport(message)), '*');
      };

      // Handle message response for messages targeting me.
      var onComplete = function(message) {
        if (message.response.statusCode < 200 || message.response.statusCode > 299) {
          // Fail
          reject({
            code: message.response.statusCode,
            source: message.request.url,
            message: message.response.statusText,
            detail: JSON.stringify(message.response.data)
          });

        } else {
          // Success
          resolve(message.response.data);

        }
      };

      if (isRequest(self)) {
        // Set the messge completion handler for our request.
        // For requests messages sourced from me use the onComplete() handler.
        // For requests messages sourced from another window use the onForward() handler.
        var onReceived = onComplete;
        if (self.route.handler == 'forwarder') {
          onReceived = onForward;
        }

        if (onReceived) {
          // Set a communication timeout timer unless the caller overrides.
          var timeoutTimer = {};
          if (self.request.opts.timeout > 0) {
            timeoutTimer = $timeout(function() {
              timeout(self);
            }, REQUEST_TIMEOUT);
          }

          // Store the promise callback for execution when a response is received.
          promises.push({
            id: self.header.id,
            onComplete: onReceived,
            timer: timeoutTimer
          });
        }
      }

      if (self.route.targetId) {
        $log.debug('[host] FORWARD REQUEST ' + self.header.sequence + ': (' + self.route.targetId + ') ' + requestToJson(self));

      } else {
        switch (self.header.type) {
          case 'message':
            $log.debug('[host] RESPONSE ' + self.header.sequence + ': ' + messageToJson(self));
            break;

          case 'event':
            $log.debug('[host] EVENT ' + self.header.sequence + ': ' + requestToJson(self));
            break;

          default:
            $log.debug('[host] REQUEST ' + self.header.sequence + ': ' + requestToJson(self));
            break;
        }
      }
  
      // SEND MESSAGE
      // Message is one of the following:
      //  - FORWARD, a request message from a client that needs to go to another client.
      //  - RESPONSE, a response processed by me for a client.
      //  - REQUEST, a request by me for a client to handle.
      //  - EVENT, an event from me to a client.
      self.route.target.postMessage(angular.toJson(transport(self)), '*');
    });
  };

  /**
   * Private static methods
   */

  function isEvent(message) {
    return (message.header.type == 'event');
  };

  function isRequest(message) {
    return (message.header.type == 'message') && lodash.isEmpty(message.response);
  };

  function receiveMessage(event) {
    var message;

    try {
      message = new ApiMessage(event);

      if (isEvent(message)) {
        processEventMessage(message);

      } else if (isRequest(message)) {
        processRequestMessage(message);

      } else {
        processResponseMessage(message);
      }

    } catch (ex) {

      // Not possible to notify client since the message is invalid.
      // The client will timeout if a valid response is not received.
      $log.error('[host] Invalid message received, ' + ex.message + ' - '+ angular.toJson(event.data));
    }
  };

  function processEventMessage(message) {
    // Get the message handler and respond to the event.
    var handler = $injector.get(message.route.handler);
    handler.respond(message, function(message) {
      // No response messages sent from events.
    });
  };

  function processResponseMessage(message) {
    var promiseIndex = lodash.findIndex(promises, function(promise) {
      return promise.id == message.header.id;
    });

    if (promiseIndex >= 0) {
      // Remove the promise from the list.
      // Cancel the timeout timer.
      // Deliver the response to the client.
      var promise = lodash.pullAt(promises, promiseIndex);
      $timeout.cancel(promise[0].timer);
      promise[0].onComplete(message);

    } else if (message.route) {

      // No promise callback, send the message normally.
      // Happens when message construction results in an immediate response.
      message.send();

    } else {

      //
      // Messages with no completion promise and no routing are dropped here.
      // This can happen when a client responds very late (after the message has already timeout).
      // The client would have alreadt been notified of the timeout.
      //
      $log.debug('[host] DROP MESSAGE ' + message.header.sequence + ': ' + messageToJson(message));
    }
  };

  function processRequestMessage(message) {
    // Set the default response target. The response to this request will be sent
    // as set here unless it is forwarded by its handler.
    message.route.target = message.event.source;

    // Get the message handler and respond to the client.
    var handler = $injector.get(message.route.handler);
    handler.respond(message, function(message) {
      message.send();
    });
  };

  // Timeout a message waiting for a reponse. Enables the client app to process a message delivery failure.
  function timeout(message) {
    $log.debug('Server request timeout: ' + serialize(message));

    var promiseIndex = lodash.findIndex(promises, function(promise) {
      return promise.id == message.header.id;
    });

    if (promiseIndex >= 0) {
      var promise = lodash.pullAt(promises, promiseIndex);

      message.response = {
        statusCode: 408,
        statusText: 'REQUEST_TIMED_OUT',
        data: {
          message: 'Request timed out.'
        }
      }
      promise[0].onComplete(message);
    } else {
      $log.warn('[host] Message request timed out but there is no promise to fulfill: ' + serialize(message));
    }
  };

  function serialize(message) {
    return angular.toJson(transport(message));
  };

  // Only these properties of a message are sent and received.
  function transport(message) {
    return {
      header: message.header,
      request: message.request,
      response: message.response
    }
  };

  function messageToJson(message) {
    var m = {
      header: message.header,
      request: message.request,
      response: message.response
    };
    return angular.toJson(m);
  };

  function requestToJson(message) {
    var r = {
      header: message.header,
      request: message.request
    };
    return angular.toJson(r);
  };

  function responseToJson(message) {
    var r = {
      header: message.header,
      response: message.response
    };
    return angular.toJson(r);
  };

  return ApiMessage;
});
