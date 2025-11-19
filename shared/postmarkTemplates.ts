// Postmark template designs with variable mappings
export const POSTMARK_TEMPLATES = {
  'postmark-invoice': {
    name: 'Invoice/Statement',
    description: 'Professional invoice layout with account details table',
    thumbnail: '📄',
    html: `
{{COMPANY_LOGO}}
<h1>{{CUSTOM_GREETING}}</h1>
<p>{{CUSTOM_MESSAGE}}</p>
<table class="attributes" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="attributes_content">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="attributes_item">
            <strong>Amount Due:</strong> {{balance}}
          </td>
        </tr>
        <tr>
          <td class="attributes_item">
            <strong>Account Number:</strong> {{accountNumber}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
{{ACCOUNT_SUMMARY_BLOCK}}
<table class="purchase" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      <h3>Account Statement</h3>
    </td>
    <td>
      <h3 class="align-right">{{date}}</h3>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <table class="purchase_content" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <th class="purchase_heading" align="left">
            <p>Description</p>
          </th>
          <th class="purchase_heading" align="right">
            <p>Amount</p>
          </th>
        </tr>
        <tr>
          <td width="80%" class="purchase_item">Original Balance - {{creditor}}</td>
          <td width="20%" class="purchase_item align-right">{{balance}}</td>
        </tr>
        <tr>
          <td width="80%" class="purchase_footer" valign="middle">
            <p class="purchase_total purchase_total--label">Total Balance</p>
          </td>
          <td width="20%" class="purchase_footer" valign="middle">
            <p class="purchase_total">{{balance}}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p>{{CUSTOM_CLOSING_MESSAGE}}</p>
<p>{{CUSTOM_SIGNOFF}}</p>
<table class="body-sub">
  <tr>
    <td>
      <p class="sub">If you're having trouble with the button above, copy and paste the URL below into your web browser.</p>
      <p class="sub">{{consumerPortalLink}}</p>
    </td>
  </tr>
</table>`,
    styles: `
<style>
  body {
    width: 100% !important;
    height: 100%;
    margin: 0;
    -webkit-text-size-adjust: none;
  }
  
  a {
    color: #3869D4;
  }
  
  a img {
    border: none;
  }
  
  td {
    word-break: break-word;
  }
  
  h1 {
    margin-top: 0;
    color: #333333;
    font-size: 22px;
    font-weight: bold;
    text-align: left;
  }
  
  h3 {
    margin-top: 0;
    color: #333333;
    font-size: 14px;
    font-weight: bold;
    text-align: left;
  }
  
  p {
    margin: .4em 0 1.1875em;
    font-size: 16px;
    line-height: 1.625;
    color: #51545E;
  }
  
  .button {
    background-color: #3869D4;
    border-top: 10px solid #3869D4;
    border-right: 18px solid #3869D4;
    border-bottom: 10px solid #3869D4;
    border-left: 18px solid #3869D4;
    display: inline-block;
    color: #FFF;
    text-decoration: none;
    border-radius: 3px;
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.16);
    -webkit-text-size-adjust: none;
    box-sizing: border-box;
  }
  
  .button--green {
    background-color: #22BC66;
    border-top: 10px solid #22BC66;
    border-right: 18px solid #22BC66;
    border-bottom: 10px solid #22BC66;
    border-left: 18px solid #22BC66;
  }
  
  .attributes {
    margin: 0 0 21px;
  }
  
  .attributes_content {
    background-color: #F4F4F7;
    padding: 16px;
  }
  
  .attributes_item {
    padding: 0;
  }
  
  .body-action {
    width: 100%;
    margin: 30px auto;
    padding: 0;
    text-align: center;
  }
  
  .purchase {
    width: 100%;
    margin: 0;
    padding: 35px 0;
  }
  
  .purchase_content {
    width: 100%;
    margin: 0;
    padding: 25px 0 0 0;
  }
  
  .purchase_heading {
    padding-bottom: 8px;
    border-bottom: 1px solid #EAEAEC;
  }
  
  .purchase_heading p {
    margin: 0;
    color: #85878E;
    font-size: 12px;
  }
  
  .purchase_item {
    padding: 10px 0;
    color: #51545E;
    font-size: 15px;
    line-height: 18px;
  }
  
  .purchase_footer {
    padding-top: 15px;
    border-top: 1px solid #EAEAEC;
  }
  
  .purchase_total {
    margin: 0;
    text-align: right;
    font-weight: bold;
    color: #333333;
  }
  
  .purchase_total--label {
    padding: 0 15px 0 0;
  }
  
  .body-sub {
    margin-top: 25px;
    padding-top: 25px;
    border-top: 1px solid #EAEAEC;
  }
  
  .sub {
    color: #6B6E76;
    font-size: 13px;
  }
  
  .align-right {
    text-align: right;
  }
</style>`
  },
  
  'postmark-welcome': {
    name: 'Welcome Message',
    description: 'Welcome message with portal information and action button',
    thumbnail: '👋',
    html: `
{{COMPANY_LOGO}}
<h1>{{CUSTOM_GREETING}}</h1>
<p>{{CUSTOM_MESSAGE}}</p>
<table class="body-action" align="center" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="{{consumerPortalLink}}" class="button" target="_blank">Get Started</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p>For reference, here's your account information:</p>
<table class="attributes" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="attributes_content">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="attributes_item">
            <strong>Portal Link:</strong> {{consumerPortalLink}}
          </td>
        </tr>
        <tr>
          <td class="attributes_item">
            <strong>Account Number:</strong> {{accountNumber}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<table class="attributes" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="attributes_content">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="attributes_item">
            <strong>Current Balance:</strong> {{balance}}
          </td>
        </tr>
        <tr>
          <td class="attributes_item">
            <strong>Creditor:</strong> {{creditor}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p>{{CUSTOM_CLOSING_MESSAGE}}</p>
<p>{{CUSTOM_SIGNOFF}}</p>`,
    styles: `
<style>
  body {
    width: 100% !important;
    height: 100%;
    margin: 0;
    -webkit-text-size-adjust: none;
  }
  
  a {
    color: #3869D4;
  }
  
  a img {
    border: none;
  }
  
  td {
    word-break: break-word;
  }
  
  h1 {
    margin-top: 0;
    color: #333333;
    font-size: 22px;
    font-weight: bold;
    text-align: left;
  }
  
  p {
    margin: .4em 0 1.1875em;
    font-size: 16px;
    line-height: 1.625;
    color: #51545E;
  }
  
  .button {
    background-color: #3869D4;
    border-top: 10px solid #3869D4;
    border-right: 18px solid #3869D4;
    border-bottom: 10px solid #3869D4;
    border-left: 18px solid #3869D4;
    display: inline-block;
    color: #FFF;
    text-decoration: none;
    border-radius: 3px;
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.16);
    -webkit-text-size-adjust: none;
    box-sizing: border-box;
  }
  
  .button--green {
    background-color: #22BC66;
    border-top: 10px solid #22BC66;
    border-right: 18px solid #22BC66;
    border-bottom: 10px solid #22BC66;
    border-left: 18px solid #22BC66;
  }
  
  .attributes {
    margin: 0 0 21px;
  }
  
  .attributes_content {
    background-color: #F4F4F7;
    padding: 16px;
  }
  
  .attributes_item {
    padding: 0;
  }
  
  .body-action {
    width: 100%;
    margin: 30px auto;
    padding: 0;
    text-align: center;
  }
</style>`
  },
  
  'postmark-access': {
    name: 'Portal Access',
    description: 'Simple portal access notification with single action button',
    thumbnail: '🔑',
    html: `
{{COMPANY_LOGO}}
<h1>{{CUSTOM_GREETING}}</h1>
<p>{{CUSTOM_MESSAGE}}</p>
<table class="body-action" align="center" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="{{consumerPortalLink}}" class="button button--green" target="_blank">Access Portal</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p>{{CUSTOM_CLOSING_MESSAGE}}</p>
<p>{{CUSTOM_SIGNOFF}}</p>
<table class="body-sub">
  <tr>
    <td>
      <p class="sub">If you're having trouble with the button above, copy and paste the URL below into your web browser.</p>
      <p class="sub">{{consumerPortalLink}}</p>
    </td>
  </tr>
</table>`,
    styles: `
<style>
  body {
    width: 100% !important;
    height: 100%;
    margin: 0;
    -webkit-text-size-adjust: none;
  }
  
  a {
    color: #3869D4;
  }
  
  a img {
    border: none;
  }
  
  td {
    word-break: break-word;
  }
  
  h1 {
    margin-top: 0;
    color: #333333;
    font-size: 22px;
    font-weight: bold;
    text-align: left;
  }
  
  p {
    margin: .4em 0 1.1875em;
    font-size: 16px;
    line-height: 1.625;
    color: #51545E;
  }
  
  p.sub {
    font-size: 13px;
  }
  
  .button {
    background-color: #3869D4;
    border-top: 10px solid #3869D4;
    border-right: 18px solid #3869D4;
    border-bottom: 10px solid #3869D4;
    border-left: 18px solid #3869D4;
    display: inline-block;
    color: #FFF;
    text-decoration: none;
    border-radius: 3px;
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.16);
    -webkit-text-size-adjust: none;
    box-sizing: border-box;
  }
  
  .button--green {
    background-color: #22BC66;
    border-top: 10px solid #22BC66;
    border-right: 18px solid #22BC66;
    border-bottom: 10px solid #22BC66;
    border-left: 18px solid #22BC66;
  }
  
  .body-action {
    width: 100%;
    margin: 30px auto;
    padding: 0;
    text-align: center;
  }
  
  .body-sub {
    margin-top: 25px;
    padding-top: 25px;
    border-top: 1px solid #EAEAEC;
  }
  
  .sub {
    color: #6B6E76;
    font-size: 13px;
  }
</style>`
  },
  
  'postmark-reminder': {
    name: 'Payment Reminder',
    description: 'Payment reminder with balance highlight and action button',
    thumbnail: '⏰',
    html: `
{{COMPANY_LOGO}}
<h1>{{CUSTOM_GREETING}}</h1>
<p>{{CUSTOM_MESSAGE}}</p>
<table class="discount" align="center" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <h2 class="discount_heading">Balance Due</h2>
      <p class="discount_body"><strong>{{balance}}</strong> on Account #{{accountNumber}}</p>
    </td>
  </tr>
</table>
{{ACCOUNT_SUMMARY_BLOCK}}
<p>{{CUSTOM_CLOSING_MESSAGE}}</p>
<p>{{CUSTOM_SIGNOFF}}</p>
<table class="body-sub">
  <tr>
    <td>
      <p class="sub">If you're having trouble with the button above, copy and paste the URL below into your web browser.</p>
      <p class="sub">{{consumerPortalLink}}</p>
    </td>
  </tr>
</table>`,
    styles: `
<style>
  body {
    width: 100% !important;
    height: 100%;
    margin: 0;
    -webkit-text-size-adjust: none;
  }
  
  a {
    color: #3869D4;
  }
  
  a img {
    border: none;
  }
  
  td {
    word-break: break-word;
  }
  
  h1 {
    margin-top: 0;
    color: #333333;
    font-size: 22px;
    font-weight: bold;
    text-align: left;
  }
  
  h2 {
    margin-top: 0;
    color: #333333;
    font-size: 16px;
    font-weight: bold;
    text-align: center;
  }
  
  p {
    margin: .4em 0 1.1875em;
    font-size: 16px;
    line-height: 1.625;
    color: #51545E;
  }
  
  .discount {
    width: 100%;
    margin: 0;
    padding: 24px;
    background-color: #F4F4F7;
    border: 2px dashed #CBCCCF;
  }
  
  .discount_heading {
    text-align: center;
  }
  
  .discount_body {
    text-align: center;
    font-size: 15px;
  }
  
  .button {
    background-color: #3869D4;
    border-top: 10px solid #3869D4;
    border-right: 18px solid #3869D4;
    border-bottom: 10px solid #3869D4;
    border-left: 18px solid #3869D4;
    display: inline-block;
    color: #FFF;
    text-decoration: none;
    border-radius: 3px;
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.16);
    -webkit-text-size-adjust: none;
    box-sizing: border-box;
  }
  
  .button--green {
    background-color: #22BC66;
    border-top: 10px solid #22BC66;
    border-right: 18px solid #22BC66;
    border-bottom: 10px solid #22BC66;
    border-left: 18px solid #22BC66;
  }
  
  .attributes {
    margin: 0 0 21px;
  }
  
  .attributes_content {
    background-color: #F4F4F7;
    padding: 16px;
  }
  
  .attributes_item {
    padding: 0;
  }
  
  .body-action {
    width: 100%;
    margin: 30px auto;
    padding: 0;
    text-align: center;
  }
  
  .body-sub {
    margin-top: 25px;
    padding-top: 25px;
    border-top: 1px solid #EAEAEC;
  }
  
  .sub {
    color: #6B6E76;
    font-size: 13px;
  }
</style>`
  }
} as const;

