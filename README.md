# Astro Cake Shop - BlinkPay Snipcart Demo

Welcome to the **Astro Cake Shop** demo project, showcasing how to integrate **Snipcart** for e-commerce functionality with the **BlinkPay** payment gateway. This project is built using Astro, Tailwind CSS, and deployed via Netlify, leveraging serverless Netlify functions to handle the backend logic.

---

## Tools

- **Astro**: A modern web framework to build fast and optimised websites.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Netlify Functions**: Serverless functions to handle backend logic.
- **Snipcart**: A flexible e-commerce platform for seamless shopping cart integration.
- **BlinkPay**: A secure payment gateway to process payments.

---

## Getting Started

### Prerequisites

Ensure you have the following tools installed:

- [Node.js](https://nodejs.org/en/)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (for local development and deployment)
- [Snipcart Account](https://snipcart.com/) (to manage your e-commerce)
- [BlinkPay Account](https://blinkpay.co.nz/) (to process payments)

## Installation

### Clone the repository:

```bash
git clone https://github.com/yourusername/astro-cake-shop.git
cd astro-cake-shop
```

### Set Up

First, set up environment variables:

Create a `.env` file at the root of your project and add the following environment variables:

```bash
PUBLIC_BUSINESS_NAME=<your_business_name>

BLINKPAY_DEBIT_URL=<blinkpay_environment_url>
BLINKPAY_CLIENT_ID=<your_blinkpay_client_id>
BLINKPAY_CLIENT_SECRET=<your_blinkpay_secret>

PUBLIC_SNIPCART_API_KEY=<your_snipcart_public_api_key>
SNIPCART_GATEWAY_API_KEY=<your_snipcart_custom_gateway_api_key>
```

Install the modules and run the netlify set-up
```bash
npm install
npx netlify init 
```
## Run and Deploy

### Running the Application

To run the application locally, including netlify functions:

```bash
npm run netlify-dev
```

### Deployment

To build and deploy the project to production:

```bash
npm run netlify-deploy-dev
```

To build and deploy the project to production:

```bash
npm run netlify-deploy-prod
```

## Contributions

We welcome contributions from the community! Whether you're fixing bugs, improving documentation, or adding new features, we'd love to have you contribute. Please submit your pull requests, and our team will review them.

## License

This project is licensed under the MIT License. Feel free to use and modify the code in this repository. See the LICENSE file for more details.
