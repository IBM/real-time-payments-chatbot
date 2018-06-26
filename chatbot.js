/**
# Copyright 2017 IBM Corp. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
*/

var express = require('express');
var watson = require('watson-developer-cloud'); // watson sdk
var vcapServices = require('vcap_services');
var url = require('url'),
  http = require('http'),
  https = require('https'),
  numeral = require('numeral'),
  async = require("async"),
  extend = require('util')._extend,
  moment = require('moment');
var numbered = require('numbered');

var real_time_payments = require('./real_time_payments');

var chatbotRouter = express.Router();


var LOOKUP_ACCOUNTS = 'accounts';
var LOOKUP_TRANSACTIONS = 'transactions';
var LOOKUP_PAYMENTS = 'payments';
var LOOKUP_PENDING_APPROVAL = 'pending_approval';
var LOOKUP_CONTACTS = 'contacts'; //remove '_temp' to test using desktop browser chat without iOS mobile contact integration
var UPDATE_SEND_PAYMENT = 'send_payment';
var DATE_FORMAT = 'YYYYMMDD';
var DATE_FORMAT1 = 'MM/DD/YYYY';


//credentials
var conversation_credentials = vcapServices.getCredentials('conversation');
//credentials
var nlu_credentials = vcapServices.getCredentials('natural-language-understanding');

var NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js');

var nlu = new NaturalLanguageUnderstandingV1({
  username: nlu_credentials.username || process.env.NLU_USERNAME,
  password: nlu_credentials.password || process.env.NLU_PASSWORD,
  version_date: NaturalLanguageUnderstandingV1.VERSION_DATE_2017_02_27
});


// Create the service wrapper
var conversation = watson.conversation({
  url: 'https://gateway.watsonplatform.net/conversation/api',
  username: conversation_credentials.username || process.env.CONVERSATION_USERNAME,
  password: conversation_credentials.password || process.env.CONVERSATION_PASSWORD,
  version_date: '2016-07-11',
  version: 'v1'
});


// Endpoint to be called from the client side
chatbotRouter.post('/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || WORKSPACE_ID;
  //workspace = '<workspace-id>';

  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'Your app is running but it is yet to be configured with a <b>WORKSPACE_ID</b> environment variable. '
      }
    });
  }

  if (!req.session.user) {
    return res.json({
      'output': {
        'text': 'Please login again '
      }
    });
  }

  var person = req.session.user;

  console.log('getPerson');
  console.log(person);

  var accounts_response;
  var accounts = person.accounts;
  var tokens = person.tokens;

  if(tokens.length == 0) {
    return res.json({
      'output': {
        'text': 'Create a token first for an account. This chatbot can currently process for one account with the token'
      }
    });
  }

  for (var i = 0; i < accounts.length; i++) {
    //for(var j=0; j < tokens.length; j++) {
    if(tokens.length > 0) {
      if (accounts[i].number == tokens[0].accountNumber) {
        accounts_response = accounts[i];
        accounts_response.type = accounts[i].name;
        var balance = accounts[i].balance / 100; //round to dollars
        accounts_response.formattedBalance = numeral(balance).format('$0,0.00');
        //accounts_response.balance = account[i].balance / 100;
      }
    }
  }
  var payload = {
    workspace_id: workspace,
    context: {
      'person': person,
      'account': accounts_response,
      'amount': '',
      'alchemy_language': {
        'entities': [],
        'dates': []
      }
    },
    input: {}
  };

  if (req.body) {
    if (req.body.input) {
      payload.input = req.body.input;
    }
    if (req.body.context) {
      // The client must maintain context/state
      payload.context = req.body.context;

      if (!payload.context.person) {
        payload.context.person = person;
      }
      if (!payload.context.account) {
        payload.context.account = accounts_response;
      }
      if (!payload.context.alchemy_language) {
        payload.context.alchemy_language = {
          'entities': [],
          'dates': []
        };
      }
    }

  }

  if (payload.input && payload.input.text && payload.input.text.trim() != '') {

    var tempText = '';
    if (payload.input.text.length < 20) {
      tempText = 'temporary text to extend length temporary text to extend length ' + payload.input.text;
    } else {
      tempText = payload.input.text;
    }
    console.log('tempText');
    console.log(tempText);

    console.time('PERFORMANCE::NLUEnrichments');
    nlu.analyze({
      text: tempText,
      features: {
        entities: {}
      }
    }, function(err, response) {
      console.timeEnd('PERFORMANCE::NLUEnrichments');
      if (err) {
        console.error('nlu.analyze error:', err);
        return res.status(err.code || 500).json(err);
      } else {
        console.log('successfully called NLU for enrichments', JSON.stringify(response));
        payload.context.alchemy_language = {
          entities: response.entities || [],
          dates: response.dates ? formatDates(response.dates) : []
        };
        callconversation(payload);
      }
    });

  } else {
    callconversation(payload);
  }

  // Send the input to the conversation service
  function callconversation(payload) {
    var query_input = JSON.stringify(payload.input);
    var context_input = JSON.stringify(payload.context);

    conversation.message(payload, function(err, data) {
      if (err) {
        return res.status(err.code || 500).json(err);
      } else {
        console.log('conversation.message :: ', JSON.stringify(data, null, 2));
        //lookup actions
        checkForLookupRequestsRetail(data, function(err, data) {
          if (err) {
            //return res.status(err.code || 500).json(err);
            return res.json({
              'output': {
                'text': err
              }
            });
          } else {
            return res.json(data);
          }
        });
      }
    });

  }

});


