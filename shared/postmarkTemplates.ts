// Postmark template designs with variable mappings
export const POSTMARK_TEMPLATES = {
  'postmark-invoice': {
    name: 'Invoice/Statement',
    description: 'Professional invoice layout with payment button',
    thumbnail: '📄',
    html: `
{{COMPANY_LOGO}}
<h1>{{CUSTOM_GREETING}}</h1>
<p>{{CUSTOM_MESSAGE}}</p>
<table class="attribute-list" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="attribute-list-container">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="attribute-list-item"><strong>{{ACCOUNT_LABEL}}</strong> {{accountNumber}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{CREDITOR_LABEL}}</strong> {{creditor}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{BALANCE_LABEL}}</strong> {{balance}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{DUE_DATE_LABEL}}</strong> {{dueDate}}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<!-- Action -->
<table class="body-action" align="center" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <!-- Border based button https://litmus.com/blog/a-guide-to-bulletproof-buttons-in-email-design -->
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td>
                  <a href="{{CUSTOM_BUTTON_URL}}" class="button button--green" target="_blank">{{CUSTOM_BUTTON_TEXT}}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p>{{CUSTOM_CLOSING_MESSAGE}}</p>
<p>{{CUSTOM_SIGNOFF}}</p>
<!-- Sub copy -->
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
  /* Base */
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
  
  .attribute-list {
    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
    margin: 0 0 21px;
  }
  
  .attribute-list-container {
    background-color: #F4F4F7;
    padding: 16px;
  }
  
  .attribute-list-item {
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
    border-top: 1px solid #EAEAEC;
    border-bottom: 1px solid #EAEAEC;
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
    border-bottom: 1px solid #EAEAEC;
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
    description: 'Clean welcome message with call-to-action',
    thumbnail: '👋',
    html: `
{{COMPANY_LOGO}}
<h1>{{CUSTOM_GREETING}}</h1>
<p>{{CUSTOM_MESSAGE}}</p>
<p>Your account details:</p>
<table class="attribute-list" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="attribute-list-container">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="attribute-list-item"><strong>{{ACCOUNT_LABEL}}</strong> {{accountNumber}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{BALANCE_LABEL}}</strong> {{balance}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{CREDITOR_LABEL}}</strong> {{creditor}}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<table class="body-action" align="center" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td>
                  <a href="{{CUSTOM_BUTTON_URL}}" class="button button--green" target="_blank">{{CUSTOM_BUTTON_TEXT}}</a>
                </td>
              </tr>
            </table>
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
  
  .attribute-list {
    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
    margin: 0 0 21px;
  }
  
  .attribute-list-container {
    background-color: #F4F4F7;
    padding: 16px;
  }
  
  .attribute-list-item {
    padding: 8px 0;
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
    description: 'Account portal access notification with action button',
    thumbnail: '🔑',
    html: `
{{COMPANY_LOGO}}
<h1>{{CUSTOM_GREETING}}</h1>
<p>{{CUSTOM_MESSAGE}}</p>
<!-- Action -->
<table class="body-action" align="center" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <!-- Border based button https://litmus.com/blog/a-guide-to-bulletproof-buttons-in-email-design -->
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td>
                  <a href="{{CUSTOM_BUTTON_URL}}" class="button button--green" target="_blank">{{CUSTOM_BUTTON_TEXT}}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p>Your account information:</p>
<table class="attribute-list" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="attribute-list-container">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="attribute-list-item"><strong>{{ACCOUNT_LABEL}}</strong> {{accountNumber}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{BALANCE_LABEL}}</strong> {{balance}}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<p>{{CUSTOM_CLOSING_MESSAGE}}</p>
<p>{{CUSTOM_SIGNOFF}}</p>
<!-- Sub copy -->
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
  
  .attribute-list {
    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
    margin: 0 0 21px;
  }
  
  .attribute-list-container {
    background-color: #F4F4F7;
    padding: 16px;
  }
  
  .attribute-list-item {
    padding: 8px 0;
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
    description: 'Friendly payment reminder with action button',
    thumbnail: '⏰',
    html: `
{{COMPANY_LOGO}}
<h1>{{CUSTOM_GREETING}}</h1>
<p>{{CUSTOM_MESSAGE}}</p>
<table class="attribute-list" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="attribute-list-container">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="attribute-list-item"><strong>{{ACCOUNT_LABEL}}</strong> {{accountNumber}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{CREDITOR_LABEL}}</strong> {{creditor}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{BALANCE_LABEL}}</strong> {{balance}}</td>
        </tr>
        <tr>
          <td class="attribute-list-item"><strong>{{DUE_DATE_LABEL}}</strong> {{dueDate}}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<table class="body-action" align="center" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td>
                  <a href="{{CUSTOM_BUTTON_URL}}" class="button button--green" target="_blank">{{CUSTOM_BUTTON_TEXT}}</a>
                </td>
              </tr>
            </table>
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
  
  .attribute-list {
    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
    margin: 0 0 21px;
  }
  
  .attribute-list-container {
    background-color: #F4F4F7;
    padding: 16px;
  }
  
  .attribute-list-item {
    padding: 8px 0;
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
  { label: "Due Date", value: "{{dueDate}}", category: "account" },
  { label: "Consumer Portal Link", value: "{{consumerPortalLink}}", category: "links" },
  { label: "App Download Link", value: "{{appDownloadLink}}", category: "links" },
  { label: "Agency Name", value: "{{agencyName}}", category: "agency" },
] as const;
