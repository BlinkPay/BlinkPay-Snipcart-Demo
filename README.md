# My Cake Shop - BlinkPay Snipcart Demo

Welcome to the **Astro Cake Shop** demo project, showcasing how to integrate **Snipcart** for e-commerce functionality with the **BlinkPay** payment gateway. This project is built using Astro, Tailwind CSS, and deployed via Netlify, leveraging serverless Netlify Functions to handle the backend logic.

See the live site: [BlinkPay Snipcart Demo](https://blinkpay-snipcart-demo.netlify.app)

## Tools

- **Astro**: A modern web framework to build fast and optimised websites.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Netlify Functions**: Serverless functions to handle backend logic.
- **Snipcart**: A flexible e-commerce platform for seamless shopping cart integration.
- **BlinkPay**: A secure payment gateway to process payments.

## Getting Started

### Prerequisites

Ensure you have the following tools installed:

- [Node.js](https://nodejs.org/en/)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (for local development and deployment)
- [Snipcart Account](https://snipcart.com/) (to manage your e-commerce)
- [BlinkPay Account](https://blinkpay.co.nz/) (to process payments)

## Installation

### Clone the Repository:

```bash
git clone https://github.com/BlinkPay/BlinkPay-Snipcart-Demo
cd BlinkPay-Snipcart-Demo
```

### Set Up

First, you will need to have free accounts with [Netlify](https://www.netlify.com), [Snipcart](https://snipcart.com/) and [BlinkPay](https://www.blinkpay.co.nz/).

## Install Dependencies

First, install the modules:

```bash
npm install
```

## Netlify Configuration

Create a site in Netlify.

One way to do this is to fork this demo repository into a new GitHub repository, and create your Netlify site based on this new repository.

Otherwise, the default set up settings should work for now. We will add environment variables later.

You can now set up netlify locally:

```bash
npx netlify init
```

And follow the instructions from the CLI.

## BlinkPay Configuration

You will need to set up your Redirect URL and retrieve your access key and secret from the BlinkPay Merchant Portal: https://merchants.blinkpay.co.nz/settings/api

Once you are logged in:

1. Navigate to your Sandbox app (under Settings/API)
2. Add a URL to your whitelist redirect URLs for your Netlify app name, e.g. `https://YOUR-SITE-NAME.netlify.app/`and click save
3. Copy the API key shown for your `.env` file as described below
4. Click `Rotate Secret` - your new API secret will display. Copy this for your `.env` file too

## Snipcart configuration

First, set up your domain

1. Head to your Snipcart dashboard and navigate to `Store Configurations`/`Domains & URLs`
2. Enter your domain name e.g. `YOUR-SITE-NAME.netlify.app`
3. Click `Save`

Then, you will need to set your region and currency in SnipCart:

1. Head to your Snipcart dashboard and navigate to `Store Configurations`/`Regional Settings`
2. Select `NZD`as your currency
3. Configure your store time zone and supported countries
4. Click `Save`

Now, retrieve your public cart key

1. Head to your Snipcart dashboard and navigate to `Store Configurations`/`Payment Gateway`
2. Copy your Snipcart API Key for your `.env` variables as described below

You will then need to configure Snipcart Custom Payment Gateway in your Snipcart dashboard. To do this:

1. Head to your Snipcart dashboard and navigate to `Store Configurations`/`Account`/`API Keys`
2. Toggle `Custom Payment Gateway` to `ON` and hit `Configure`
3. Enter your netlify function URL for payment method under `Payment Methods API URL`. In this project, this likely to be `https://YOUR-SITE-NAME.netlify.app/.netlify/functions/payment-method`
4. Copy your Snipcart Gateway API Key for your `.env` variables as described below

## Setting up `.env`

Now you are ready to create a `.env` file at the root of your project.

Note that your Blinkpay Debit URL depends if you are working in a sandbox or production environment. Use:

- For Non-production, use: `https://sandbox.debit.blinkpay.co.nz`
- For production, use: `https://debit.blinkpay.co.nz`

Add the following environment variables:

```
PUBLIC_BUSINESS_NAME=<your_business_name>

BLINKPAY_DEBIT_URL=<blinkpay_environment_url>
BLINKPAY_CLIENT_ID=<your_blinkpay_client_id>
BLINKPAY_CLIENT_SECRET=<your_blinkpay_secret>

PUBLIC_SNIPCART_API_KEY=<your_snipcart_public_api_key>
SNIPCART_GATEWAY_API_KEY=<your_snipcart_custom_gateway_api_key>
```

## Netlify Environment Variables

Now that you have these variables collected, copy these same variables into Netlify under your `Site Configuration`/`Variables` and click `Add a variable`. You can then add the variables by copying the contents of your `.env` file.

## Initial Netlify Deployment

Before you will able to develop your store locally, you will first need to run a production netlify deploy. This is because Snipcart will be accessing our `/.netlify/functions/payment-method` endpoint from the hosted netlify site, even if you are only running the application locally.

```bash
npm run netlify-deploy-prod
```

## Snipcart Initial Crawl

To develop locally, you will initially need Snipcart to crawl the web site for your products. To do this:

1. Head to your Snipcart dashboard and navigate to `Products`
2. Click `Fetch them here`
3. Enter your live Netlify site URL e.g. `https://YOUR-SITE-NAME.netlify.app` and click `Fetch from URL`

Your products should then be populated.

## Run and Deploy

### Running the Application

To run the application locally, including netlify functions:

```bash
npm run netlify-dev
```

### Deployment

To build and deploy the project to your Netlify development environment:

```bash
npm run netlify-deploy-dev
```

To build and deploy the project to your Netlify production environment:

```bash
npm run netlify-deploy-prod
```

## Contributions

We welcome contributions from the community! Whether you're fixing bugs, improving documentation, or adding new features, we'd love to have you contribute. Please submit your pull requests, and our team will review them.

## License

This project is licensed under the MIT License. Feel free to use and modify the code in this repository. See the LICENSE file for more details.
