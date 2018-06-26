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
require('dotenv').config();


var express = require('express')
, passwordHash = require('password-hash')
, cookieParser = require('cookie-parser')
, bodyParser   = require('body-parser')
, session      = require('express-session')
, sh           = require("shorthash")
, cfenv        = require('cfenv')
, Client       = require('node-rest-client').Client;

var real_time_payments = require('./real_time_payments');
var app = express();
var appEnv = cfenv.getAppEnv();

// config
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));

// middleware
app.use(bodyParser());
app.use(cookieParser('ftm rules !!'));
app.use(session());

app.use(function(req, res, next){
	var err = req.session.error, msg = req.session.success;
	delete req.session.error;
	delete req.session.success;
	res.locals.message = '';
	if (err) res.locals.message = err ;
	if (msg) res.locals.message =  msg ;
	next();
});

app.use(function(req, res, next) {
  res.locals.user = req.session.user;
  next();
});

// chatbot route
app.use( '/api', require( './chatbot' ) );

function restrict(req, res, next) {
	if (req.session.user) {
		next();
	} else {
		req.session.error = 'Access denied!';
		res.redirect('/login');
	}
}
// validation
String.prototype.isAlphaNumeric = function() {
  var regExp = /^[A-Za-z0-9]+$/;
  return this.match(regExp);
};

// creates a user name that is unique accross a shared instance of FTM
function makeUniqueUsername(username) {
	var s = username;
	if( appEnv && appEnv.app && appEnv.app.application_id ) {
		s = s + ":" + appEnv.app.application_id;
	}
	return sh.unique(s);
}

// registers a new sample application user and if necessary creates a new CXCParticipant
function register(req, cXcUser, fn) {
	if( req && req.body ) {
		var username = req.body.username;
		var password = req.body.password;
		var fname = req.body.fname;
		var lname = req.body.lname;

		if(cXcUser)	{
			real_time_payments.authenticate(username, password, function(err, user) {
				if(user) {
					return fn(null, user);
				} else {
					console.log('%s doesn\'t seem to exist locally, registering now', username);
					real_time_payments.createLocalUser(username, password, fname, lname, function(err, user) {
						return fn(null, user);
					});
				}
			});
		} else {
			console.log('%s doesn\'t seem to exist at all, registering now', username);
			real_time_payments.authenticate(username, password, function(err, user) {
				real_time_payments.createCXCParticipant(makeUniqueUsername(username), fname, lname, function(err) {
					if(!user && !err) {
						real_time_payments.createLocalUser(username, password, fname, lname, function(err, user) {
							return fn(null, user);
						});
					} else {
						return fn(err,user);
					}
				});
			});
		}
	} else {
		return fn('please specify a username, password, first and last name', null);
	}
}

// registers a new sample application user redirects to the next view
function registerAndRedirect(req, res, cXcUser) {
	register(req, cXcUser, function(err, user) {
		if( err) {
			req.session.error = err;
			res.redirect('register');
		} else{
			real_time_payments.authenticate(req.body.username, req.body.password, function(err, user){
				loginRedirect(req, res, user);
			});
		}
	});
}

// logs a sample application user in and redirects to the accounts view
function loginRedirect(req, res, user) {
	if (user) {

		real_time_payments.listTokensUsingCXCTokens(user.id, function(err, myTokens){
			user.tokens = myTokens;
			real_time_payments.listRecipientsUsingCXCRecipients(user.id, function(err, myRecipients){
				user.recipients = myRecipients;
				real_time_payments.listDDAAccounts(user.id, function(err, myAccounts) {
					user.accounts = myAccounts;
					// Regenerate session when signing in  to prevent fixation
					req.session.regenerate(function() {
						req.session.user = user;
						res.redirect('accounts');
					});
				});
			});
		});

		/*
		// Regenerate session when signing in  to prevent fixation
		req.session.regenerate(function() {
			req.session.user = user;
			res.redirect('accounts');
		});
		*/
	} else {
		req.session.error = 'Authentication failed, please check your username and password.';
		res.redirect('login');
	}
}


// Routes
app.get('/', function(req, res){
	res.redirect('login');
});

app.get('/accounts', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Accounts';
	real_time_payments.listDDAAccounts(req.session.user.id, function(err, myAccounts) {
		req.session.user.accounts = myAccounts;
		res.render('accounts');
	});
});

app.get('/tokens', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Tokens';

	real_time_payments.listTokensUsingCXCTokens(req.session.user.id, function(err, myTokens){
		req.session.user.tokens = myTokens;
		res.render('tokens');
	});
});

app.get('/newtoken', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Tokens';
	res.render('newtoken');
});

app.get('/viewtoken', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Tokens';
	res.locals.user.token = req.query.token;
	res.render('viewtoken');
});