export type PostmarkTemplateType = keyof typeof POSTMARK_TEMPLATES;

// Available template variables
export const TEMPLATE_VARIABLES = [
  { label: "First Name", value: "{{firstName}}", category: "consumer" },
  { label: "Last Name", value: "{{lastName}}", category: "consumer" },
  { label: "Full Name", value: "{{fullName}}", category: "consumer" },
  { label: "Email", value: "{{email}}", category: "consumer" },
  { label: "Phone", value: "{{phone}}", category: "consumer" },
  { label: "Account Number", value: "{{accountNumber}}", category: "account" },
  { label: "Creditor", value: "{{creditor}}", category: "account" },
  { label: "Balance", value: "{{balance}}", category: "account" },
  { label: "Balance 50%", value: "{{balance50%}}", category: "account" },
  { label: "Balance 60%", value: "{{balance60%}}", category: "account" },
  { label: "Balance 70%", value: "{{balance70%}}", category: "account" },
  { label: "Balance 80%", value: "{{balance80%}}", category: "account" },
  { label: "Balance 90%", value: "{{balance90%}}", category: "account" },
  { label: "Balance 100%", value: "{{balance100%}}", category: "account" },
  { label: "Due Date", value: "{{dueDate}}", category: "account" },
  { label: "Consumer Portal Link", value: "{{consumerPortalLink}}", category: "links" },
  { label: "App Download Link", value: "{{appDownloadLink}}", category: "links" },
  { label: "Agency Name", value: "{{agencyName}}", category: "agency" },
] as const;
