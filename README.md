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

### Installation

**Clone the repository:**

```bash
git clone https://github.com/yourusername/astro-cake-shop.git
cd astro-cake-shop
```

**Install dependencies:**

```bash
npm install
```

Set up environment variables:

Create a .env file at the root of your project and add the following environment variables:

```bash
PUBLIC_BUSINESS_NAME=<your_business_name>

BLINKPAY_DEBIT_URL=<blinkpay_environment_url>
BLINKPAY_CLIENT_ID=<your_blinkpay_client_id>
BLINKPAY_CLIENT_SECRET=<your_blinkpay_secret>

PUBLIC_SNIPCART_API_KEY=<your_snipcart_public_api_key>
SNIPCART_GATEWAY_API_KEY=<your_snipcart_custom_gateway_api_key>
```

Running the Application
To run the application locally:

bash
npm run dev
Visit http://localhost:3000 to view the demo.

Build for Production
To build and deploy the project:

```bash
npm run build
netlify deploy --prod
```

This command will build the project and deploy it to your Netlify site.

BlinkPay Integration
The integration with BlinkPay uses the blink-debit-api-client-node package to handle the payment process. Here's a brief example of how to process a payment using BlinkPay in a Netlify function:

```typescript
import { BlinkPayApi } from "blink-debit-api-client-node";

export async function handler(event) {
  const blinkpay = new BlinkPayApi({
    clientId: process.env.BLINKPAY_CLIENT_ID,
    clientSecret: process.env.BLINKPAY_SECRET,
  });

  const paymentData = JSON.parse(event.body);

  try {
    const response = await blinkpay.createPayment({
      amount: paymentData.amount,
      currency: "NZD",
      reference: paymentData.reference,
      callbackUrl: process.env.BLINKPAY_CALLBACK_URL,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
```

This function processes payments by sending the necessary data to the BlinkPay API and returning the result to the frontend.

Snipcart Setup
Snipcart is used to handle the shopping cart on the front-end. In your HTML or Astro component, include the following:

```html
<div id="snipcart" data-api-key="<your_snipcart_api_key>" hidden></div>

<button
  class="snipcart-add-item"
  data-item-id="cake-123"
  data-item-name="Delicious Chocolate Cake"
  data-item-price="19.99"
  data-item-url="/cakes/delicious-chocolate-cake"
  data-item-description="A mouth-watering chocolate cake that melts in your mouth."
>
  Add to Cart
</button>
```

The data-api-key will connect Snipcart to your Snipcart account, and the button allows users to add products to their cart.

## Contributions

We welcome contributions from the community! Whether you're fixing bugs, improving documentation, or adding new features, we'd love to have you contribute. Please submit your pull requests, and our team will review them.

## License

This project is licensed under the MIT License. Feel free to use and modify the code in this repository. See the LICENSE file for more details.