app.get('/edittoken', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Tokens';
	res.locals.user.token = req.query.token;
	res.render('edittoken');
});

app.post('/newtoken', restrict, function(req, res){
	console.log('POST newtoken %s:%s:%s', req.body.legal, req.body.contact, req.body.account);
	if(req.body.legal) {
		real_time_payments.createCXCToken(req.body.account, req.session.user, req.body.contact, function(err) {
			req.session.error = err;
			res.redirect('tokens');
		});
	} else {
		req.session.error = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
		console.log(req.session.error);
		res.redirect('newtoken');
	}
});

app.post('/edittoken', restrict, function(req, res){
	console.log('POST edittoken %s:%s:%s', req.body.legal, req.body.contact, req.body.account);
	if(req.body.legal) {
		real_time_payments.editCXCToken(req.body.account, req.session.user, req.body.contact, function(err) {
			req.session.error = err;
			res.redirect('tokens');
		});
	} else {
		req.session.error = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
		console.log(req.session.error);
		res.redirect('edittoken?token=' + req.body.contact);
	}
});

app.get('/deletetoken', restrict, function(req, res){
	real_time_payments.deleteCXCToken(req.query.token, req.session.user.id, function(err) {
			req.session.error = err;
			res.redirect('tokens');
		});
});

app.get('/recipients', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Recipients';

	real_time_payments.listRecipientsUsingCXCRecipients(req.session.user.id, function(err, myRecipients){
		req.session.user.recipients = myRecipients;
		res.render('recipients');
	});
});

app.get('/newrecipient', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Recipients';
	res.render('newrecipient');
});

app.get('/viewrecipient', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Recipients';
	res.locals.recipienttoken = req.query.token;
	res.locals.recipientfname = req.query.fname;
	res.locals.recipientlname = req.query.lname;
	res.render('viewrecipient');
});

app.get('/editrecipient', restrict, function(req, res){
	res.locals.section = '1';
	res.locals.title = 'Recipients';
	res.locals.recipienttoken = req.query.token;
	res.locals.recipientfname = req.query.fname;
	res.locals.recipientlname = req.query.lname;
	res.render('editrecipient');
});

app.post('/newrecipient', restrict, function(req, res){
	console.log('POST newrecipient %s:%s:%s', req.body.token, req.body.fname, req.body.lname);
	real_time_payments.createCXCRecipient(req.body.token, req.body.fname, req.body.lname, req.session.user.id, function(err) {
		req.session.error = err;
		res.redirect('recipients');
	});
});

app.post('/editrecipient', restrict, function(req, res){
	console.log('POST editrecpient %s:%s:%s', req.body.token, req.body.fname, req.body.lname);
	real_time_payments.editCXCRecipient(req.body.fname, req.body.lname, req.body._token, req.body._fname, req.body._lname,
					 req.session.user.id, function(err) {
		req.session.error = err;
		res.redirect('recipients');
	});
});

app.get('/deleterecipient', restrict, function(req, res){
	real_time_payments.deleteCXCRecipient(req.query.token, req.query.fname, req.query.lname, req.session.user.id, function(err) {
			req.session.error = err;
			res.redirect('recipients');
		});
});

app.get('/send', restrict, function(req, res){
	res.locals.section = '2';
	res.locals.title = 'Send';

	real_time_payments.listTokensUsingCXCTokens(req.session.user.id, function(err, myTokens){
		req.session.user.tokens = myTokens;
		real_time_payments.listRecipientsUsingCXCRecipients(req.session.user.id, function(err, myRecipients){
			req.session.user.recipients = myRecipients;
			res.render('send');
		});
	});
});

app.get('/send2', restrict, function(req, res){
	res.locals.section = '2';
	res.locals.title = 'Send';
	res.locals.recipienttoken = req.query.token;
	res.locals.recipientfname = req.query.fname;
	res.locals.recipientlname = req.query.lname;
	real_time_payments.listTokensUsingCXCTokens(req.session.user.id, function(err, myTokens){
		req.session.user.tokens = myTokens;
		res.render('send2');
	});
});

app.post('/send', restrict, function(req, res){
	console.log('POST send %s:%s:%s:%s:%s:%s:%s', req.body.token, req.body.fname, req.body.lname, req.body.amount, req.body.account, req.session.user.fname, req.session.user.lname);
	real_time_payments.send(req.body.token, req.body.fname, req.body.lname, req.body.amount, req.body.account, req.session.user, function(err) {
		req.session.error = err;
		if(err){
			res.redirect('send2?token=' + req.body.token + '&fname=' + req.body.fname +'&lname=' + req.body.lname);
		}
		else{
			res.redirect('activity');
		}
	});
});

