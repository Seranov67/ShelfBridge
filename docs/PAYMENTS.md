# Demo payments

The public ShelfBridge prototype has simulated books, prices and stock. Its
payment demonstration does not connect to a bank, charge money or create a real
order. It needs no merchant account, API keys or Vercel environment variables.
Qloo-only ranking and the six MCP tools are unchanged.

## Try it

1. Confirm tastes and generate recommendations as usual.
2. Choose a book to open its gift card.
3. Click **Try demo checkout**. Review the selected title, SKU and demo total.
4. Click **Simulate declined payment**, then **Retry: simulate successful payment**.
5. The success message explicitly confirms that no money was charged and no
   purchase or reservation was made.

You can cancel and return to the card. Success cannot be submitted twice while
that card remains open. Closing the card or reloading clears the simulation;
there is no saved order history. Test references begin with `DEMO-` and are
generated only in the browser. Payment controls make no network requests, collect
no card, contact or delivery data, and do not change stock or recommendations.
They are excluded from the printed gift card.

This is a UI simulation, **not** a bank or payment-provider sandbox. Do not use its
success message as proof of payment or fulfillment. MCP `gift_card` still only
creates gift text; it cannot pay or reserve anything.

## If real payments are added later

Choose the provider based on the seller's country. For a Ukrainian merchant,
[LiqPay registration](https://www.liqpay.ua/information/instructions/registration)
describes merchant activation, an IBAN for a sole proprietor or legal entity,
test keys during setup and live keys after activation. Its
[Checkout API](https://www.liqpay.ua/doc/api/internet_acquiring/checkout) provides
a hosted payment page and server-to-server status callbacks.

A production integration also needs real catalog prices and currency, confirmed
stock, server-created orders, delivery or fulfillment details, signed and
idempotent callback processing, and a durable order database. The server must
validate the amount, currency, order and final payment status; a browser redirect
alone cannot mark an order paid. Keep payment credentials only in server-side
environment variables and collect card details through the provider's page.

Real commercial use also requires a suitable hosting plan: Vercel's
[fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines) restrict
Hobby to personal, noncommercial use and require Pro or Enterprise for commercial
deployments. No paid plan upgrade or real payment connection is performed by this
demo feature.
