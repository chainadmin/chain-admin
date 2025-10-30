# Template Variables Documentation

This document lists all available variables you can use in email and SMS templates. Variables are used by placing them in double curly braces, like `{{firstName}}`.

## Standard Consumer Fields

These fields come from the consumer's profile:

- `{{firstName}}` - Consumer's first name
- `{{lastName}}` - Consumer's last name
- `{{fullName}}` - Consumer's full name (first + last)
- `{{consumerName}}` - Same as fullName
- `{{email}}` - Consumer's email address
- `{{phone}}` - Consumer's phone number
- `{{consumerId}}` - Unique consumer ID
- `{{address}}` or `{{consumerAddress}}` - Street address
- `{{city}}` or `{{consumerCity}}` - City
- `{{state}}` or `{{consumerState}}` - State
- `{{zip}}` or `{{zipCode}}` - ZIP code
- `{{fullAddress}}` or `{{consumerFullAddress}}` - Complete formatted address

## Standard Account Fields

These fields come from the consumer's account:

- `{{accountId}}` - Unique account ID
- `{{accountNumber}}` - Account number
- `{{fileNumber}}` or `{{filenumber}}` - File number (required for SMAX integration)
- `{{creditor}}` - Name of the creditor
- `{{balance}}` - Formatted balance (e.g., "$1,234.56")
- `{{balence}}` - Alternative spelling (same as balance)
- `{{balanceCents}}` - Balance in cents (e.g., "123456")
- `{{dueDate}}` - Formatted due date (e.g., "12/31/2023")
- `{{dueDateIso}}` - ISO format due date (e.g., "2023-12-31")

## Settlement Offer Variables

Pre-calculated percentage amounts for settlement offers:

- `{{balance50%}}` - 50% of the balance
- `{{balance60%}}` - 60% of the balance
- `{{balance70%}}` - 70% of the balance
- `{{balance80%}}` - 80% of the balance
- `{{balance90%}}` - 90% of the balance
- `{{balance100%}}` - Full balance (same as {{balance}})

## Agency Information

Information about your agency/company:

- `{{agencyName}}` - Your company name
- `{{agencyEmail}}` - Your contact email
- `{{agencyPhone}}` - Your contact phone number
- `{{COMPANY_LOGO}}` - Your company logo (displays as an image)

## Portal and App Links

URLs for consumer portals and downloads:

- `{{consumerPortalLink}}` - Link to consumer portal
- `{{appDownloadLink}}` - Link to mobile app download page
- `{{unsubscribeLink}}` or `{{unsubscribeUrl}}` - Unsubscribe link
- `{{unsubscribeButton}}` - Formatted unsubscribe button (HTML)

## Date Variables

- `{{todays date}}` - Today's date formatted

## Custom CSV Fields (Additional Data)

**This is the most powerful feature!**

When you import a CSV file, any columns that aren't standard fields (like firstName, email, balance, etc.) are automatically stored and made available as variables.

### How It Works

1. **Import your CSV** with any custom columns
2. **Use those column names as variables** in your templates

### Examples

If your CSV has these columns:
- `payment_status`
- `original_creditor`
- `last_contact_date`
- `account_type`
- `settlement_offer_amount`
- `notes`

You can use them in templates like this:

**Email Example:**
```
Subject: Update on your {{original_creditor}} account

Dear {{firstName}},

Your account status is currently: {{payment_status}}

Account Type: {{account_type}}
Last Contact: {{last_contact_date}}

We're offering a settlement of {{settlement_offer_amount}} on this account.

Notes: {{notes}}

Best regards,
{{agencyName}}
```

**SMS Example:**
```
Hi {{firstName}}, your {{original_creditor}} account ({{payment_status}}) has a settlement offer of {{settlement_offer_amount}}. Reply YES to accept. -{{agencyName}}
```

### Consumer vs Account Custom Fields

- **Consumer custom fields** - Any non-standard columns that apply to the person (e.g., `preferred_language`, `time_zone`, `referral_source`)
- **Account custom fields** - Any non-standard columns that apply to the debt (e.g., `original_creditor`, `charge_off_date`, `account_type`)

Both types are automatically available as variables!

### Important Notes

1. **Column names become variable names** - A CSV column named `payment_plan_type` becomes `{{payment_plan_type}}`
2. **Case-sensitive** - Try to match the exact case of your CSV column names
3. **Spaces and special characters** - Column names with spaces or special characters should work, but it's best to use underscores (e.g., `payment_status` instead of `payment status`)
4. **Empty values** - If a field is empty for a consumer, the variable will be replaced with an empty string

## Usage Examples

### Basic Email Template
```html
<h2>Hello {{firstName}},</h2>

<p>This is a reminder about your account with {{creditor}}.</p>

<p>
  <strong>Account Number:</strong> {{accountNumber}}<br>
  <strong>Current Balance:</strong> {{balance}}<br>
  <strong>Due Date:</strong> {{dueDate}}
</p>

<p>You can make a payment through our portal:</p>
<a href="{{consumerPortalLink}}">Pay Now</a>

<p>Thank you,<br>{{agencyName}}</p>

{{unsubscribeButton}}
```

### Basic SMS Template
```
Hi {{firstName}}, your {{creditor}} account #{{accountNumber}} has a balance of {{balance}}. Pay now: {{consumerPortalLink}} -{{agencyName}}
```

### Using Custom CSV Fields
```
Hi {{firstName}}, 

Your {{account_type}} account with {{original_creditor}} is currently {{payment_status}}.

We can settle for {{settlement_offer_amount}} - that's {{balance60%}} of your {{balance}} balance!

{{custom_notes}}

-{{agencyName}}
```

## Tips for Success

1. **Test with sample data** - Send test emails/SMS to yourself first
2. **Check for empty fields** - Make sure important fields have data in your CSV
3. **Use fallbacks in text** - Instead of "Your balance is {{balance}}", consider "Balance: {{balance}}" so empty values aren't jarring
4. **Preview before sending** - The campaign preview will show you how variables are replaced