app.get('/request', restrict, function(req, res){
	res.locals.section = '3';
	res.locals.title = 'Request';

	real_time_payments.listTokensUsingCXCTokens(req.session.user.id, function(err, myTokens){
		req.session.user.tokens = myTokens;
		real_time_payments.listRecipientsUsingCXCRecipients(req.session.user.id, function(err, myRecipients){
			req.session.user.recipients = myRecipients;
			res.render('request');
		});
	});
});

app.get('/request2', restrict, function(req, res){
	res.locals.section = '3';
	res.locals.title = 'Request';
	res.locals.recipienttoken = req.query.token;
	res.locals.recipientfname = req.query.fname;
	res.locals.recipientlname = req.query.lname;
	real_time_payments.listTokensUsingCXCTokens(req.session.user.id, function(err, myTokens){
		req.session.user.tokens = myTokens;
		res.render('request2');
	});
});

app.post('/request', restrict, function(req, res){
	console.log('POST request %s:%s:%s:%d', req.body.token, req.body.fname, req.body.lname, req.body.amount, req.body.account);
	if( !req.body.amount ||  req.body.amount == 0 ) {
		req.session.error = 'Please enter a non-zero amount';
		res.redirect('request2?token=' + req.body.token + '&fname=' + req.body.fname +'&lname=' + req.body.lname);
	} else {
		real_time_payments.request(req.body.token, req.body.fname, req.body.lname, req.body.amount, req.body.account, req.session.user.id, function(err) {
			req.session.error = err;
			if(err){
				res.redirect('request2?token=' + req.body.token + '&fname=' + req.body.fname +'&lname=' + req.body.lname);
			}
			else{
				res.redirect('activity');
			}
		});
	}
});

app.get('/activity', restrict, function(req, res){
	res.locals.section = '4';
	res.locals.title = 'Activity';

	real_time_payments.listTokensUsingCXCTokens(req.session.user.id, function(err, myTokens) {
		req.session.user.tokens = myTokens;
		real_time_payments.listPaymentRequests(req.session.user.id, function(err, myPaymentRequests){
			req.session.user.paymentrequests = myPaymentRequests;
			real_time_payments.listPayments(req.session.user, function(err, myPayments){
				req.session.user.payments = myPayments;
				res.render('activity');
			});
		});
	});
});

app.get('/viewpayment', restrict, function(req, res){
	res.locals.section = '4';
	res.locals.title = 'Activity';

	var payment;
	real_time_payments.getPayment(req.query.paymentID, req.query.status, req.session.user, function(err, payment) {
		req.session.user.payment = payment;
		if(payment) {
		  res.render('viewpayment');
		} else {
		   res.redirect('activity');
		}
	});
});

app.get('/viewpaymentrequest', restrict, function(req, res){
	res.locals.section = '4';
	res.locals.title = 'Activity';

	real_time_payments.listTokensUsingCXCTokens(req.session.user.id, function(err, myTokens) {
		res.locals.user.tokens = myTokens;
		var paymentrequest;
		real_time_payments.getPaymentRequest(req.query.paymentRequestID, req.session.user.id, function(err, paymentrequest) {
		   req.session.user.paymentrequest = paymentrequest;
		   if(paymentrequest) {
			  res.render('viewpaymentrequest');
		   } else {
			   res.redirect('activity');
		   }
		});
	});
});

app.get('/register', function(req, res){
	res.locals.title = 'Register';
	res.render('register');
});

app.post('/register', function(req, res){
	if( !req.body.username || !req.body.password || !req.body.fname || !req.body.lname ||
		!req.body.username.isAlphaNumeric() || !req.body.fname.isAlphaNumeric() || !req.body.lname.isAlphaNumeric() ) {
		req.session.error = 'Please specify an alpha numeric username, first and last name, and a password too.';
		res.redirect('register');
	} else {
		var id = makeUniqueUsername(req.body.username);
		real_time_payments.lookupCXCParticipant(id, function(err, cXcUser)	{
		if(cXcUser) {
			real_time_payments.lookupDDACustomer(id, function(err, user) {
				if(user) {
					req.session.error = user.username + ' is already registered.';
					res.redirect('login');
				} else {
					registerAndRedirect(req, res, cXcUser);
				}
			});
		} else {
			registerAndRedirect(req, res, null);
		}
	});
	}
});

app.get('/logout', function(req, res){
	// destroy the user's session to log them out will be re-created next request
	req.session.destroy(function(){
		res.redirect('/login');
	});
});

app.get('/login', function(req, res){
	console.log(req.connection.remoteAddress);
	res.locals.title = 'Login';
	res.render('login');
});

app.post('/login', function(req, res){
	real_time_payments.authenticate(req.body.username, req.body.password, function(err, user){
		loginRedirect(req, res, user);
	});
});

module.exports = app;
