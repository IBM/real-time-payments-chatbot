# Real-Time Payments with Chatbot

In this code pattern, we will use IBM Cloud services to create a Node.js web application which sends and requests payments using a chatbot. The Real-Time Payments service is used to manage tokens and recipients, and to initiate payments and payment requests.  The Watson Assistant service will be used to create a dialog for the chatbot, which will process user's requests. The Natural Language Understanding service will enhance the chatbot capabilities to identify entities

When the reader has completed this pattern, he or she will understand how to:
  * Create a chatbot dialog with Watson Assistant and Natural Language Understanding
  * Setup Real-Time Payments service to manage users, tokens and recipients
  * Initiate payments, and view transaction activity


# Architecture

[Add architecture]
[Add steps]

## Prerequisites
You will need the following accounts and tools:
* [IBM Cloud account](https://console.ng.bluemix.net/registration/)
* [IBM Cloud CLI](https://console.bluemix.net/docs/cli/reference/bluemix_cli/index.html#getting-started)


## Included Components

+ [Real-Time Payment](https://console.ng.bluemix.net/catalog/services/real-time-payments-service)
* [IBM Watson Assistant](https://www.ibm.com/watson/developercloud/conversation.html)
* [IBM Watson Natural Language Understanding](https://www.ibm.com/watson/developercloud/natural-language-understanding.html)

## Featured Technology

* [Node.js](https://nodejs.org/)


# Deploy to IBM Cloud

[![Deploy to IBM Cloud](https://bluemix.net/deploy/button.png)](https://bluemix.net/deploy?repository=https://github.com/IBM/real-time-payments-chatbot)

[steps]

# Run the Application Locally
Follow these steps to setup and run this code pattern. The steps are described in detail below.

### Prerequisite
- [node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)

## Steps
1. [Clone the repo](#1-clone-the-repo)
2. [Create IBM Cloud services](#2-create-ibm-cloud-services)
3. [Configure Watson Assistant](#3-configure-watson-assistant)
4. [Configure .env file](#4-configure-env-file)
5. [Run the application](#5-run-the-application)
6. [Deploy to IBM Cloud using CLI](#6-deploy-to-ibm-cloud-using-cli)

[steps in detail]


# Troubleshooting

* To troubleshoot your IBM Cloud application, use the logs. To see the logs, run:

```bash
cf logs <application-name> --recent
```


# License

[Apache 2.0](LICENSE)
