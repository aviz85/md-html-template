# JotForm to SendMsg Integration Guide

## Table of Contents
1. [Overview](#overview)
2. [JotForm Setup](#jotform-setup)
3. [Webhook Configuration](#webhook-configuration)
4. [Customization for Different Clients](#customization-for-different-clients)
5. [Troubleshooting](#troubleshooting)
6. [Testing](#testing)
7. [FAQ](#faq)

## Overview

The JotForm to SendMsg integration system enables automatic transfer of form data received in JotForm to the SendMsg email marketing system. The system receives data from JotForm via a webhook, extracts the relevant fields (name, email, phone, date of birth), and sends them to the SendMsg API in the appropriate format.

The system includes two main endpoints:
1. `/api/jotform-to-sendmsg` - General endpoint for all clients
2. `/api/sharoni` - Dedicated endpoint for the "Sharoni" client

## JotForm Setup

### Required Fields
For the integration to work properly, your JotForm form should include the following fields:

1. **Name** - Text field with a label such as "Full Name", "Name", etc.
2. **Email** - Email field with a label such as "Email", "Mail", etc.
3. **Phone** - Phone field with a label such as "Phone", "Mobile", "Cell", etc.
4. **Birth Date** (optional) - Date field with a label such as "Birth Date", "Birthday", etc.

### Hidden Field for Form ID (Recommended)
To customize the form for a specific client in SendMsg, it is recommended to add a hidden field to the JotForm:

1. In the JotForm form editor, click on "Add Form Element"
2. Select "Hidden Field" under the "Quick Tools" category
3. Set the field name to "sendmsg_form_id" or similar
4. Set the default value of the field to the unique SendMsg form ID (e.g., `338449__65661e0b-29e9-45ab-ad81-3470de641084`)

If no such hidden field is defined, the system will use a default form ID.

## Webhook Configuration

To connect your JotForm form to our endpoint:

1. Go to your form in JotForm and click on "Settings" at the top
2. Select "Integrations" in the side menu
3. Search for "WebHooks" and click on it
4. In the "WebHook URL" field, enter the appropriate endpoint address:
   - For Sharoni client: `https://[your-domain]/api/sharoni`
   - For other clients: `https://[your-domain]/api/jotform-to-sendmsg`
5. Click on "Complete Integration"

## Customization for Different Clients

There are two options to customize the integration for different clients:

### Option 1: Hidden Field in JotForm (Recommended)
As explained above, add a hidden field with the SendMsg form ID. This is the recommended method because:
- You use the same endpoint for all clients
- It's easy to change the form ID without changing code
- No need to create additional endpoints for each client

### Option 2: Dedicated Endpoint
To create a new endpoint for a specific client:
1. Copy the file `src/app/api/sharoni/route.ts` to a new directory with the client's name
2. Edit the new file and change:
   - Log tags (from `[Sharoni API]` to `[Client Name API]`)
   - SendMsg form ID in the line `sendMsgPayload.append('form', '...')`

## Troubleshooting

### Checking Logs
When a problem occurs, you can check the logs in Vercel:
1. Go to the Vercel dashboard
2. Select your project
3. Click on "Deployments" and select the latest deployment
4. Click on "Functions" and then on the relevant function
5. Check the logs to identify possible issues

### Common Issues

1. **No data received from JotForm**
   - Make sure the webhook is correctly configured in JotForm
   - Check logs for parsing errors
   
2. **Missing or incorrect data sent to SendMsg**
   - Make sure the fields in the JotForm form contain the strings in the field names that the system is looking for
   - Check if the fields use different names than what the system is looking for

3. **Date format issues**
   - The system tries to convert dates to the required format (DD-MM-YYYY)
   - If the date is in a format that cannot be parsed, adjust the format in the JotForm form

## Testing

You can test the integration using the included test scripts:

### Testing the General Integration
```bash
# Testing in local development environment
./test-jotform-to-sendmsg.sh

# Testing in production environment
./test-jotform-to-sendmsg.sh prod
```

### Testing the Sharoni-specific Integration
```bash
# Testing in local development environment
./test-sharoni-endpoint.sh

# Testing in production environment
./test-sharoni-endpoint.sh prod
```

Before testing the production environment, update the URL in the test scripts:
```bash
PROD_URL="https://[your-actual-domain].vercel.app/api/jotform-to-sendmsg"
```

## FAQ

### Can additional fields be added to SendMsg?
Currently, the integration supports the following fields:
- Name (parameter 4)
- Email (parameter email)
- Cell phone (parameter cellphone)
- Birth date (parameter 6)
- Form ID (parameter form)

If you need to add additional fields, you need to update the code in route.ts.

### Does the integration work with form types other than JotForm?
Currently, the integration is specifically tailored to the JotForm format. If support for other form types is needed, separate endpoints should be created or the logic adapted for additional formats. 