/**
 *
 * Looks for actions requested by conversation service and provides the requested data.
 *
 **/
function checkForLookupRequestsRetail(data, callback) {
  console.log('checkForLookupRequestsRetail');

  var workspace = process.env.WORKSPACE_ID || WORKSPACE_ID;
  var payload = {
    workspace_id: workspace,
    context: data.context,
    input: data.input
  }
  console.log(JSON.stringify(data.context, null, 2));


  if (data.context && data.context.action && data.context.action.lookup && data.context.action.lookup != 'complete') {

    if (data.context.action.lookup === LOOKUP_TRANSACTIONS) {
      console.log('Lookup transactions requested');

      var transaction_response = {
        total: '',
        category: 'all',
        transactions: [],
        type: ''
      };

      if (data.context.action.category)
        transaction_response.category = data.context.action.category;
      if (data.context.action.type)
        transaction_response.type = data.context.action.type


      real_time_payments.listPayments(data.context.person, function(err, payments) {

        if (err) {
          console.log('Error while calling retail banking services for transactions', err);
          callback(err, null);
        } else {

          transaction_response.transactions = payments;
          var total = 0;
          for (var i = 0; i < payments.length; i++) {
            total += Math.abs(payments[i].amount);
          }
          transaction_response.total = total;

          transaction_response.total = numeral(transaction_response.total).format('$0,0.00');

          if (transaction_response.category === 'payment') {
            switch (transaction_response.type) {
              case 'debit':
                transaction_response.type = 'sent';
                break;
              case 'credit':
                transaction_response.type = 'received';
                break;
              default:
                transaction_response.type = '';
            }
          }

          payload.context["result"] = transaction_response;

          //clear the context's action since the lookup and append was completed.
          payload.context.action = {};

          conversation.message(payload, function(err, data) {
            if (err) {
              console.log('Error while calling conversation.message with lookup result', err);
              callback(err, null);
            } else {
              console.log('checkForLookupRequestsRetail conversation.message :: ', JSON.stringify(data, null, 2));
              callback(null, data);
            }
          });

          return;
        }

      });

    } else if (data.context.action.lookup === LOOKUP_CONTACTS) {
      console.log('Lookup contacts requested');

      var contact = {};
      var contacts = [];
      var recipients = data.context.person.recipients;
      if (recipients) {
        for (var i = 0; i < recipients.length; i++) {
          contact.fname = recipients[i].currentRecipientFirstName;
          contact.lname = recipients[i].currentRecipientLastName;
          contact.token = recipients[i].token;
          contacts.push(contact);
        }
      }

      payload.context["result"] = {
        "contacts": contacts
      };

      //clear the context's action since the lookup and append was completed.
      payload.context.action = {};

      conversation.message(payload, function(err, data) {
        if (err) {
          console.log('Error while calling conversation.message with contacts lookup result', err);
          callback(err, null);
        } else {
          console.log('checkForLookupRequestsRetail contacts conversation.message :: ', JSON.stringify(data, null, 2));
          callback(null, data);
        }
      });

      return;

    } else if (data.context.action.lookup === LOOKUP_ACCOUNTS) {
      console.log('Lookup accounts requested');

      var accounts_response;
      var user = data.context.person;
      var accounts;
      var tokens;

      real_time_payments.listTokensUsingCXCTokens(user.id, function(err, myTokens) {
        tokens = myTokens;
        real_time_payments.listDDAAccounts(user.id, function(err, myAccounts) {
          accounts = myAccounts;


          for (var i = 0; i < accounts.length; i++) {
            //for(var j=0; j < tokens.length; j++) {
            if (accounts[i].number == tokens[0].accountNumber) {
              accounts_response = accounts[i];
              accounts_response.type = accounts[i].name;
              var balance = accounts[i].balance / 100; //round to dollars
              accounts_response.formattedBalance = numeral(balance).format('$0,0.00');
            }
          }


          var account = data.context.account;
          payload.context['account'] = accounts_response;
          payload.context.action = {};

          conversation.message(payload, function(err, data) {
            if (err) {
              console.log('Error while calling conversation.message with accounts lookup result', err);
              callback(err, null);
            } else {
              console.log('checkForLookupRequestsRetail accounts conversation.message :: ', JSON.stringify(data, null, 2));
              callback(null, data);
            }
          });

          return;
        });
      });

    } else {
      callback(null, data);
      return;
    }

  } else if (data.context && data.context.action && data.context.action.update && data.context.action.update != 'complete') {

    if (data.context.action.update === UPDATE_SEND_PAYMENT) {
      console.log('send payment requested');

      var token = payload.context.result.contacts[0].token;
      var fname = payload.context.result.contact_fname;
      var lname = payload.context.result.contact_lname;
      var amount = payload.context.result.amount + '.00';
      var account = payload.context.account.number;
      var user = payload.context.person;

      var recipients = payload.context.person.recipients;
      if (recipients) {
        for (var i = 0; i < recipients.length; i++) {
          if (recipients[i].currentRecipientFirstName == fname && recipients[i].currentRecipientFirstName == lname)
            token = recipients[i].token;
          console.log('found token in recipients');
        }
      }

      real_time_payments.send(token, fname, lname, amount, account, user, function(err) {

        if (err) {
          console.log('Error while creating payment', err);
          callback(err, null);
        } else {

          //update user account
          var tokens = user.tokens;
          real_time_payments.listDDAAccounts(user.id, function(err, myAccounts) {
            accounts = myAccounts;


            for (var i = 0; i < accounts.length; i++) {
              //for(var j=0; j < tokens.length; j++) {
              if (accounts[i].number == tokens[0].accountNumber) {
                accounts_response = accounts[i];
                accounts_response.type = accounts[i].name;
                var balance = accounts[i].balance / 100; //round to dollars
                accounts_response.formattedBalance = numeral(balance).format('$0,0.00');
              }
            }


            var account = data.context.account;
            payload.context['account'] = accounts_response;
            payload.context.action = {};


            console.log(console.log('createPayment response=' + JSON.stringify(data, null, 2)));

            //clear the payload's action
            payload.context.action = {};

            conversation.message(payload, function(err, data) {
              if (err) {
                console.log('Error while calling conversation.message with send payment result', err);
                callback(err, null);
              } else {
                console.log('checkForLookupRequestsRetail send payment conversation.message :: ', JSON.stringify(data, null, 2));
                callback(null, data);
              }
            });

          });
        }

      });

    } else {
      callback(null, data);
      return;
    }


  } else {
    callback(null, data);
    return;
  }

}

function formatDates(dates) {
  var len = dates.length;
  for (var i = 0; i < len; i++) {
    dates[i]['formattedDate'] = moment(dates[i].date, 'YYYYMMDDThhmmss').format('L');
    dates[i].date = moment(dates[i].date, 'YYYYMMDDThhmmss').format('YYYYMMDD');
  }
  console.log('After formatting', JSON.stringify(dates, null, 2));
  return dates;
}

// Export
module.exports = chatbotRouter;
