# Tenant-specific landing pages

The normal agency landing page is configured in **Settings → Branding**. When an
organization needs a completely different layout, a developer can build a React
page specifically for that tenant without changing the experience for everyone
else.

## Add a custom page

1. Create a component in this directory, for example
   `first-church-landing.tsx`.
2. Accept `CustomLandingPageProps`. The component receives the tenant's branding
   data plus safe callbacks for signing in and creating an account.
3. Import the component in `index.ts` and register it using the tenant's exact
   slug:

   ```tsx
   import FirstChurchLanding from "./first-church-landing";

   const customLandingPages = {
     "first-church": FirstChurchLanding,
   };
   ```

The public route and branding API stay the same. Only the registered tenant sees
the custom component. Removing the registry entry immediately restores the
standard built-in landing page.

## Church and nonprofit donations

This does **not** create a second church/nonprofit module or organization
structure. It reuses the existing `nonprofit_organization` business type and its
donor, donation, campaign, and giving-record terminology. The landing-page code
only adds another public entry point into that existing tenant structure.

Donation checkout and donor registration are separate actions. Configure the
tenant as `nonprofit_organization` and set its **Guest Donation Checkout URL** in
Settings. The built-in page then shows **Donate now**, which opens the church's
hosted payment checkout without a Chain sign-in. Registration remains available
for donors who want giving history, receipts, saved preferences, or ongoing
communications.

A custom church page receives an optional `onDonate` callback alongside
`onSignIn` and `onCreateAccount`. Only render the donation action when that
callback is present. Payment-card information should stay in the configured
PCI-compliant checkout rather than being collected by a custom React component.

Do not render tenant-provided JavaScript or raw HTML. Custom pages should be
reviewed React components committed with the rest of the application so they
receive normal code review, testing, and security updates.
